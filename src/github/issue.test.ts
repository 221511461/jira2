/* eslint-disable @typescript-eslint/no-explicit-any */
import { createWebhookApp } from "test/utils/probot";
import { Installation, Subscription } from "../models";
import { Application } from "probot";

import issueNullBody from "fixtures/issue-null-body.json";
import issueBasic from "fixtures/issue-basic.json";

jest.mock("config/feature-flags");

describe("Issue Webhook", () => {
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
	});

	describe("issue", () => {
		describe("created", () => {
			it("should update the GitHub issue with a linked Jira ticket", async () => {
				githubUserTokenNock(gitHubInstallationId);

				jiraNock
					.get("/rest/api/latest/issue/TEST-123?fields=summary")
					.reply(200, {
						key: "TEST-123",
						fields: {
							summary: "Example Issue"
						}
					});

				githubNock
					.patch("/repos/test-repo-owner/test-repo-name/issues/123456789", {
						body: `Test example issue with linked Jira issue: [TEST-123]\n\n[TEST-123]: ${jiraHost}/browse/TEST-123`
					})
					.reply(200, {
						key: "TEST-123",
						fields: {
							summary: "Example Issue"
						}
					});

				await expect(app.receive(issueBasic as any)).toResolve();
			});

			it("should not break if the issue has a null body", async () => {
				// should not throw
				await expect(app.receive(issueNullBody as any)).toResolve();
			});
		});
	});
});
