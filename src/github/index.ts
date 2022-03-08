import issueComment from "./issue-comment";
import issue from "./issue";
import middleware from "./middleware";
import { pullRequestWebhookHandler } from "./pull-request";
import { workflowWebhookHandler } from "./workflow";
import deployment from "./deployment";
import push from "./push";
import { createBranch, deleteBranch } from "./branch";
import webhookTimeout from "../util/webhook-timeout";
import statsd from "../config/statsd";
import { metricWebhooks } from "../config/metric-names";
import { Application } from "probot";
import { deleteRepository } from "./repository";

export default (robot: Application) => {
	// TODO: Need ability to remove these listeners, especially for testing...
	robot.on("*", async (context) => {
		const { name, payload, id } = context;

		context.log.info({ event: name, action: payload.action, webhookId: id }, "Event received");

		const tags = [
			"name: webhooks",
			`event: ${name}`,
			`action: ${payload.action}`
		];

		statsd.increment(metricWebhooks.webhookEvent, tags);
	});

	robot.on(
		["issue_comment.created", "issue_comment.edited"],
		webhookTimeout(middleware(issueComment))
	);

	robot.on(["issues.opened", "issues.edited"], middleware(issue));

	robot.on("push", middleware(push));

	robot.on(
		[
			"pull_request.opened",
			"pull_request.closed",
			"pull_request.reopened",
			"pull_request.edited",
			"pull_request_review"
		],
		middleware(pullRequestWebhookHandler)
	);

	robot.on("workflow_run", middleware(workflowWebhookHandler));

	robot.on("deployment_status", middleware(deployment));

	robot.on("create", middleware(createBranch));
	robot.on("delete", middleware(deleteBranch));

	robot.on("repository.deleted", middleware(deleteRepository));
};
