import { Context, MessageHandler } from "./index";
import { processPush } from "../transforms/push";
import { wrapLogger } from "probot/lib/wrap-logger";
import { GitHubAppClient } from "../github/client/github-app-client";
import { getCloudInstallationId } from "../github/client/installation-id";

export type PayloadRepository = {
	id: number,
	name: string,
	full_name: string,
	html_url: string,
	owner: { name: string, login: string },
}

export type PushQueueMessagePayload = {
	repository: PayloadRepository,
	shas: { id: string, issueKeys: string[] }[],
	jiraHost: string,
	installationId: number,
	webhookId: string,
	webhookReceived?: number,
}

export const pushQueueMessageHandler: MessageHandler<PushQueueMessagePayload> = async (context: Context<PushQueueMessagePayload>) => {
	context.log.info("Handling push message from the SQS queue");
	const github = new GitHubAppClient(getCloudInstallationId(context.payload.installationId), context.log);
	await processPush(github, context.payload, wrapLogger(context.log));
};
