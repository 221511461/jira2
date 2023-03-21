/* eslint-disable @typescript-eslint/no-explicit-any */
import * as installation from "~/src/sync/installation";
import { getTargetTasks, handleBackfillError, isRetryableWithSmallerRequest, maybeScheduleNextTask, processInstallation } from "~/src/sync/installation";
import { Task, TaskType } from "~/src/sync/sync.types";
import { DeduplicatorResult } from "~/src/sync/deduplicator";
import { getLogger } from "config/logger";
import { Hub } from "@sentry/types/dist/hub";
import { GithubClientGraphQLError, RateLimitingError } from "~/src/github/client/github-client-errors";
import { Repository, Subscription } from "models/subscription";
import { RepoSyncState } from "models/reposyncstate";
import { mockNotFoundErrorOctokitGraphql, mockOtherOctokitRequestErrors } from "test/mocks/error-responses";
import { v4 as UUID } from "uuid";
import { ConnectionTimedOutError, Sequelize } from "sequelize";
import { AxiosError, AxiosResponse } from "axios";
import { createAnonymousClient } from "utils/get-github-client-config";
import { updateJobStatus } from "./installation";
import { BackfillMessagePayload } from "../sqs/sqs.types";
import { DatabaseStateCreator } from "test/utils/database-state-creator";

const mockedExecuteWithDeduplication = jest.fn();
jest.mock("~/src/sync/deduplicator", () => ({
	...jest.requireActual("~/src/sync/deduplicator"),
	Deduplicator: function() {
		return { executeWithDeduplication: mockedExecuteWithDeduplication };
	}
}));

describe("sync/installation", () => {

	let JOB_DATA;
	let JOB_DATA_GHES;

	beforeEach(async () => {
		await new DatabaseStateCreator().create();
		JOB_DATA = { installationId: DatabaseStateCreator.GITHUB_INSTALLATION_ID, jiraHost };
		JOB_DATA_GHES = {
			installationId: DatabaseStateCreator.GITHUB_INSTALLATION_ID,
			jiraHost,
			gitHubAppConfig: {
				gitHubAppId: GITHUB_APP_ID,
				appId: 2,
				clientId: "client_id",
				gitHubBaseUrl: "http://ghes.server",
				gitHubApiUrl: "http://ghes.server",
				uuid: UUID()
			}
		};
	});

	const TEST_LOGGER = getLogger("test");
	const GITHUB_APP_ID = 123;

	const TEST_REPO: Repository = {
		id: 123,
		name: "Test",
		full_name: "Test/Test",
		owner: { login: "test" },
		html_url: "https://test",
		updated_at: "1234"
	};

	const TASK: Task = { task: "commit", repositoryId: 123, repository: TEST_REPO };

	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	const sentry: Hub = { setUser: jest.fn() } as Hub;

	describe("isRetryableWithSmallerRequest()", () => {

		it("should return false for error without isRetryable flag", () => {
			const err = {
				errors: [
					{
						type: "FOO"
					}
				]
			};

			expect(isRetryableWithSmallerRequest(err)).toBeFalsy();
		});

		it("should return true for error with isRetryable flag", () => {
			const err = {
				isRetryable: true,
				errors: [
					{
						type: "FOO"
					}
				]
			};

			expect(isRetryableWithSmallerRequest(err)).toBeTruthy();
		});
	});

	describe("processInstallation", () => {

		it("should process the installation with deduplication for cloud", async () => {
			await processInstallation(jest.fn())(JOB_DATA, sentry, TEST_LOGGER);
			expect(mockedExecuteWithDeduplication.mock.calls.length).toBe(1);
			expect(mockedExecuteWithDeduplication).toBeCalledWith(`i-${DatabaseStateCreator.GITHUB_INSTALLATION_ID}-${jiraHost}-ghaid-cloud`, expect.anything());
		});

		it("should process the installation with deduplication for GHES", async () => {
			const sendSqsMessage = jest.fn();
			await processInstallation(sendSqsMessage)(JOB_DATA_GHES, sentry, TEST_LOGGER);
			expect(mockedExecuteWithDeduplication.mock.calls.length).toBe(1);
			expect(mockedExecuteWithDeduplication).toBeCalledWith(`i-${DatabaseStateCreator.GITHUB_INSTALLATION_ID}-${jiraHost}-ghaid-${GITHUB_APP_ID}`, expect.anything());
		});

		it("should reschedule the job if deduplicator is unsure", async () => {
			mockedExecuteWithDeduplication.mockResolvedValue(DeduplicatorResult.E_NOT_SURE_TRY_AGAIN_LATER);
			const sendSqsMessage = jest.fn();
			await processInstallation(sendSqsMessage)(JOB_DATA, sentry, TEST_LOGGER);
			expect(sendSqsMessage).toBeCalledTimes(1);
			expect(sendSqsMessage).toBeCalledWith(JOB_DATA, 60, expect.anything());
		});

		it("should also reschedule the job if deduplicator is sure", async () => {
			mockedExecuteWithDeduplication.mockResolvedValue(DeduplicatorResult.E_OTHER_WORKER_DOING_THIS_JOB);
			const sendSqsMessage = jest.fn();
			await processInstallation(sendSqsMessage)(JOB_DATA, sentry, TEST_LOGGER);
			expect(sendSqsMessage).toBeCalledTimes(1);
		});
	});

	describe("maybeScheduleNextTask", () => {
		it("does nothing if there is no next task", async () => {
			const sendSqsMessage = jest.fn();
			await maybeScheduleNextTask(sendSqsMessage, JOB_DATA, [], TEST_LOGGER);
			expect(sendSqsMessage).toBeCalledTimes(0);
		});

		it("when multiple tasks, picks the one with the highest delay", async () => {
			const sendSqsMessage = jest.fn();
			await maybeScheduleNextTask(sendSqsMessage, JOB_DATA, [30_000, 60_000, 0], TEST_LOGGER);
			expect(sendSqsMessage).toBeCalledTimes(1);
			expect(sendSqsMessage).toBeCalledWith(JOB_DATA, 60, expect.anything());
		});

		it("not passing delay to queue when not provided", async () => {
			const sendSqsMessage = jest.fn();
			await maybeScheduleNextTask(sendSqsMessage, JOB_DATA, [0], TEST_LOGGER);
			expect(sendSqsMessage).toBeCalledWith(JOB_DATA, 0, expect.anything());
		});
	});

	describe("handleBackfillError", () => {

		const scheduleNextTask = jest.fn();
		let updateStatusSpy;
		let failRepoSpy;

		beforeEach(() => {

			updateStatusSpy = jest.spyOn(installation, "updateJobStatus");
			failRepoSpy = jest.spyOn(installation, "markCurrentTaskAsFailedAndContinue");

			updateStatusSpy.mockReturnValue(Promise.resolve());
			failRepoSpy.mockReturnValue(Promise.resolve());

			mockSystemTime(12345678);
		});

		it("Rate limiting error will be retried with the correct delay", async () => {
			const axiosResponse = {
				data: "Rate Limit",
				status: 403,
				statusText: "RateLimit",
				headers: {
					"x-ratelimit-reset": "12360",
					"x-ratelimit-remaining": "0"
				},
				config: {}
			};

			await handleBackfillError(
				new RateLimitingError(
					{ response: axiosResponse } as unknown as AxiosError
				),
				JOB_DATA, TASK, TEST_LOGGER, scheduleNextTask
			);

			expect(scheduleNextTask).toBeCalledWith(14322);
			expect(updateStatusSpy).toHaveBeenCalledTimes(0);
			expect(failRepoSpy).toHaveBeenCalledTimes(0);
		});

		it("No delay if rate limit already reset", async () => {
			const axiosResponse = {
				data: "Rate Limit",
				status: 403,
				statusText: "RateLimit",
				headers: {
					"x-ratelimit-reset": "12345",
					"x-ratelimit-remaining": "0"
				},
				config: {}
			};

			await handleBackfillError(new RateLimitingError({
				response: axiosResponse
			} as unknown as AxiosError), JOB_DATA, TASK, TEST_LOGGER, scheduleNextTask);
			expect(scheduleNextTask).toBeCalledWith(0);
			expect(updateStatusSpy).toHaveBeenCalledTimes(0);
			expect(failRepoSpy).toHaveBeenCalledTimes(0);
		});

		it("Error with headers indicating rate limit will be retried with the appropriate delay", async () => {
			const probablyRateLimitError = {
				...new Error(),
				documentation_url: "https://docs.github.com/rest/reference/pulls#list-pull-requests",
				headers: {
					"access-control-allow-origin": "*",
					"connection": "close",
					"content-type": "application/json; charset=utf-8",
					"date": "Fri, 04 Mar 2022 21:09:27 GMT",
					"x-ratelimit-limit": "8900",
					"x-ratelimit-remaining": "0",
					"x-ratelimit-reset": "12360",
					"x-ratelimit-resource": "core",
					"x-ratelimit-used": "2421"
				},
				name: "HttpError",
				status: 403
			};

			await handleBackfillError(probablyRateLimitError, JOB_DATA, TASK, TEST_LOGGER, scheduleNextTask);
			expect(scheduleNextTask).toBeCalledWith(14322);
			expect(updateStatusSpy).toHaveBeenCalledTimes(0);
			expect(failRepoSpy).toHaveBeenCalledTimes(0);
		});

		it("Repository ignored if not found error", async () => {
			gheNock.get("/")
				.reply(404, {});

			const client = await createAnonymousClient(gheUrl, jiraHost, getLogger("test"));
			try {
				await client.getMainPage(1000);
			} catch (err) {
				await handleBackfillError(err, JOB_DATA, TASK, TEST_LOGGER, scheduleNextTask);
			}

			expect(scheduleNextTask).toHaveBeenCalledTimes(0);
			expect(updateStatusSpy).toHaveBeenCalledTimes(1);
			expect(failRepoSpy).toHaveBeenCalledTimes(0);
		});

		it("Repository ignored if GraphQL not found error", async () => {

			await handleBackfillError(new GithubClientGraphQLError({ } as AxiosResponse, mockNotFoundErrorOctokitGraphql.errors), JOB_DATA, TASK, TEST_LOGGER, scheduleNextTask);
			expect(scheduleNextTask).toHaveBeenCalledTimes(0);
			expect(updateStatusSpy).toHaveBeenCalledTimes(1);
			expect(failRepoSpy).toHaveBeenCalledTimes(0);
		});

		it("Repository failed if some kind of unknown error", async () => {
			await handleBackfillError(mockOtherOctokitRequestErrors, JOB_DATA, TASK, TEST_LOGGER, scheduleNextTask);
			expect(scheduleNextTask).toHaveBeenCalledTimes(0);
			expect(updateStatusSpy).toHaveBeenCalledTimes(0);
			expect(failRepoSpy).toHaveBeenCalledTimes(1);
		});

		it("60s delay if abuse detection triggered", async () => {
			const abuseDetectionError = {
				...new Error(),
				documentation_url: "https://docs.github.com/rest/reference/pulls#list-pull-requests",
				headers: {
					"access-control-allow-origin": "*",
					"connection": "close",
					"content-type": "application/json; charset=utf-8",
					"date": "Fri, 04 Mar 2022 21:09:27 GMT",
					"x-ratelimit-limit": "8900",
					"x-ratelimit-remaining": "6479",
					"x-ratelimit-reset": "12360",
					"x-ratelimit-resource": "core",
					"x-ratelimit-used": "2421"
				},
				message: "You have triggered an abuse detection mechanism",
				name: "HttpError",
				status: 403
			};

			await handleBackfillError(abuseDetectionError, JOB_DATA, TASK, TEST_LOGGER, scheduleNextTask);
			expect(scheduleNextTask).toHaveBeenCalledWith(60_000);
			expect(updateStatusSpy).toHaveBeenCalledTimes(0);
			expect(failRepoSpy).toHaveBeenCalledTimes(0);
		});

		it("5s delay if connection timeout", async () => {
			const connectionTimeoutErr = "connect ETIMEDOUT";

			await handleBackfillError(connectionTimeoutErr, JOB_DATA, TASK, TEST_LOGGER, scheduleNextTask);
			expect(scheduleNextTask).toHaveBeenCalledWith(5_000);
			expect(updateStatusSpy).toHaveBeenCalledTimes(0);
			expect(failRepoSpy).toHaveBeenCalledTimes(0);
		});

		it("30s delay if cannot connect", async () => {
			const connectionRefusedError = "connect ECONNREFUSED 10.255.0.9:26272";

			await handleBackfillError(connectionRefusedError, JOB_DATA, TASK, TEST_LOGGER, scheduleNextTask);
			expect(scheduleNextTask).toHaveBeenCalledWith(30_000);
			expect(updateStatusSpy).toHaveBeenCalledTimes(0);
			expect(failRepoSpy).toHaveBeenCalledTimes(0);
		});

		it("30s delay if cannot connect to database", async () => {
			const connectionRefusedError = new ConnectionTimedOutError(new Error("foo"));

			await handleBackfillError(connectionRefusedError, JOB_DATA, TASK, TEST_LOGGER, scheduleNextTask);
			expect(scheduleNextTask).toHaveBeenCalledWith(30_000);
			expect(updateStatusSpy).toHaveBeenCalledTimes(0);
			expect(failRepoSpy).toHaveBeenCalledTimes(0);
		});

		it("30s delay when sequelize connection error", async () => {
			let sequelizeConnectionError: Error | undefined = undefined;
			try {
				const sequelize = new Sequelize({
					dialect: "postgres",
					host: "1.2.3.400",
					port: 3306,
					username: "your_username",
					password: "your_password",
					database: "your_database"
				});
				await sequelize.authenticate();
			} catch (err) {
				sequelizeConnectionError = err;
			}

			await handleBackfillError(sequelizeConnectionError, JOB_DATA, TASK, TEST_LOGGER, scheduleNextTask);
			expect(scheduleNextTask).toHaveBeenCalledWith(30_000);
			expect(updateStatusSpy).toHaveBeenCalledTimes(0);
			expect(failRepoSpy).toHaveBeenCalledTimes(0);
		});

		it("don't reschedule a repository sync straight after a failed repository", async () => {
			const connectionTimeoutErr = "an error that doesnt match";
			const MOCK_REPO_TASK: Task = { task: "repository", repositoryId: 0, repository: TEST_REPO };

			await handleBackfillError(connectionTimeoutErr, JOB_DATA, MOCK_REPO_TASK, TEST_LOGGER, scheduleNextTask);
			expect(scheduleNextTask).toHaveBeenCalledTimes(0);
			expect(updateStatusSpy).toHaveBeenCalledTimes(0);
			expect(failRepoSpy).toHaveBeenCalledTimes(1);
		});

	});

	describe("getTargetTasks", () => {
		it("should return all tasks if no target tasks present", async () => {
			expect(getTargetTasks()).toEqual(["pull", "branch", "commit", "build", "deployment"]);
			expect(getTargetTasks([])).toEqual(["pull", "branch", "commit", "build", "deployment"]);
		});

		it("should return single target task", async () => {
			expect(getTargetTasks(["pull"])).toEqual(["pull"]);
		});

		it("should return set of target tasks", async () => {
			expect(getTargetTasks(["pull", "commit"])).toEqual(["pull", "commit"]);
		});

		it("should return set of target tasks and filter out invalid values", async () => {
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-ignore
			expect(getTargetTasks(["pull", "commit", "cats"])).toEqual(["pull", "commit"]);
		});
	});

	describe("Update job status", () => {
		const GITHUB_INSTALLATION_ID = 1111;
		const REPO_ID = 12345;
		const commitsFromDate = new Date();
		let data: BackfillMessagePayload;
		let sub: Subscription;
		let repoSync: RepoSyncState;
		beforeEach(async ()=> {
			sub = await Subscription.install({ host: jiraHost, installationId: GITHUB_INSTALLATION_ID, gitHubAppId: undefined, hashedClientKey: "client-key" });
			repoSync = await RepoSyncState.create({
				subscriptionId: sub.id, repoId: REPO_ID, repoName: "name", repoUrl: "url", repoOwner: "owner", repoFullName: "full name",
				repoPushedAt: new Date(), repoUpdatedAt: new Date(), repoCreatedAt: new Date()
			});
			data = {
				installationId: GITHUB_INSTALLATION_ID,
				jiraHost: jiraHost,
				commitsFromDate: commitsFromDate.toISOString()
			};
		});
		it("should skip update backfill from date if task is branch", async () => {
			await updateJobStatus(data, { edges: [], jiraPayload: undefined }, "branch", REPO_ID, getLogger("test"), jest.fn());
			await repoSync.reload();
			expect(repoSync.branchFrom).toBeNull();
		});
		it("should skip update backfill from date if task is repository", async () => {
			await updateJobStatus(data, { edges: [], jiraPayload: undefined }, "repository", REPO_ID, getLogger("test"), jest.fn());
			await repoSync.reload();
			expect(repoSync.branchFrom).toBeNull();
			expect(repoSync.commitFrom).toBeNull();
			expect(repoSync.pullFrom).toBeNull();
			expect(repoSync.buildFrom).toBeNull();
			expect(repoSync.deploymentFrom).toBeNull();
		});
		describe.each(["pull", "commit", "build", "deployment"] as TaskType[])("Update jobs status for each tasks", (task: TaskType) => {
			const colTaskFrom = `${task}From`;
			it(`${task}: should update backfill from date upon success complete and existing backfill date is empty`, async () => {
				await updateJobStatus(data, { edges: [], jiraPayload: undefined }, task, REPO_ID, getLogger("test"), jest.fn());
				await repoSync.reload();
				expect(repoSync[colTaskFrom]!.toISOString()).toEqual(commitsFromDate.toISOString());
			});
			it(`${task}: should update backfill from date upon success complete and new backfill date is earlier`, async () => {
				repoSync.pullFrom = new Date(commitsFromDate.getTime() + 100000);
				await repoSync.save();
				await updateJobStatus(data, { edges: [], jiraPayload: undefined }, task, REPO_ID, getLogger("test"), jest.fn());
				await repoSync.reload();
				expect(repoSync[colTaskFrom]!.toISOString()).toEqual(commitsFromDate.toISOString());
			});
			it(`${task}: should skip update backfill from date upon success complete and new backfill date is more recent`, async () => {
				const oldDate = new Date(commitsFromDate.getTime() - 100000);
				repoSync[colTaskFrom]= oldDate;
				await repoSync.save();
				await updateJobStatus(data, { edges: [], jiraPayload: undefined }, task, REPO_ID, getLogger("test"), jest.fn());
				await repoSync.reload();
				expect(repoSync[colTaskFrom]!.toISOString()).toEqual(oldDate.toISOString());
			});
			it(`${task}: should not update backfill from date is job is not complete`, async () => {
				await updateJobStatus(data, { edges: [ { cursor: "abcd" } ], jiraPayload: undefined }, "pull", REPO_ID, getLogger("test"), jest.fn());
				await repoSync.reload();
				expect(repoSync.pullFrom).toBeNull();
			});
		});
	});

});
