/* eslint-disable @typescript-eslint/no-var-requires */
import { createWebhookApp } from "../utils/probot";
import { Installation, Subscription } from "../../src/models";
import { Application } from "probot";
import { when } from "jest-when";
import { booleanFlag, BooleanFlags } from "../../src/config/feature-flags";
// import { start, stop } from "../../src/worker/startup";
import waitUntil from "../utils/waitUntil";
import { sqsQueues } from "../../src/sqs/queues";

jest.mock("../../src/config/feature-flags");

describe("Branch Webhook", () => {
	let app: Application;
	const gitHubInstallationId = 1234;

	beforeAll(async () => {
		await sqsQueues.branch.purgeQueue();
	});

	beforeEach(async () => {
		app = await createWebhookApp();
		const clientKey = "client-key";
		await Installation.create({
			clientKey,
			sharedSecret: "shared-secret",
			jiraHost
		});
		await Subscription.create({
			gitHubInstallationId,
			jiraHost,
			jiraClientKey: clientKey
		});
		// await start();
		sqsQueues.branch.start();
	});

	afterEach(async () => {
		// await stop();

		await sqsQueues.branch.stop();
		await sqsQueues.branch.purgeQueue();
	});

	describe("Create Branch", () => {
		it("should queue and process a create webhook", async () => {

			when(booleanFlag).calledWith(
				BooleanFlags.USE_SQS_FOR_BRANCH,
				expect.anything(),
				expect.anything()
			).mockResolvedValue(true);

			const fixture = require("../fixtures/branch-basic.json");

			const ref = encodeURIComponent("heads/TES-123-test-ref");
			const sha = "test-branch-ref-sha";

			githubAccessTokenNock(gitHubInstallationId);
			githubAccessTokenNock(gitHubInstallationId);
			githubNock.get(`/repos/test-repo-owner/test-repo-name/git/ref/${ref}`)
				.reply(200, {
					ref: `refs/${ref}`,
					object: {
						sha
					}
				});
			githubNock.get(`/repos/test-repo-owner/test-repo-name/commits/${sha}`)
				.reply(200, {
					commit: {
						author: {
							name: "test-branch-author-name",
							email: "test-branch-author-name@github.com",
							date: "test-branch-author-date"
						},
						message: "test-commit-message"
					},
					html_url: `test-repo-url/commits/${sha}`
				});

			jiraNock.post("/rest/devinfo/0.10/bulk", {
				preventTransitions: false,
				repositories: [
					{
						name: "example/test-repo-name",
						url: "test-repo-url",
						id: "test-repo-id",
						branches: [
							{
								createPullRequestUrl: "test-repo-url/pull/new/TES-123-test-ref",
								lastCommit: {
									author: {
										name: "test-branch-author-name",
										email: "test-branch-author-name@github.com"
									},
									authorTimestamp: "test-branch-author-date",
									displayId: "test-b",
									fileCount: 0,
									hash: "test-branch-ref-sha",
									id: "test-branch-ref-sha",
									issueKeys: ["TES-123"],
									message: "test-commit-message",
									updateSequenceId: 12345678,
									url: "test-repo-url/commits/test-branch-ref-sha"
								},
								id: "TES-123-test-ref",
								issueKeys: ["TES-123"],
								name: "TES-123-test-ref",
								url: "test-repo-url/tree/TES-123-test-ref",
								updateSequenceId: 12345678
							}
						],
						updateSequenceId: 12345678
					}
				],
				properties: {
					installationId: gitHubInstallationId
				}
			}).reply(200);

			jest.spyOn(Date, "now").mockImplementation(() => 12345678);

			await expect(app.receive(fixture)).toResolve();

			await waitUntil(async () => {
				expect(githubNock).toBeDone();
				expect(jiraNock).toBeDone();
			});
		});

		it("should not update Jira issue if there are no issue Keys in the branch name", async () => {
			const fixture = require("../fixtures/branch-no-issues.json");
			const getLastCommit = jest.fn();

			await expect(app.receive(fixture)).toResolve();
			expect(getLastCommit).not.toBeCalled();

			await waitUntil(async () => {
				expect(githubNock).toBeDone();
				expect(jiraNock).toBeDone();
			});
		});

		it("should exit early if ref_type is not a branch", async () => {
			const fixture = require("../fixtures/branch-invalid-ref_type.json");
			const parseSmartCommit = jest.fn();

			await expect(app.receive(fixture)).toResolve();
			expect(parseSmartCommit).not.toBeCalled();

			await waitUntil(async () => {
				expect(githubNock).toBeDone();
				expect(jiraNock).toBeDone();
			});
		});
	});

	describe("Create Branch (with disabled FF - delete this test with FF cleanup)", () => {
		it("should update Jira issue with link to a branch on GitHub", async () => {

			// delete this whole test with FF cleanup
			when(booleanFlag).calledWith(
				BooleanFlags.USE_SQS_FOR_BRANCH,
				expect.anything(),
				expect.anything()
			).mockResolvedValue(false);

			// githubAccessTokenNock(gitHubInstallationId);

			const fixture = require("../fixtures/branch-basic.json");

			const ref = encodeURIComponent("heads/TES-123-test-ref");
			const sha = "test-branch-ref-sha";

			githubNock.get(`/repos/test-repo-owner/test-repo-name/git/ref/${ref}`)
				.reply(200, {
					ref: `refs/${ref}`,
					object: {
						sha
					}
				});
			githubNock.get(`/repos/test-repo-owner/test-repo-name/commits/${sha}`)
				.reply(200, {
					commit: {
						author: {
							name: "test-branch-author-name",
							email: "test-branch-author-name@github.com",
							date: "test-branch-author-date"
						},
						message: "test-commit-message"
					},
					html_url: `test-repo-url/commits/${sha}`
				});

			jiraNock.post("/rest/devinfo/0.10/bulk", {
				preventTransitions: false,
				repositories: [
					{
						name: "example/test-repo-name",
						url: "test-repo-url",
						id: "test-repo-id",
						branches: [
							{
								createPullRequestUrl: "test-repo-url/pull/new/TES-123-test-ref",
								lastCommit: {
									author: {
										name: "test-branch-author-name",
										email: "test-branch-author-name@github.com"
									},
									authorTimestamp: "test-branch-author-date",
									displayId: "test-b",
									fileCount: 0,
									hash: "test-branch-ref-sha",
									id: "test-branch-ref-sha",
									issueKeys: ["TES-123"],
									message: "test-commit-message",
									updateSequenceId: 12345678,
									url: "test-repo-url/commits/test-branch-ref-sha"
								},
								id: "TES-123-test-ref",
								issueKeys: ["TES-123"],
								name: "TES-123-test-ref",
								url: "test-repo-url/tree/TES-123-test-ref",
								updateSequenceId: 12345678
							}
						],
						updateSequenceId: 12345678
					}
				],
				properties: {
					installationId: gitHubInstallationId
				}
			}).reply(200);

			Date.now = jest.fn(() => 12345678);

			await expect(app.receive(fixture)).toResolve();

			await waitUntil(async () => {
				expect(githubNock).toBeDone();
				expect(jiraNock).toBeDone();
			});
		});

		it.skip("should not update Jira issue if there are no issue Keys in the branch name", async () => {
			const fixture = require("../fixtures/branch-no-issues.json");
			const getLastCommit = jest.fn();

			await expect(app.receive(fixture)).toResolve();
			expect(getLastCommit).not.toBeCalled();

			await waitUntil(async () => {
				expect(githubNock).toBeDone();
				expect(jiraNock).toBeDone();
			});
		});

		it.skip("should exit early if ref_type is not a branch", async () => {
			const fixture = require("../fixtures/branch-invalid-ref_type.json");
			const parseSmartCommit = jest.fn();

			await expect(app.receive(fixture)).toResolve();
			expect(parseSmartCommit).not.toBeCalled();

			await waitUntil(async () => {
				expect(githubNock).toBeDone();
				expect(jiraNock).toBeDone();
			});
		});
	});

	describe("delete a branch", () => {
		it("should call the devinfo delete API when a branch is deleted", async () => {
			const fixture = require("../fixtures/branch-delete.json");
			jiraNock
				.delete("/rest/devinfo/0.10/repository/test-repo-id/branch/TES-123-test-ref?_updateSequenceId=12345678")
				.reply(200);

			jest.spyOn(Date, "now").mockImplementation(() => 12345678);
			// Date.now = jest.fn(() => 12345678);
			await expect(app.receive(fixture)).toResolve();

			await waitUntil(async () => {
				expect(githubNock).toBeDone();
				expect(jiraNock).toBeDone();
			});
		});
	});
});
