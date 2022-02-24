/* eslint-disable @typescript-eslint/no-var-requires,@typescript-eslint/no-explicit-any */
import { commitsNoLastCursor, commitsWithLastCursor, getDefaultBranch } from "../../fixtures/api/graphql/commit-queries";
import { Subscription } from "../../../src/models";
import { processInstallation } from "../../../src/sync/installation";
import { mocked } from "ts-jest/utils";
import { Application } from "probot";
import { createApplication } from "../../utils/probot";
import nock from "nock";
import { getLogger } from "../../../src/config/logger";
import { Hub } from "@sentry/types/dist/hub";

jest.mock("../../../src/models");

// import { when } from "jest-when";
// import { booleanFlag, BooleanFlags } from "../../src/config/feature-flags";

// jest.mock("../../src/config/feature-flags");

// 			when(booleanFlag).calledWith(
// 				BooleanFlags.USE_NEW_GITHUB_PULL_REQUEST_URL_FORMAT,
// 				expect.anything()
// 			).mockResolvedValue(true);

describe.skip("sync/commits", () => {
	let installationId;
	let app: Application;

	const defaultBranchFixture = require("../../fixtures/api/graphql/default-branch.json");
	const commitNodesFixture = require("../../fixtures/api/graphql/commit-nodes.json");
	const mixedCommitNodes = require("../../fixtures/api/graphql/commit-nodes-mixed.json");
	const defaultBranchNullFixture = require("../../fixtures/api/graphql/default-branch-null.json");
	const commitsNoKeys = require("../../fixtures/api/graphql/commit-nodes-no-keys.json");

	const backfillQueue = {
		schedule: jest.fn()
	};

	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	const sentry: Hub = { setUser: jest.fn() } as Hub;

	beforeEach(async () => {
		// TODO: move this into utils to easily construct mock data
		const repoSyncStatus = {
			installationId: 12345678,
			jiraHost: "tcbyrd.atlassian.net",
			repos: {
				"test-repo-id": {
					repository: {
						name: "test-repo-name",
						owner: { login: "integrations" },
						html_url: "test-repo-url",
						id: "test-repo-id"
					},
					pullStatus: "complete",
					branchStatus: "complete",
					commitStatus: "pending"
				}
			}
		};

		installationId = 1234;
		mockSystemTime(12345678);

		mocked(Subscription.getSingleInstallation).mockResolvedValue({
			jiraHost,
			id: 1,
			get: () => repoSyncStatus,
			set: () => repoSyncStatus,
			save: () => Promise.resolve({}),
			update: () => Promise.resolve({})
		} as any);

		app = createApplication();
	});

	afterEach(() => {
		backfillQueue.schedule.mockReset();
	});

	it("should sync to Jira when Commit Nodes have jira references", async () => {
		const data = { installationId, jiraHost };

		githubNock
			.post("/graphql")
			.reply(200, defaultBranchFixture)
			.post("/graphql")
			.reply(200, commitNodesFixture)
			.post("/graphql")
			.reply(200);

		jiraNock.post("/rest/devinfo/0.10/bulk", {
			preventTransitions: true,
			repositories: [
				{
					commits: [
						{
							author: {
								email: "test-author-email@example.com",
								name: "test-author-name"
							},
							authorTimestamp: "test-authored-date",
							displayId: "test-o",
							fileCount: 0,
							hash: "test-oid",
							id: "test-oid",
							issueKeys: ["TES-17"],
							message: "[TES-17] test-commit-message",
							timestamp: "test-authored-date",
							url: "https://github.com/test-login/test-repo/commit/test-sha",
							updateSequenceId: 12345678
						}
					],
					id: "test-repo-id",
					url: "test-repo-url",
					updateSequenceId: 12345678
				}
			],
			properties: {
				installationId: 1234
			}
		}).reply(200);

		await expect(processInstallation(app)(data, sentry, getLogger("test"))).toResolve();
		expect(backfillQueue.schedule).toHaveBeenCalledWith(data);
	});

	it("should send Jira all commits that have Issue Keys", async () => {
		const data = { installationId, jiraHost };

		githubNock
			.post("/graphql", getDefaultBranch)
			.reply(200, defaultBranchFixture)
			.post("/graphql", commitsNoLastCursor)
			.reply(200, mixedCommitNodes)
			.post("/graphql", commitsWithLastCursor)
			.reply(200);

		jiraNock.post("/rest/devinfo/0.10/bulk", {
			preventTransitions: true,
			repositories: [
				{
					commits: [
						{
							author: {
								email: "test-author-email@example.com",
								name: "test-author-name"
							},
							authorTimestamp: "test-authored-date",
							displayId: "test-o",
							fileCount: 0,
							hash: "test-oid-1",
							id: "test-oid-1",
							issueKeys: ["TES-17"],
							message: "[TES-17] test-commit-message",
							timestamp: "test-authored-date",
							url: "https://github.com/test-login/test-repo/commit/test-sha",
							updateSequenceId: 12345678
						},
						{
							author: {
								avatar: "test-avatar-url",
								email: "test-author-email@example.com",
								name: "test-author-name"
							},
							authorTimestamp: "test-authored-date",
							displayId: "test-o",
							fileCount: 0,
							hash: "test-oid-2",
							id: "test-oid-2",
							issueKeys: ["TES-15"],
							message: "[TES-15] another test-commit-message",
							timestamp: "test-authored-date",
							url: "https://github.com/test-login/test-repo/commit/test-sha",
							updateSequenceId: 12345678
						},
						{
							author: {
								avatar: "test-avatar-url",
								email: "test-author-email@example.com",
								name: "test-author-name"
							},
							authorTimestamp: "test-authored-date",
							displayId: "test-o",
							fileCount: 0,
							hash: "test-oid-3",
							id: "test-oid-3",
							issueKeys: ["TES-14", "TES-15"],
							message: "TES-14-TES-15 message with multiple keys",
							timestamp: "test-authored-date",
							url: "https://github.com/test-login/test-repo/commit/test-sha",
							updateSequenceId: 12345678
						}
					],
					id: "test-repo-id",
					url: "test-repo-url",
					updateSequenceId: 12345678
				}
			],
			properties: {
				installationId: 1234
			}
		}).reply(200);

		await expect(processInstallation(app)(data, sentry, getLogger("test"))).toResolve();
		expect(backfillQueue.schedule).toHaveBeenCalledWith(data);
	});

	it("should default to master branch if defaultBranchRef is null", async () => {
		const data = { installationId, jiraHost };

		githubNock
			.post("/graphql", getDefaultBranch)
			.reply(200, defaultBranchNullFixture)
			.post("/graphql", commitsNoLastCursor)
			.reply(200, commitNodesFixture)
			.post("/graphql", commitsWithLastCursor)
			.reply(200);

		jiraNock.post("/rest/devinfo/0.10/bulk", {
			preventTransitions: true,
			repositories: [
				{
					commits: [
						{
							author: {
								email: "test-author-email@example.com",
								name: "test-author-name"
							},
							authorTimestamp: "test-authored-date",
							displayId: "test-o",
							fileCount: 0,
							hash: "test-oid",
							id: "test-oid",
							issueKeys: ["TES-17"],
							message: "[TES-17] test-commit-message",
							timestamp: "test-authored-date",
							url: "https://github.com/test-login/test-repo/commit/test-sha",
							updateSequenceId: 12345678
						}
					],
					id: "test-repo-id",
					url: "test-repo-url",
					updateSequenceId: 12345678
				}
			],
			properties: {
				installationId: 1234
			}
		}).reply(200);

		await expect(processInstallation(app)(data, sentry, getLogger("test"))).toResolve();
		expect(backfillQueue.schedule).toHaveBeenCalledWith(data);
	});

	it("should not call Jira if no issue keys are present", async () => {
		const data = { installationId, jiraHost };

		githubNock
			.post("/graphql", getDefaultBranch)
			.reply(200, defaultBranchFixture)
			.post("/graphql", commitsNoLastCursor)
			.reply(200, commitsNoKeys)
			.post("/graphql", commitsWithLastCursor)
			.reply(200);

		const interceptor = jiraNock.post(/.*/);
		const scope = interceptor.reply(200);

		await expect(processInstallation(app)(data, sentry, getLogger("test"))).toResolve();
		expect(backfillQueue.schedule).toHaveBeenCalledWith(data);
		expect(scope).not.toBeDone();
		nock.removeInterceptor(interceptor);
	});

	it("should not call Jira if no data is returned", async () => {
		const data = { installationId, jiraHost };

		githubNock
			.post("/graphql", getDefaultBranch)
			.reply(200, defaultBranchFixture)
			.post("/graphql", commitsNoLastCursor)
			.reply(200)
			.post("/graphql", commitsWithLastCursor)
			.reply(200);

		const interceptor = jiraNock.post(/.*/);
		const scope = interceptor.reply(200);

		await expect(processInstallation(app)(data, sentry, getLogger("test"))).toResolve();
		expect(backfillQueue.schedule).toHaveBeenCalledWith(data);
		expect(scope).not.toBeDone();
		nock.removeInterceptor(interceptor);
	});
});
