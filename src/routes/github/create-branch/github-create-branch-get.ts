import { NextFunction, Request, Response } from "express";
import { Errors } from "config/errors";
import {
	replaceSpaceWithHyphenHelper
} from "utils/handlebars/handlebar-helpers";
import { createInstallationClient, createUserClient } from "utils/get-github-client-config";
import { sendAnalytics } from "utils/analytics-client";
import { AnalyticsEventTypes, AnalyticsScreenEventsEnum } from "interfaces/common";
import { Subscription } from "models/subscription";
import Logger from "bunyan";
import { RepositoryNode } from "../../../github/client/github-queries";
const MAX_REPOS_RETURNED = 20;

// TODO: need to update this later with actual data later on
const servers = [{ id: 1, server: "http://github.internal.atlassian.com", appName: "ghe-app" }, { id: 2, server: "http://github.external.atlassian.com", appName: "ghe-app-2" }];

export const GithubCreateBranchGet = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	const {
		jiraHost,
		githubToken,
		gitHubAppConfig
	} = res.locals;

	if (!githubToken) {
		return next(new Error(Errors.MISSING_GITHUB_TOKEN));
	}

	const { issue_key: key, issue_summary: summary } = req.query;
	if (!key) {
		return next(new Error(Errors.MISSING_ISSUE_KEY));
	}

	const subscriptions = await Subscription.getAllForHost(jiraHost);

	// TODO - this should redirect to a you are not configured page instead.
	if (!subscriptions) {
		return next(new Error(Errors.MISSING_CONFIGURAITON));
	}

	const branchSuffix = summary ? replaceSpaceWithHyphenHelper(summary as string) : "";
	const gitHubUserClient = await createUserClient(githubToken, jiraHost, req.log, gitHubAppConfig.gitHubAppId);
	const gitHubUser = (await gitHubUserClient.getUser()).data.login;
	const orgs = (await Subscription.getConnectedOrgs(jiraHost)).map(sub => sub.repoOwner);
	const repos = await getReposBySubscriptions(subscriptions, jiraHost, gitHubAppConfig.gitHubAppId, req.log);

	res.render("github-create-branch.hbs", {
		csrfToken: req.csrfToken(),
		jiraHost,
		nonce: res.locals.nonce,
		issue: {
			branchName: `${key}-${branchSuffix}`,
			key
		},
		servers,
		orgs,
		repos,
		gitHubUser
	});

	req.log.debug(`Github Create Branch Page rendered page`);

	sendAnalytics(AnalyticsEventTypes.ScreenEvent, {
		name: AnalyticsScreenEventsEnum.CreateBranchScreenEventName,
		jiraHost
	});
};

const sortByDateString = (a, b) => {
	return new Date(b).valueOf() - new Date(a).valueOf();
};

const getReposBySubscriptions = async (subscriptions: Subscription[], jiraHost: string, gitHubAppId: number | undefined, logger: Logger): Promise<RepositoryNode[]> => {
	const repoTasks = subscriptions.map(async (subscription) => {
		const gitHubInstallationClient = await createInstallationClient(subscription.gitHubInstallationId, jiraHost, logger, gitHubAppId);
		const response = await gitHubInstallationClient.getRepositoriesPage(MAX_REPOS_RETURNED,undefined,  'UPDATED_AT');
		return response.viewer.repositories.edges;
	});

	const repos = (await Promise.all(repoTasks))
		.flat()
		.sort(sortByDateString);

	return repos.slice(0, MAX_REPOS_RETURNED);
};
