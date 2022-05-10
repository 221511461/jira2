import { createWebhookApp } from "test/utils/probot";
import { Application } from "probot";
import { Installation } from "models/installation";
import { Subscription } from "models/subscription";
import repositoryWebhook from "fixtures/repository-webhook.json";

describe("Repository Webhook", () => {
	let app: Application;
	const gitHubInstallationId = 1234;

	beforeEach(async () => {
		app = await createWebhookApp();

		await Subscription.create({
			gitHubInstallationId,
			jiraHost
		});

		await Installation.create({
			jiraHost,
			clientKey: "client-key",
			sharedSecret: "shared-secret"
		});

		githubUserTokenNock(gitHubInstallationId);
	});

	it("should work", async () => {
		app.receive(repositoryWebhook)
	});

	// it("should update the Jira issue with the linked GitHub workflow_run", async () => {
	//
	// 	jiraNock.post("/rest/builds/0.1/bulk", {
	// 		builds:
	// 			[
	// 				{
	// 					schemaVersion: "1.0",
	// 					pipelineId: 9751894,
	// 					buildNumber: 84,
	// 					updateSequenceNumber: 12345678,
	// 					displayName: "My Deployment flow",
	// 					url: "test-repo-url",
	// 					state: "in_progress",
	// 					lastUpdated: "2021-06-28T03:53:34Z",
	// 					issueKeys: ["TES-123"],
	// 					references:
	// 						[
	// 							{
	// 								commit:
	// 									{
	// 										id: "ec26c3e57ca3a959ca5aad62de7213c562f8c821",
	// 										repositoryUri: "https://api.github.com/repos/test-repo-owner/test-repo-name"
	// 									},
	// 								ref:
	// 									{
	// 										name: "changes",
	// 										uri: "https://api.github.com/repos/test-repo-owner/test-repo-name/tree/changes"
	// 									}
	// 							}
	// 						]
	// 				}
	// 			],
	// 		properties:
	// 			{
	// 				gitHubInstallationId: 1234,
	// 				repositoryId: "test-repo-id"
	// 			},
	// 		providerMetadata:
	// 			{
	// 				product: "GitHub Actions"
	// 			}
	// 	}).reply(200);
	//
	// 	mockSystemTime(12345678);
	//
	// 	await expect(app.receive(workflowBasicFixture)).toResolve();
	// });
});
