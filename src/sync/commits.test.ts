/* eslint-disable @typescript-eslint/no-var-requires,@typescript-eslint/no-explicit-any */
import { removeInterceptor } from "nock";
import { commitsNoLastCursor } from "fixtures/api/graphql/commit-queries";
import { processInstallation } from "./installation";
import { Installation } from "models/installation";
import { RepoSyncState } from "models/reposyncstate";
import { Subscription } from "models/subscription";
import { mocked } from "ts-jest/utils";
import { Application } from "probot";
import { createWebhookApp } from "test/utils/probot";
import { sqsQueues } from "../sqs/queues";
import { getLogger } from "config/logger";
import { Hub } from "@sentry/types/dist/hub";
import { BackfillMessagePayload } from "../sqs/backfill";
import commitNodesFixture from "fixtures/api/graphql/commit-nodes.json";
import mixedCommitNodes from "fixtures/api/graphql/commit-nodes-mixed.json";
import commitsNoKeys from "fixtures/api/graphql/commit-nodes-no-keys.json";
import { when } from "jest-when";
import { numberFlag, NumberFlags, stringFlag, StringFlags } from "config/feature-flags";

jest.mock("../sqs/queues");
jest.mock("config/feature-flags");

describe("sync/commits", () => {
	let app: Application;
	const installationId = 1234;
	const sentry: Hub = { setUser: jest.fn() } as any;
	const mockBackfillQueueSendMessage = mocked(sqsQueues.backfill.sendMessage);

	const makeExpectedJiraResponse = (commits) => ({
		preventTransitions: true,
		repositories: [
			{
				commits,
				"id": "1",
				"name": "test-repo-name",
				"url": "test-repo-url",
				"updateSequenceId": 12345678
			}
		],
		properties: {
			"installationId": 1234
		}
	});

	const getCommitsQuery = (variables?: Record<string, any>) => {
		return commitsNoLastCursor({
			owner: "integrations",
			repo: "test-repo-name",
			per_page: 20,
			...variables
		});
	};

	const createGitHubNock = (commitsResponse?, variables?: Record<string, any>) => {
		githubNock
			.post("/graphql", getCommitsQuery(variables))
			.query(true)
			.reply(200, commitsResponse);
	};

	const createJiraNock = (commits) => {
		jiraNock
			.post("/rest/devinfo/0.10/bulk", makeExpectedJiraResponse(commits))
			.reply(200);
	};

	beforeEach(async () => {

		mockSystemTime(12345678);

		await Installation.create({
			gitHubInstallationId: installationId,
			jiraHost,
			sharedSecret: "secret",
			clientKey: "client-key"
		});

		const subscription = await Subscription.create({
			gitHubInstallationId: installationId,
			jiraHost,
			syncStatus: "ACTIVE",
			repositoryStatus: "complete"
		});

		await RepoSyncState.create({
			subscriptionId: subscription.id,
			repoId: 1,
			repoName: "test-repo-name",
			repoOwner: "integrations",
			repoFullName: "test-repo-name",
			repoUrl: "test-repo-url",
			branchStatus: "complete",
			commitStatus: "pending", // We want the next process to be commits
			pullStatus: "complete",
			updatedAt: new Date(),
			createdAt: new Date()
		});

		when(stringFlag).calledWith(
			StringFlags.TARGET_BACKFILL_TASKS,
			expect.anything(),
			expect.anything()
		).mockResolvedValue("*");

		app = await createWebhookApp();
		mocked(sqsQueues.backfill.sendMessage).mockResolvedValue(Promise.resolve());
		githubUserTokenNock(installationId);
	});

	const verifyMessageSent = (data: BackfillMessagePayload, delaySec ?: number) => {
		expect(mockBackfillQueueSendMessage.mock.calls).toHaveLength(1);
		expect(mockBackfillQueueSendMessage.mock.calls[0][0]).toEqual(data);
		expect(mockBackfillQueueSendMessage.mock.calls[0][1]).toEqual(delaySec || 0);
	};

	it("should sync to Jira when Commit Nodes have jira references", async () => {
		const data: BackfillMessagePayload = { installationId, jiraHost };

		createGitHubNock(commitNodesFixture);
		const commits = [
			{
				"author": {
					"name": "test-author-name",
					"email": "test-author-email@example.com"
				},
				"authorTimestamp": "test-authored-date",
				"displayId": "test-o",
				"fileCount": 0,
				"hash": "test-oid",
				"id": "test-oid",
				"issueKeys": [
					"TES-17"
				],
				"message": "[TES-17] test-commit-message",
				"url": "https://github.com/test-login/test-repo/commit/test-sha",
				"updateSequenceId": 12345678
			}
		];
		createJiraNock(commits);

		await expect(processInstallation(app)(data, sentry, getLogger("test"))).toResolve();
		verifyMessageSent(data);
	});

	it("should send Jira all commits that have Issue Keys", async () => {
		const data = { installationId, jiraHost };

		createGitHubNock(mixedCommitNodes);

		const commits = [
			{
				"author": {
					"name": "test-author-name",
					"email": "test-author-email@example.com"
				},
				"authorTimestamp": "test-authored-date",
				"displayId": "test-o",
				"fileCount": 3,
				"hash": "test-oid-1",
				"id": "test-oid-1",
				"issueKeys": [
					"TES-17"
				],
				"message": "[TES-17] test-commit-message",
				"url": "https://github.com/test-login/test-repo/commit/test-sha",
				"updateSequenceId": 12345678
			},
			{
				"author": {
					"avatar": "test-avatar-url",
					"name": "test-author-name",
					"email": "test-author-email@example.com"
				},
				"authorTimestamp": "test-authored-date",
				"displayId": "test-o",
				"fileCount": 0,
				"hash": "test-oid-2",
				"id": "test-oid-2",
				"issueKeys": [
					"TES-15"
				],
				"message": "[TES-15] another test-commit-message",
				"url": "https://github.com/test-login/test-repo/commit/test-sha",
				"updateSequenceId": 12345678
			},
			{
				"author": {
					"avatar": "test-avatar-url",
					"name": "test-author-name",
					"email": "test-author-email@example.com"
				},
				"authorTimestamp": "test-authored-date",
				"displayId": "test-o",
				"fileCount": 0,
				"hash": "test-oid-3",
				"id": "test-oid-3",
				"issueKeys": [
					"TES-14",
					"TES-15"
				],
				"message": "TES-14-TES-15 message with multiple keys",
				"url": "https://github.com/test-login/test-repo/commit/test-sha",
				"updateSequenceId": 12345678
			}
		];
		createJiraNock(commits);

		await expect(processInstallation(app)(data, sentry, getLogger("test"))).toResolve();
		verifyMessageSent(data);
	});

	it("should not call Jira if no issue keys are present", async () => {
		const data = { installationId, jiraHost };

		createGitHubNock(commitsNoKeys);

		const interceptor = jiraNock.post(/.*/);
		const scope = interceptor.reply(200);

		await expect(processInstallation(app)(data, sentry, getLogger("test"))).toResolve();
		expect(scope).not.toBeDone();
		removeInterceptor(interceptor);
	});

	it("should not call Jira if no data is returned", async () => {
		const data = { installationId, jiraHost };
		createGitHubNock();

		const interceptor = jiraNock.post(/.*/);
		const scope = interceptor.reply(200);

		await expect(processInstallation(app)(data, sentry, getLogger("test"))).toResolve();
		expect(scope).not.toBeDone();
		removeInterceptor(interceptor);
	});

	describe("SYNC_MAIN_COMMIT_TIME_LIMIT FF is enabled", () => {
		let dateCutoff: Date;
		beforeEach(() => {
			const time = Date.now();
			const cutoff = 1000 * 60 * 60 * 24;
			mockSystemTime(time);
			dateCutoff = new Date(time - cutoff);

			when(numberFlag).calledWith(
				NumberFlags.SYNC_MAIN_COMMIT_TIME_LIMIT,
				expect.anything(),
				expect.anything()
			).mockResolvedValue(cutoff);
		});

		it("should only get commits since date specified", async () => {
			const data: BackfillMessagePayload = { installationId, jiraHost };

			createGitHubNock(commitNodesFixture, { commitSince: dateCutoff.toISOString() });
			const commits = [
				{
					"author": {
						"name": "test-author-name",
						"email": "test-author-email@example.com"
					},
					"authorTimestamp": "test-authored-date",
					"displayId": "test-o",
					"fileCount": 0,
					"hash": "test-oid",
					"id": "test-oid",
					"issueKeys": [
						"TES-17"
					],
					"message": "[TES-17] test-commit-message",
					"url": "https://github.com/test-login/test-repo/commit/test-sha",
					"updateSequenceId": 12345678
				}
			];
			createJiraNock(commits);

			await expect(processInstallation(app)(data, sentry, getLogger("test"))).toResolve();
			verifyMessageSent(data);
		});
	});
});
