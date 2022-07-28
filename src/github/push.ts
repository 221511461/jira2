import { enqueuePush } from "../transforms/push";
import { getCurrentTime } from "utils/webhook-utils";
import { hasJiraIssueKey } from "utils/jira-utils";
import { booleanFlag, BooleanFlags } from "config/feature-flags";
import { updateRepoConfig } from "services/user-config-service";
import { GitHubPushData } from "../interfaces/github";
import { WebhookContext } from "../routes/github/webhook/webhook-context";
import { RepoSyncState } from "models/reposyncstate";
import {Subscription} from "models/subscription";


export const pushWebhookHandler = async (context: WebhookContext, jiraClient, _util, gitHubInstallationId: number, subscription: Subscription): Promise<void> => {
	const webhookReceived = getCurrentTime();

	// Copy the shape of the context object for processing
	// but filter out any commits that don't have issue keys
	// so we don't have to process them.
	const payload: GitHubPushData = {
		webhookId: context.id,
		webhookReceived,
		repository: context.payload?.repository,
		commits: context.payload?.commits?.reduce((acc, commit) => {
			if (hasJiraIssueKey(commit.message)) {
				acc.push(commit);
			}
			return acc;
		}, []),
		installation: context.payload?.installation
	};

	context.log = context.log.child({
		jiraHost: jiraClient.baseURL,
		gitHubInstallationId
	});

	if (await booleanFlag(BooleanFlags.CONFIG_AS_CODE, false, jiraClient.baseURL)) {
		const repoSyncState = await RepoSyncState.findByRepoId(subscription, payload.repository.id);
		const modifiedFiles = context.payload?.commits?.reduce((acc, commit) =>
			([...acc, ...commit.added, ...commit.modified, ...commit.removed]), []);
		await updateRepoConfig(repoSyncState, githubInstallationId, modifiedFiles);
	}

	if (!payload.commits?.length) {
		context.log.info(
			{noop: "no_commits"},
			"Halting further execution for push since no commits were found for the payload"
		);
		return;
	}

	context.log.info("Enqueueing push event");
	await enqueuePush(payload, jiraClient.baseURL);
};
