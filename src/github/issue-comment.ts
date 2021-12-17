import JiraClient from "../models/jira-client";
import { emitWebhookProcessedMetrics } from "../util/webhooks";
import { CustomContext } from "./middleware";

export default async (
	context: CustomContext,
	_: JiraClient,
	util
): Promise<void> => {
	const { comment } = context.payload;
	let linkifiedBody;

	try {
		linkifiedBody = await util.unfurl(comment.body);
		if (!linkifiedBody) {
			context.log.debug(
				{ noop: "no_linkified_body_issue_comment" },
				"Halting further execution for issueComment since linkifiedBody is empty"
			);
			return;
		}
	} catch (err) {
		context.log.warn(
			{ err, linkifiedBody, body: comment.body },
			"Error while trying to find Jira keys in comment body"
		);
	}

	const editedComment = context.issue({
		body: linkifiedBody,
		comment_id: comment.id,
	});

	console.log("HERE: ", editedComment)
	context.log(`Updating comment in GitHub with ID ${comment.id}`);

	const githubResponse = await context.github.issues.updateComment(
		editedComment
	);
	const { webhookReceived, name, log } = context;

	webhookReceived && emitWebhookProcessedMetrics(
		webhookReceived,
		name,
		log,
		githubResponse?.status
	);
};
