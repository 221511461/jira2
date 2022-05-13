import Logger from "bunyan";
import { Octokit } from "@octokit/rest";
import axios, { AxiosInstance, AxiosRequestConfig, AxiosRequestHeaders, AxiosResponse } from "axios";
import { AppTokenHolder } from "./app-token-holder";
import { handleFailedRequest, instrumentFailedRequest, instrumentRequest, setRequestStartTime, setRequestTimeout } from "./github-client-interceptors";
import { metricHttpRequest } from "config/metric-names";
import { getLogger } from "config/logger";
import { urlParamsMiddleware } from "utils/axios/url-params-middleware";
import * as PrivateKey from "probot/lib/private-key";
import { envVars } from "config/env";
import { AuthToken } from "~/src/github/client/auth-token";

/**
 * A GitHub client that supports authentication as a GitHub app.
 *
 * @see https://docs.github.com/en/developers/apps/building-github-apps/authenticating-with-github-apps
 */
export class GitHubAppClient {
	private readonly axios: AxiosInstance;
	private readonly appToken: AuthToken;
	private readonly logger: Logger;

	constructor(
		logger: Logger,
		appId = envVars.APP_ID,
		baseURL = "https://api.github.com"
	) {
		this.logger = logger || getLogger("github.app.client");
		// TODO - change this for GHE, to get from github apps table
		const privateKey = PrivateKey.findPrivateKey() || "";

		this.appToken = AppTokenHolder.createAppJwt(privateKey, appId);
		this.axios = axios.create({
			baseURL,
			transitional: {
				clarifyTimeoutError: true
			}
		});

		this.axios.interceptors.request.use(setRequestStartTime);
		this.axios.interceptors.request.use(setRequestTimeout);
		this.axios.interceptors.request.use(urlParamsMiddleware);
		this.axios.interceptors.response.use(
			undefined,
			handleFailedRequest(this.logger)
		);
		this.axios.interceptors.response.use(
			instrumentRequest(metricHttpRequest.github),
			instrumentFailedRequest(metricHttpRequest.github)
		);

		this.axios.interceptors.request.use((config: AxiosRequestConfig) => {
			return {
				...config,
				headers: {
					...config.headers,
					...this.appAuthenticationHeaders()
				}
			};
		});
	}

	public getUserMembershipForOrg = async (username: string, org: string): Promise<AxiosResponse<Octokit.OrgsGetMembershipResponse>> => {
		return await this.axios.get<Octokit.OrgsGetMembershipResponse>(`/orgs/{org}/memberships/{username}`, {
			urlParams: {
				username,
				org
			}
		});
	};

	public getApp = async (): Promise<AxiosResponse<Octokit.AppsGetAuthenticatedResponse>> => {
		return await this.axios.get<Octokit.AppsGetAuthenticatedResponse>(`/app`, {});
	};

	/**
	 * Use this config in a request to authenticate with the app token.
	 */
	private appAuthenticationHeaders(): Partial<AxiosRequestHeaders> {
		return {
			Accept: "application/vnd.github.v3+json",
			Authorization: `Bearer ${this.appToken.token}`
		};
	}

	public getInstallation = async (installationId: number): Promise<AxiosResponse<Octokit.AppsGetInstallationResponse>> => {
		return await this.axios.get<Octokit.AppsGetInstallationResponse>(`/app/installations/{installationId}`, {
			urlParams: {
				installationId
			}
		});
	};

	public getInstallations = async (): Promise<AxiosResponse<Octokit.AppsGetInstallationResponse>> => {
		return await this.axios.get<Octokit.AppsGetInstallationResponse>(`/app/installations`, {});
	};

}
