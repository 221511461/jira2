import { chain, difference } from "lodash";
import { NextFunction, Request, Response } from "express";
import { Subscription } from "models/subscription";
import { GitHubServerApp } from "models/github-server-app";
import { sendAnalytics } from "utils/analytics-client";
import { AnalyticsEventTypes, AnalyticsScreenEventsEnum } from "interfaces/common";
import { Errors } from "config/errors";
import { booleanFlag, BooleanFlags } from "config/feature-flags";
import {
	countNumberSkippedRepos,
	countStatus,
	getConnectionsAndInstallations
} from "utils/github-installations-helper";


const renderJiraCloudAndEnterpriseServer = async (res: Response, req: Request): Promise<void> => {

	const { jiraHost, nonce } = res.locals;

	const subscriptions = await Subscription.getAllForHost(jiraHost);
	const gheServers: GitHubServerApp[] = await GitHubServerApp.findForInstallationId(res.locals.installation.id) || [];

	// Separating the subscriptions for GH cloud and GHE servers
	const ghCloudSubscriptions = subscriptions.filter(subscription => !subscription.gitHubAppId);
	const gheServerSubscriptions = difference(subscriptions, ghCloudSubscriptions);

	// Connections for GHCloud
	const {
		installations,
		successfulConnections: successfulCloudConnections,
		failedConnections: failedCloudConnections
	} = await getConnectionsAndInstallations(ghCloudSubscriptions, req);

	// Connections for GH Enterprise
	const gheServersWithConnections = await Promise.all(gheServers.map(async (server: GitHubServerApp) => {
		const subscriptionsForServer = gheServerSubscriptions.filter(subscription => subscription.gitHubAppId === server.id);
		const { installations, successfulConnections, failedConnections } = await getConnectionsAndInstallations(subscriptionsForServer, req, server.id);

		/**
		 * Directly fetching the values using `dataValues`,
		 * Couldn't get the value using `{plan: true}`, it throws a crypto error,
		 */
		return { ...(server as any).dataValues, successfulConnections, failedConnections, installations };
	}));

	// Grouping the list of servers by `gitHubBaseUrl`
	const groupedGheServers = chain(gheServersWithConnections).groupBy("gitHubBaseUrl")
		.map((value, key) => ({
			gitHubBaseUrl: key,
			applications: value
		})).value();

	const hasConnections =  !!(installations.total || gheServers?.length);

	const useNewSPAExperience = await booleanFlag(BooleanFlags.USE_NEW_5KU_SPA_EXPERIENCE, jiraHost);
	if (useNewSPAExperience && !hasConnections) {
		res.redirect("/spa?from=homepage");
	} else {
		res.render("jira-configuration.hbs", {
			host: jiraHost,
			gheServers: groupedGheServers,
			ghCloud: { successfulCloudConnections, failedCloudConnections },
			hasCloudAndEnterpriseServers: !!((successfulCloudConnections.length || failedCloudConnections.length) && gheServers.length),
			hasCloudServers: !!(successfulCloudConnections.length || failedCloudConnections.length),
			hasConnections,
			useNewSPAExperience,
			APP_URL: process.env.APP_URL,
			csrfToken: req.csrfToken(),
			nonce
		});
	}

	const successfulServerConnections = gheServersWithConnections
		.reduce((acc, obj) => acc + obj.successfulConnections?.length, 0);
	const allSuccessfulConnections = [...successfulCloudConnections, ...gheServersWithConnections];
	const completeConnections = allSuccessfulConnections.filter(connection => connection.syncStatus === "FINISHED");

	await sendAnalytics(jiraHost, AnalyticsEventTypes.ScreenEvent, {
		name: AnalyticsScreenEventsEnum.GitHubConfigScreenEventName
	}, {
		jiraHost,
		pageExperience: useNewSPAExperience ? "spa" : "",
		connectedOrgCountCloudCount: successfulCloudConnections.length,
		connectedOrgCountServerCount: successfulServerConnections,
		totalOrgCount: successfulCloudConnections.length + successfulServerConnections,
		failedCloudBackfillCount: countStatus(successfulCloudConnections, "FAILED"),
		failedServerBackfillCount: countStatus(gheServersWithConnections, "FAILED"),
		successfulCloudBackfillCount: countStatus(successfulCloudConnections, "FINISHED"),
		successfulServerBackfillCount: countStatus(gheServersWithConnections, "FINISHED"),
		numberOfSkippedRepos: countNumberSkippedRepos(completeConnections),
		hasConnections
	});
};


export const JiraGet = async (
	req: Request,
	res: Response,
	next: NextFunction
): Promise<void> => {
	try {
		const { jiraHost } = res.locals;
		if (!jiraHost) {
			req.log.warn({ jiraHost, req, res }, Errors.MISSING_JIRA_HOST);
			res.status(400).send(Errors.MISSING_JIRA_HOST);
			return;
		}

		req.log.debug("Received jira configuration page request");

		await renderJiraCloudAndEnterpriseServer(res, req);
		req.log.debug("Jira configuration rendered successfully.");
	} catch (error) {
		return next(new Error(`Failed to render Jira configuration: ${error}`));
	}
};
