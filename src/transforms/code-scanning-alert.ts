import { jiraIssueKeyParser } from "utils/jira-utils";
import {Context} from "probot/lib/context";
import {JiraRemoteLinkData, JiraRemoteLinkStatusAppearance} from "interfaces/jira";

const MAX_STRING_LENGTH = 255;

const getPullRequestTitle = async (repoName: string, prId: number, repoOwner: string, context: Context): Promise<string> => {
	const response = await context.github.pulls.get({
		owner: repoOwner,
		repo: repoName,
		pull_number: prId
	});

	if (response.status !== 200) {
		context.log.warn(`Received error when querying for Pull Request information: ${JSON.stringify(response.data)}`);
		return "";
	} else {
		return response.data.title;
	}
}

const getEntityTitle = async (ref: string, repoName: string, repoOwner: string, context: Context): Promise<string> => {
	// ref can either be a branch reference or a PR reference
	const components = ref.split("/")
	switch (components[1]) {
		case "heads": // branch
			// The branch name may contain forward slashes! Rejoin them
			return Promise.resolve(components.slice(2).join("/"));
		case "pull": // pull request
			return await getPullRequestTitle(repoName, parseInt(components[2]), repoOwner, context);
		default:
			context.log.error(`Could not interpret reference from code_scanning_alert: ${ref}`);
			return Promise.resolve("");
	}
}

// Status can be one of three things from the code_scanning_alert webhook: open, fixed, or dismissed
const transformStatusToAppearance = (status: string, context: Context): JiraRemoteLinkStatusAppearance => {
	switch (status) {
		case "open":
			return "removed"; // red
		case "fixed":
			return "success"; // green
		case "dismissed":
			return "moved"; // yellow
		default:
			context.log.info(`Received unknown status from code_scanning_alert webhook: ${status}`);
			return "default";
	}
}

export default async (context: Context): Promise<JiraRemoteLinkData | undefined> => {
	const {action, alert, ref, repository} = context.payload;

	// Grab branch names or PR titles
	const entityTitles: string[] = [];
	if (action === "closed_by_user" || action === "reopened_by_user") {
		// These are manual operations done by users and are not associated to a specific Issue.
		// The webhook contains ALL instances of this alert, so we need to grab the ref from each instance.
		entityTitles.push(...await Promise.all(alert.instances.map(
			(instance) => getEntityTitle(instance.ref, repository.name, repository.owner.login, context))
		));
	} else {
		// The action is associated with a single branch/PR
		entityTitles.push(await getEntityTitle(ref, repository.name, repository.owner.login, context));
	}

	const issueKeys = entityTitles.flatMap((entityTitle) => jiraIssueKeyParser(entityTitle) ?? []);
	if (issueKeys.length === 0) {
		return Promise.resolve(undefined);
	}

	return Promise.resolve({
		remoteLinks: [{
			schemaVersion: "1.0",
			id: `${repository.id.toString()}-${alert.number}`,
			updateSequenceNumber: Date.now(),
			displayName: `Alert #${alert.number}`,
			description: alert.rule.description.substring(0, MAX_STRING_LENGTH),
			url: alert.html_url,
			type: "security",
			status: {
				appearance: transformStatusToAppearance(alert.most_recent_instance.state, context),
				label: alert.most_recent_instance.state
			},
			lastUpdated: alert.created_at,
			associations: [{
				associationType: "issueKeys",
				values: issueKeys
			}]
		}]
	});
};
