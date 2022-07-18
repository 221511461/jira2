import { InvalidPermissionsError, BlockedIpError, GithubClientError, GithubClientTimeoutError, RateLimitingError } from "./github-client-errors";
import Logger from "bunyan";
import { statsd } from "config/statsd";
import { metricError } from "config/metric-names";
import { AxiosError, AxiosRequestConfig } from "axios";
import { extractPath } from "../../jira/client/axios";
import { numberFlag, NumberFlags } from "config/feature-flags";
import { getCloudOrServerFromHost } from "utils/get-cloud-or-server";

const RESPONSE_TIME_HISTOGRAM_BUCKETS = "100_1000_2000_3000_5000_10000_30000_60000";

/**
 * Enrich the config object to include the time that the request started.
 *
 * @param {import("axios").AxiosRequestConfig} config - The Axios request configuration object.
 * @returns {import("axios").AxiosRequestConfig} The enriched config object.
 */
export const setRequestStartTime = (config) => {
	config.requestStartTime = new Date();
	return config;
};

/**
 * Sets the timeout to the request based on the github-client-timeout feature flag
 */
export const setRequestTimeout = async (config: AxiosRequestConfig): Promise<AxiosRequestConfig> => {
	const timeout = await numberFlag(NumberFlags.GITHUB_CLIENT_TIMEOUT, 60000);
	//Check if timeout is set already explicitly in the call
	if (!config.timeout && timeout) {
		config.timeout = timeout;
	}
	return config;
};

//TODO Move to util/axios/common-github-webhook-middleware.ts and use with Jira Client
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sendResponseMetrics = (metricName: string, gitHubVersion: string, response?: any, status?: string | number) => {
	status = `${status || response?.status}`;
	const requestDurationMs = Number(
		Date.now() - (response?.config?.requestStartTime || 0)
	);

	// using client tag to separate GH client from Octokit
	const tags = {
		client: "axios",
		gitHubVersion,
		method: response?.config?.method?.toUpperCase(),
		path: extractPath(response?.config?.originalUrl),
		status: status
	};

	statsd.histogram(metricName, requestDurationMs, tags);
	tags["gsd_histogram"] = RESPONSE_TIME_HISTOGRAM_BUCKETS;
	statsd.histogram(metricName, requestDurationMs, tags);
	return response;
};

export const instrumentRequest = (metricName, host) =>
	(response) => {
		if (!response) {
			return;
		}
		const gitHubVersion = getCloudOrServerFromHost(host);
		return sendResponseMetrics(metricName, gitHubVersion, response);
	};

/**
 * Submit statsd metrics on failed requests.
 *
 * @param {import("axios").AxiosError} error - The Axios error response object.
 * @param metricName - Name for the response metric
 * @param host - The rest API url for cloud/server
 * @returns {Promise<Error>} a rejected promise with the error inside.
 */
export const instrumentFailedRequest = (metricName: string, host: string) =>
	(error) => {
		const gitHubVersion = getCloudOrServerFromHost(host);
		if (error instanceof RateLimitingError) {
			sendResponseMetrics(metricName, gitHubVersion, error.cause?.response, "rateLimiting");
		} else if (error instanceof BlockedIpError) {
			sendResponseMetrics(metricName, gitHubVersion, error.cause?.response, "blockedIp");
			statsd.increment(metricError.blockedByGitHubAllowlist, { gitHubVersion });
		} else if (error instanceof GithubClientTimeoutError) {
			sendResponseMetrics(metricName, gitHubVersion, error.cause?.response, "timeout");
		} else if (error instanceof GithubClientError) {
			sendResponseMetrics(metricName, gitHubVersion, error.cause?.response);
		} else {
			sendResponseMetrics(metricName, gitHubVersion, error.response);
		}
		return Promise.reject(error);
	};

export const handleFailedRequest = (logger: Logger) =>
	(error: AxiosError) => {
		const { response, config, request } = error;
		const requestId = response?.headers?.["x-github-request-id"];
		logger = logger.child({ res: response, config, req: request, err: error, requestId });

		if (response?.status === 408 || error.code === "ETIMEDOUT") {
			logger.warn("Request timed out");
			return Promise.reject(new GithubClientTimeoutError(error));
		}

		if (response) {
			const status = response?.status;
			const errorMessage = `Error executing Axios Request ` + error.message;

			const rateLimitRemainingHeaderValue: string = response.headers?.["x-ratelimit-remaining"];
			if (status === 403 && rateLimitRemainingHeaderValue == "0") {
				logger.warn("Rate limiting error");
				return Promise.reject(new RateLimitingError(response, error));
			}

			if (status === 403 && response.data?.message?.includes("has an IP allow list enabled")) {
				logger.warn({ remote: response.data?.message }, "Blocked by GitHub allowlist");
				return Promise.reject(new BlockedIpError(error, status));
			}

			if (status === 403 && response.data?.message?.includes("Resource not accessible by integration")) {
				logger.warn({
					err: error,
					remote: response.data?.message
				}, "unauthorized");
				return Promise.reject(new InvalidPermissionsError(error, status));
			}
			const isWarning = status && (status >= 300 && status < 500 && status !== 400);

			(isWarning ? logger.warn : logger.error)(errorMessage);
			return Promise.reject(new GithubClientError(errorMessage, status, error));
		}

		return Promise.reject(error);
	};
