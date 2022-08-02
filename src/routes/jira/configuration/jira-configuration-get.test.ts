/* eslint-disable @typescript-eslint/no-explicit-any,@typescript-eslint/no-var-requires */
import { getInstallations, JiraConfigurationGet } from "./jira-configuration-get";
import { Installation } from "models/installation";
import { Subscription } from "models/subscription";
import { RepoSyncState } from "models/reposyncstate";
import singleInstallation from "fixtures/jira-configuration/single-installation.json";
import failedInstallation from "fixtures/jira-configuration/failed-installation.json";
import { booleanFlag, BooleanFlags } from "config/feature-flags";
import { getLogger } from "config/logger";
import { when } from "jest-when";

jest.mock("config/feature-flags");

describe("Jira Configuration Suite", () => {
	let subscription: Subscription;
	let installation: Installation;

	beforeEach(async () => {
		subscription = await Subscription.create({
			gitHubInstallationId: 15,
			jiraHost,
			jiraClientKey: "clientKey",
			syncWarning: "some warning",
			totalNumberOfRepos: 1
		});

		await RepoSyncState.create({
			subscriptionId: subscription.id,
			repoId: 1,
			repoName: "test-repo-name",
			repoOwner: "integrations",
			repoFullName: "integrations/test-repo-name",
			repoUrl: "test-repo-url",
			pullStatus: "pending",
			branchStatus: "complete",
			commitStatus: "complete"
		});

		installation = await Installation.create({
			jiraHost,
			clientKey: "abc123",
			//TODO: why? Comment this out make test works?
			//setting both fields make sequelize confused as it internally storage is just the "secrets"
			//secrets: "def234",
			sharedSecret: "ghi345"
		});

	});

	const mockRequest = (): any => ({
		query: { xdm_e: jiraHost },
		csrfToken: jest.fn().mockReturnValue({}),
		log: {
			info: jest.fn(),
			warn: jest.fn(),
			error: jest.fn(),
			debug: jest.fn()
		}
	});

	const mockResponse = (): any => ({
		locals: {
			jiraHost,
			installation
		},
		render: jest.fn().mockReturnValue({}),
		status: jest.fn().mockReturnValue({}),
		send: jest.fn().mockReturnValue({})
	});

	it("should return success message after page is rendered", async () => {
		const response = mockResponse();
		when(booleanFlag).calledWith(
			BooleanFlags.GHE_SERVER,
			expect.anything(),
			expect.anything()
		).mockResolvedValue(true);
		githubNock
			.get(`/app/installations/15`)
			.reply(200, singleInstallation);

		await JiraConfigurationGet(mockRequest(), response, jest.fn());
		const data = response.render.mock.calls[0][1];
		expect(data.hasConnections).toBe(true);
		expect(data.ghCloud.failedConnections.length).toBe(0);
		expect(data.ghCloud.successfulConnections.length).toBe(1);
	});

	describe("getInstallations", () => {
		let sub: Subscription;
		const logger = getLogger("MOCK");

		beforeEach(async () => {
			sub = await Subscription.create({
				gitHubInstallationId: 12345678,
				jiraHost,
				jiraClientKey: "myClientKey",
				totalNumberOfRepos: 0
			});
		});

		it("should return no success or failed connections if no subscriptions given", async () => {
			expect(await getInstallations([], logger)).toEqual({
				fulfilled: [],
				rejected: [],
				total: 0
			});
		});

		it("should return successful connections when installation exists", async () => {
			githubNock
				.get(`/app/installations/${sub.gitHubInstallationId}`)
				.reply(200, singleInstallation);

			expect(await getInstallations([sub], logger)).toMatchObject({
				fulfilled: [{
					id: sub.gitHubInstallationId,
					syncStatus: null,
					syncWarning: null,
					totalNumberOfRepos: 0,
					numberOfSyncedRepos: 0,
					jiraHost
				}],
				rejected: []
			});
		});

		it("should return a single failed connection if 1 connection fails", async () => {
			githubNock
				.get(`/app/installations/${sub.gitHubInstallationId}`)
				.reply(404, failedInstallation);

			expect(await getInstallations([sub], logger)).toMatchObject({
				fulfilled: [],
				rejected: [{
					error: {
						status: 404
					},
					id: sub.gitHubInstallationId,
					deleted: true
				}]
			});
		});

		it("should return one successful connection if installation exists and one failed one if installation doesn't exist", async () => {
			const failedSub: Subscription = await Subscription.create({
				gitHubInstallationId: 123,
				jiraHost,
				jiraClientKey: "myClientKey"
			});

			githubNock
				.get(`/app/installations/${sub.gitHubInstallationId}`)
				.reply(200, singleInstallation);

			githubNock
				.get(`/app/installations/${failedSub.gitHubInstallationId}`)
				.reply(404, failedInstallation);

			expect(await getInstallations([sub, failedSub], logger)).toMatchObject({
				fulfilled: [{
					id: sub.gitHubInstallationId,
					syncStatus: null,
					syncWarning: null,
					totalNumberOfRepos: 0,
					numberOfSyncedRepos: 0,
					jiraHost
				}],
				rejected: [{
					error: {
						status: 404
						// documentation_url: "https://docs.github.com/rest/reference/apps#get-an-installation-for-the-authenticated-app"
					},
					id: failedSub.gitHubInstallationId,
					deleted: true
				}]
			});
		});

		it("should return a multiple failed connections if no installations exists", async () => {
			const failedSub: Subscription = await Subscription.create({
				gitHubInstallationId: 123,
				jiraHost,
				jiraClientKey: "myClientKey"
			});

			githubNock
				.get(`/app/installations/${sub.gitHubInstallationId}`)
				.reply(404, failedInstallation);

			githubNock
				.get(`/app/installations/${failedSub.gitHubInstallationId}`)
				.reply(404, failedInstallation);

			expect(await getInstallations([sub, failedSub], logger)).toMatchObject({
				fulfilled: [],
				rejected: [
					{
						error: {
							status: 404
						},
						id: sub.gitHubInstallationId,
						deleted: true
					},
					{
						error: {
							status: 404
						},
						id: failedSub.gitHubInstallationId,
						deleted: true
					}
				]
			});
		});

		it("should return successful connection with correct number of repos and sync status", async () => {
			await Promise.all([
				RepoSyncState.create({
					subscriptionId: sub.id,
					repoId: 1,
					repoName: "github-for-jira",
					repoOwner: "atlassian",
					repoFullName: "atlassian/github-for-jira",
					repoUrl: "github.com/atlassian/github-for-jira",
					pullStatus: "complete",
					commitStatus: "complete",
					branchStatus: "complete",
					buildStatus: "complete",
					deploymentStatus: "complete"
				}),
				RepoSyncState.create({
					subscriptionId: sub.id,
					repoId: 1,
					repoName: "github-for-jira",
					repoOwner: "atlassian",
					repoFullName: "atlassian/github-for-jira",
					repoUrl: "github.com/atlassian/github-for-jira",
					pullStatus: "pending",
					commitStatus: "complete",
					branchStatus: "complete",
					buildStatus: "complete",
					deploymentStatus: "complete"
				}),
				sub.update({ totalNumberOfRepos: 2 })
			]);

			githubNock
				.get(`/app/installations/${sub.gitHubInstallationId}`)
				.reply(200, singleInstallation);

			expect(await getInstallations([sub], logger)).toMatchObject({
				fulfilled: [{
					id: sub.gitHubInstallationId,
					syncStatus: null,
					syncWarning: null,
					totalNumberOfRepos: 2,
					numberOfSyncedRepos: 1,
					jiraHost
				}],
				rejected: []
			});
		});
	});
});
