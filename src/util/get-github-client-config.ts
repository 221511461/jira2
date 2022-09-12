import { GitHubServerApp } from "models/github-server-app";
import { GitHubInstallationClient } from "../github/client/github-installation-client";
import { getInstallationId } from "../github/client/installation-id";
import { booleanFlag, BooleanFlags, GHE_SERVER_GLOBAL, stringFlag, StringFlags } from "config/feature-flags";
import { GitHubUserClient } from "../github/client/github-user-client";
import Logger from "bunyan";
import { GitHubAppClient } from "../github/client/github-app-client";
import { envVars } from "~/src/config/env";
import * as PrivateKey from "probot/lib/private-key";
import { keyLocator } from "~/src/github/client/key-locator";
import { GitHubConfig } from "~/src/github/client/github-client";

export const GITHUB_CLOUD_BASEURL = "https://github.com";
export const GITHUB_CLOUD_API_BASEURL = "https://api.github.com";
export const GITHUB_ACCEPT_HEADER = "application/vnd.github.v3+json";

interface GitHubClientConfig extends GitHubConfig {
	serverId?: number;
	appId: number;
	privateKey: string;
	gitHubClientId: string;
	gitHubClientSecret: string;
}

export async function getGitHubApiUrl(jiraHost: string, gitHubAppId: number, logger: Logger) {
	const gitHubClientConfig = await getGitHubClientConfigFromAppId(gitHubAppId, logger, jiraHost);
	return await booleanFlag(BooleanFlags.GHE_SERVER, GHE_SERVER_GLOBAL, jiraHost) && gitHubClientConfig
		? `${gitHubClientConfig.apiUrl}`
		: GITHUB_CLOUD_API_BASEURL;
}

/**
 * Decides whether to use the proxy URL and which one if so.
 *
 * @param jiraHost - jiraHost from context
 * @param gitHubBaseUrl - for cloud, either undefined or "github.com"'s base url
 * @param logger
 *
 * @return proxy URL or undefined (do not use)
 */
async function calculateProxyBaseUrl(jiraHost: string, gitHubBaseUrl: string | undefined, logger: Logger): Promise<string | undefined> {
	if (!await booleanFlag(BooleanFlags.USE_OUTBOUND_PROXY_SKIPLIST, false, jiraHost)) {
		return undefined;
	}

	if (gitHubBaseUrl && gitHubBaseUrl != GITHUB_CLOUD_BASEURL) {
		const skipList = await stringFlag(StringFlags.OUTBOUND_PROXY_SKIPLIST, "", jiraHost);
		let skipOutboundProxy;
		try {
			skipOutboundProxy = skipList
				.split(',')
				.filter(hostname => !!hostname)
				.map(hostname => hostname.trim())
				.map(hostname => hostname.indexOf("://") >= 0 ? hostname : "http://" + hostname)
				.map(hostname => new URL(hostname).host.toLowerCase())
				.indexOf(new URL(gitHubBaseUrl).host.trim().toLowerCase()) >= 0;
		} catch (err) {
			logger.error({ err }, "Cannot evaluate skiplist because of a error, opting for outboundproxy for good");
			skipOutboundProxy = false;
		}
		if (skipOutboundProxy) {
			return undefined;
		}
	}
	return envVars.PROXY;
}

export const getGitHubClientConfigFromAppId = async (gitHubAppId: number | undefined, logger: Logger, jiraHost: string): Promise<GitHubClientConfig> => {
	const gitHubServerApp = gitHubAppId && await GitHubServerApp.getForGitHubServerAppId(gitHubAppId);
	if (gitHubServerApp) {
		return {
			serverId: gitHubServerApp.id,
			hostname: gitHubServerApp.gitHubBaseUrl,
			baseUrl: gitHubServerApp.gitHubBaseUrl,
			apiUrl: `${gitHubServerApp.gitHubBaseUrl}/api/v3`,
			graphqlUrl: `${gitHubServerApp.gitHubBaseUrl}/api/graphql`,
			appId: gitHubServerApp.appId,
			gitHubClientId: gitHubServerApp.gitHubClientId,
			gitHubClientSecret: await gitHubServerApp.decrypt("gitHubClientSecret"),
			privateKey: await gitHubServerApp.decrypt("privateKey"),
			proxyBaseUrl: await calculateProxyBaseUrl(jiraHost, gitHubServerApp.gitHubBaseUrl, logger)
		};
	}
	// cloud config
	const privateKey = await booleanFlag(BooleanFlags.GHE_SERVER, GHE_SERVER_GLOBAL, jiraHost)? await keyLocator(undefined): PrivateKey.findPrivateKey();
	if (!privateKey) {
		throw new Error("Private key not found for github cloud");
	}
	return {
		hostname: GITHUB_CLOUD_BASEURL,
		baseUrl: GITHUB_CLOUD_API_BASEURL,
		apiUrl: GITHUB_CLOUD_API_BASEURL,
		graphqlUrl: `${GITHUB_CLOUD_API_BASEURL}/graphql`,
		appId: parseInt(envVars.APP_ID),
		gitHubClientId: envVars.GITHUB_CLIENT_ID,
		gitHubClientSecret: envVars.GITHUB_CLIENT_SECRET,
		privateKey: privateKey,
		proxyBaseUrl: await calculateProxyBaseUrl(jiraHost, undefined, logger)
	};
};

/**
 * Factory function to create a GitHub client that authenticates as the installation of our GitHub app to
 * get all installation or get more info for the app
 */
export async function createAppClient(logger: Logger, jiraHost: string, gitHubAppId: number | undefined): Promise<GitHubAppClient> {
	const gitHubClientConfig = await getGitHubClientConfigFromAppId(gitHubAppId, logger, jiraHost);
	return await booleanFlag(BooleanFlags.GHE_SERVER, GHE_SERVER_GLOBAL, jiraHost)
		? new GitHubAppClient(gitHubClientConfig, logger, gitHubClientConfig.appId.toString(), gitHubClientConfig.privateKey)
		: new GitHubAppClient(gitHubClientConfig, logger);
}

/**
 * Factory function to create a GitHub client that authenticates as the installation of our GitHub app to get
 * information specific to an organization.
 */
export async function createInstallationClient(gitHubInstallationId: number, jiraHost: string, logger: Logger, gitHubAppId: number | undefined): Promise<GitHubInstallationClient> {
	const gitHubClientConfig = await getGitHubClientConfigFromAppId(gitHubAppId, logger, jiraHost);
	if (await booleanFlag(BooleanFlags.GHE_SERVER, GHE_SERVER_GLOBAL, jiraHost)) {
		return new GitHubInstallationClient(getInstallationId(gitHubInstallationId, gitHubClientConfig.baseUrl, gitHubClientConfig.appId), gitHubClientConfig, logger, gitHubClientConfig.serverId);
	} else {
		return new GitHubInstallationClient(getInstallationId(gitHubInstallationId), gitHubClientConfig, logger);
	}
}

/**
 * Factory function to create a GitHub client that authenticates as the user (with a user access token).
 */
export async function createUserClient(githubToken: string, jiraHost: string, logger: Logger, gitHubAppId: number | undefined): Promise<GitHubUserClient> {
	const gitHubClientConfig = await getGitHubClientConfigFromAppId(gitHubAppId, logger, jiraHost);
	return new GitHubUserClient(githubToken, gitHubClientConfig, logger);
}
