import { NextFunction, Request, Response } from "express";
import { Errors } from "config/errors";
import { Subscription } from "~/src/models/subscription";
import { GitHubServerApp } from "~/src/models/github-server-app";
import { getGitHubApiUrl } from "utils/get-github-client-config";
import axios from "axios";
import Logger from "bunyan";

export const GithubCreateBranchOptionsGet = async (req: Request, res: Response, next: NextFunction): Promise<void> => {

	const { jiraHost } = res.locals;
	const { issueKey } = req.query;
	const { githubToken } = req.session;

	if (!jiraHost) {
		req.log.warn({ req, res }, Errors.MISSING_JIRA_HOST);
		res.status(400).send(Errors.MISSING_JIRA_HOST);
		return next();
	}

	if (!issueKey) {
		return next(new Error(Errors.MISSING_ISSUE_KEY));
	}

	const servers = await getGitHubServers(jiraHost);

	try {
		const url = new URL(`${req.protocol}://${req.get("host")}${req.originalUrl}`);
		if (githubToken && servers.hasCloudServer && servers.gheServerInfos.length == 0) {
			await validateGitHubToken(jiraHost, githubToken, req.log);
			res.redirect(`/github/create-branch${url.search}`);
			return;
		}
		// Only single GitHub Enterprise connected
		if (githubToken && !servers.hasCloudServer && servers.gheServerInfos.length == 1) {
			const gitHubServerApp = await GitHubServerApp.findForUuid(servers.gheServerInfos[0].uuid);
			const gitHubAppId = gitHubServerApp?.id || undefined;
			await validateGitHubToken(jiraHost, githubToken, req.log, gitHubAppId);
			res.redirect(`/github/${servers.gheServerInfos[0].uuid}/create-branch${url.search}`);
			return;
		}
	} catch (err) {
		req.log.error("Invalid github token");
	}

	res.render("github-create-branch-options.hbs", {
		nonce: res.locals.nonce,
		servers
	});

};

const validateGitHubToken = async (jiraHost: string, githubToken: string, logger: Logger, gitHubAppId?: number) => {
	const githubUrl = await getGitHubApiUrl(jiraHost, gitHubAppId, logger);
	await axios.get(githubUrl, {
		headers: {
			Authorization: `Bearer ${githubToken}`
		}
	});
};

const getGitHubServers = async (jiraHost: string) => {
	const subscriptions = await Subscription.getAllForHost(jiraHost);
	const ghCloudSubscriptions = subscriptions.filter(subscription => !subscription.gitHubAppId);
	const gheServerSubscriptions = subscriptions.filter(subscription => subscription.gitHubAppId);

	const gheServerInfos = new Array<{ uuid: string, baseUrl: string, appName: string }>();
	for (const subscription of gheServerSubscriptions) {
		if (subscription.gitHubAppId) {
			const gitHubServerApp = await GitHubServerApp.getForGitHubServerAppId(subscription.gitHubAppId);
			if (gitHubServerApp) {
				gheServerInfos.push({
					"uuid": gitHubServerApp.uuid,
					"baseUrl": gitHubServerApp.gitHubBaseUrl,
					"appName": gitHubServerApp.gitHubAppName
				});
			}
		}
	}

	return {
		hasCloudServer: ghCloudSubscriptions.length,
		gheServerInfos
	};
};


