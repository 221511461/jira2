import { Application } from "express";
import { getFrontendApp } from "../../app";
import supertest from "supertest";
import { when } from "jest-when";
import { GithubConfigurationGet } from "./configuration/github-configuration-get";
import { GitHubServerApp } from "models/github-server-app";
import { Installation } from "models/installation";
import { v4 as v4uuid } from "uuid";
import { envVars } from "config/env";
import { getSignedCookieHeader } from "test/utils/cookies";
import { BooleanFlags, booleanFlag } from "config/feature-flags";

jest.mock("./configuration/github-configuration-get");
jest.mock("config/feature-flags");

const VALID_TOKEN = "valid-token";
const GITHUB_SERVER_APP_UUID: string = v4uuid();
const GITHUB_SERVER_APP_ID = Math.floor(Math.random() * 10000);

const turnGHE_FF_OnOff = (newStatus: boolean) => {
	when(jest.mocked(booleanFlag))
		.calledWith(BooleanFlags.GHE_SERVER, expect.anything(), expect.anything())
		.mockResolvedValue(newStatus);
};

const setupAppAndRouter = () => {
	return getFrontendApp({
		getSignedJsonWebToken: () => "",
		getInstallationAccessToken: async () => ""
	});
};

const prepareGitHubServerAppInDB = async (jiraInstallaionId: number) => {
	const existed = await GitHubServerApp.findForUuid(GITHUB_SERVER_APP_UUID);
	if (existed) return existed;
	return await GitHubServerApp.install({
		uuid: GITHUB_SERVER_APP_UUID,
		appId: GITHUB_SERVER_APP_ID,
		gitHubBaseUrl: gheUrl,
		gitHubClientId: "client-id",
		gitHubClientSecret: "gitHubClientSecret",
		webhookSecret: "webhookSecret",
		privateKey: "privateKey",
		gitHubAppName: "test-app-name",
		installationId: jiraInstallaionId
	});
};

const setupGitHubCloudPingNock = () => {
	githubNock.get("/").reply(200);
};

const setupGHEPingNock = () => {
	gheNock.get("/").reply(200);
};

const prepareNewInstallationInDB = async () => {
	return await Installation.install({
		host: jiraHost,
		sharedSecret: "sharedSecret",
		clientKey: "clientKey"
	});
};

const mockConfigurationGetProceed = ()=>{
	jest.mocked(GithubConfigurationGet).mockClear();
	jest.mocked(GithubConfigurationGet).mockImplementation(async (_req, res) => {
		res.end("ok");
	});
};

describe("GitHub router", () => {
	describe("Common route utilities", () => {
		beforeEach(() => {
			turnGHE_FF_OnOff(true);
		});
		describe("Cloud scenario", () => {
			let app: Application;
			beforeEach(() => {
				app = setupAppAndRouter();
				setupGitHubCloudPingNock();
				mockConfigurationGetProceed();
			});
			it("should skip uuid when absent", async () => {
				await supertest(app)
					.get(`/github/configuration`)
					.set(
						"Cookie",
						getSignedCookieHeader({
							jiraHost,
							githubToken: VALID_TOKEN
						})
					)
					.expect(200);
				expect(GithubConfigurationGet).toBeCalledWith(
					expect.anything(), //not matching req
					expect.objectContaining({ //matching res locals
						locals: expect.objectContaining({
							githubToken: VALID_TOKEN,
							jiraHost,
							gitHubAppConfig: expect.objectContaining({
								appId: envVars.APP_ID,
								gitHubClientSecret: envVars.GITHUB_CLIENT_SECRET,
								webhookSecret: envVars.WEBHOOK_SECRET
							})
						})
					}),
					expect.anything()
				);
				expect(GithubConfigurationGet).toBeCalledTimes(1);
				const actualLocals = jest.mocked(GithubConfigurationGet)
					.mock.calls[0][1].locals;
				expect(actualLocals)
					.toEqual(expect.objectContaining({
						githubToken: VALID_TOKEN,
						jiraHost,
						gitHubAppConfig: expect.objectContaining({
							appId: envVars.APP_ID,
							gitHubClientSecret: envVars.GITHUB_CLIENT_SECRET,
							webhookSecret: envVars.WEBHOOK_SECRET
						})
					}));
			});
		});
		describe("GitHubServer", () => {
			let app: Application;
			let jiraInstallaionId: number;
			let gitHubAppId: number;
			beforeEach(async () => {
				app = setupAppAndRouter();
				const installation = await prepareNewInstallationInDB();
				jiraInstallaionId = installation.id;
				const gitHubApp = await prepareGitHubServerAppInDB(jiraInstallaionId);
				gitHubAppId = gitHubApp.id;
				mockConfigurationGetProceed();
			});
			it("should extract uuid when present", async () => {
				setupGHEPingNock();
				await supertest(app)
					.get(`/github/${GITHUB_SERVER_APP_UUID}/configuration`)
					.set(
						"Cookie",
						getSignedCookieHeader({
							jiraHost,
							githubToken: VALID_TOKEN
						})
					)
					.expect(200);
				expect(GithubConfigurationGet).toBeCalledWith(
					expect.anything(), //not matching req
					expect.objectContaining({ //matching res locals
						locals: expect.objectContaining({
							githubToken: VALID_TOKEN,
							jiraHost,
							gitHubAppId: gitHubAppId,
							gitHubAppConfig: expect.objectContaining({
								appId: GITHUB_SERVER_APP_ID,
								uuid: GITHUB_SERVER_APP_UUID,
								gitHubClientSecret: "gitHubClientSecret",
								webhookSecret: "webhookSecret",
								privateKey: "privateKey"
							})
						})
					}),
					expect.anything()
				);
			});
			it("should not match route, return empty if uuid present but invalid", async ()=>{
				setupGitHubCloudPingNock(); //since uuid invalid, this fallsback to cloud
				await supertest(app)
					.get(`/github/${GITHUB_SERVER_APP_UUID + "random-gibberish"}/configuration`)
					.set(
						"Cookie",
						getSignedCookieHeader({
							jiraHost,
							githubToken: VALID_TOKEN
						})
					)
					.expect(404);
				expect(GithubConfigurationGet).not.toHaveBeenCalled();
			});
		});
	});
});
