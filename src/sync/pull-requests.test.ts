/* eslint-disable @typescript-eslint/no-var-requires,@typescript-eslint/no-explicit-any */
import { processInstallation } from "./installation";
import nock from "nock";
import { getLogger } from "config/logger";
import { Hub } from "@sentry/types/dist/hub";
import pullRequestList from "fixtures/api/pull-request-list.json";
import pullRequest from "fixtures/api/pull-request.json";
import { GitHubServerApp } from "models/github-server-app";
import { when } from "jest-when";
import { booleanFlag, BooleanFlags } from "config/feature-flags";
import { transformRepositoryId } from "~/src/transforms/transform-repository-id";
import { BackfillMessagePayload } from "~/src/sqs/sqs.types";
import { DatabaseStateBuilder } from "test/utils/database-state-builder";

jest.mock("config/feature-flags");

describe("sync/pull-request", () => {
	const sentry: Hub = { setUser: jest.fn() } as any as Hub;

	beforeEach(() => {
		mockSystemTime(12345678);
	});

	const buildJiraPayload = (repoId: string) => {
		return {
			"preventTransitions": true,
			"repositories":
				[
					{
						"id": repoId,
						"name": "test-repo-name",
						"pullRequests":
							[
								{
									"author":
										{
											"avatar": "test-pull-request-author-avatar",
											"name": "test-pull-request-author-login",
											"email": "test-pull-request-author-login@noreply.user.github.com",
											"url": "test-pull-request-author-url"
										},
									"commentCount": 10,
									"destinationBranch": "devel",
									"destinationBranchUrl": "test-repo-url/tree/devel",
									"displayId": "#51",
									"id": 51,
									"issueKeys":
										[
											"TES-15"
										],
									"lastUpdate": "2018-05-04T14:06:56Z",
									"sourceBranch": "use-the-force",
									"sourceBranchUrl": "test-repo-url/tree/use-the-force",
									"status": "DECLINED",
									"timestamp": "2018-05-04T14:06:56Z",
									"title": "Testing force pushes",
									"url": "https://github.com/integrations/test/pull/51",
									"updateSequenceId": 12345678
								}
							],
						"url": "test-repo-url",
						"updateSequenceId": 12345678
					}
				],
			"properties":
				{
					"installationId": DatabaseStateBuilder.GITHUB_INSTALLATION_ID
				}
		};
	};

	describe('cloud', () => {

		beforeEach(async () => {
			await new DatabaseStateBuilder()
				.withActiveRepoSyncState()
				.repoSyncStatePendingForPrs()
				.build();
		});

		describe.each([
			["[TES-15] Evernote Test", "use-the-force"],
			["Evernote Test", "TES-15"]
		])("PR Title: %p, PR Head Ref: %p", (title, head) => {
			it("should sync to Jira when Pull Request Nodes have jira references", async () => {
				pullRequestList[0].title = title;
				pullRequestList[0].head.ref = head;
				githubUserTokenNock(DatabaseStateBuilder.GITHUB_INSTALLATION_ID);
				githubUserTokenNock(DatabaseStateBuilder.GITHUB_INSTALLATION_ID);
				githubUserTokenNock(DatabaseStateBuilder.GITHUB_INSTALLATION_ID);
				githubNock
					.get("/repos/integrations/test-repo-name/pulls")
					.query(true)
					.reply(200, pullRequestList)
					.get("/repos/integrations/test-repo-name/pulls/51")
					.reply(200, pullRequest)
					.get("/users/test-pull-request-author-login")
					.reply(200, {
						login: "test-pull-request-author-login",
						avatar_url: "test-pull-request-author-avatar",
						html_url: "test-pull-request-author-url"
					});

				jiraNock.post("/rest/devinfo/0.10/bulk", buildJiraPayload("1")).reply(200);

				await expect(processInstallation()({
					installationId: DatabaseStateBuilder.GITHUB_INSTALLATION_ID,
					jiraHost
				}, sentry, getLogger("test"))).toResolve();
			});
		});

		it("should not sync if nodes are empty", async () => {
			githubUserTokenNock(DatabaseStateBuilder.GITHUB_INSTALLATION_ID);
			githubNock
				.get("/repos/integrations/test-repo-name/pulls")
				.query(true)
				.reply(200, []);

			const interceptor = jiraNock.post(/.*/);
			const scope = interceptor.reply(200);

			await expect(processInstallation()({
				installationId: DatabaseStateBuilder.GITHUB_INSTALLATION_ID,
				jiraHost
			}, sentry, getLogger("test"))).toResolve();
			expect(scope).not.toBeDone();
			nock.removeInterceptor(interceptor);
		});

		it("should not sync if nodes do not contain issue keys", async () => {
			githubUserTokenNock(DatabaseStateBuilder.GITHUB_INSTALLATION_ID);
			githubNock.get("/repos/integrations/test-repo-name/pulls")
				.query(true)
				.reply(200, pullRequestList);

			const interceptor = jiraNock.post(/.*/);
			const scope = interceptor.reply(200);

			await expect(processInstallation()({
				installationId: DatabaseStateBuilder.GITHUB_INSTALLATION_ID,
				jiraHost
			}, sentry, getLogger("test"))).toResolve();
			expect(scope).not.toBeDone();
			nock.removeInterceptor(interceptor);
		});
	});

	describe('server', () => {
		let gitHubServerApp: GitHubServerApp;

		beforeEach(async () => {
			when(jest.mocked(booleanFlag))
				.calledWith(BooleanFlags.GHE_SERVER, expect.anything(), expect.anything())
				.mockResolvedValue(true);

			const buildResult = await new DatabaseStateBuilder().forServer().withActiveRepoSyncState().repoSyncStatePendingForPrs().build();
			gitHubServerApp = buildResult.gitHubServerApp!;
		});

		it("should sync to Jira when Pull Request Nodes have jira references", async () => {
			pullRequestList[0].title = "[TES-15] Evernote Test";
			pullRequestList[0].head.ref = "Evernote Test";
			gheUserTokenNock(DatabaseStateBuilder.GITHUB_INSTALLATION_ID);
			gheUserTokenNock(DatabaseStateBuilder.GITHUB_INSTALLATION_ID);
			gheUserTokenNock(DatabaseStateBuilder.GITHUB_INSTALLATION_ID);
			gheApiNock
				.get("/repos/integrations/test-repo-name/pulls")
				.query(true)
				.reply(200, pullRequestList)
				.get("/repos/integrations/test-repo-name/pulls/51")
				.reply(200, pullRequest)
				.get("/users/test-pull-request-author-login")
				.reply(200, {
					login: "test-pull-request-author-login",
					avatar_url: "test-pull-request-author-avatar",
					html_url: "test-pull-request-author-url"
				});

			jiraNock.post("/rest/devinfo/0.10/bulk", buildJiraPayload(transformRepositoryId(1, gheUrl))).reply(200);

			const data: BackfillMessagePayload = {
				installationId: DatabaseStateBuilder.GITHUB_INSTALLATION_ID,
				jiraHost,
				gitHubAppConfig: {
					uuid: gitHubServerApp.uuid,
					gitHubAppId: gitHubServerApp.id,
					appId: gitHubServerApp.appId,
					clientId: gitHubServerApp.gitHubClientId,
					gitHubBaseUrl: gitHubServerApp.gitHubBaseUrl,
					gitHubApiUrl: gitHubServerApp.gitHubBaseUrl + "/v3/api"
				}
			};

			await expect(processInstallation()(data, sentry, getLogger("test"))).toResolve();
		});
	});
});
