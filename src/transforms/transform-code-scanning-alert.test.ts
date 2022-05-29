import { transformCodeScanningAlert } from "./transform-code-scanning-alert";
import codeScanningPayload from "./../../test/fixtures/api/code-scanning-alert.json";
import { Context } from "probot/lib/context";
import { getLogger } from "./../config/logger";
import { GitHubAPI } from "probot";
import { when } from "jest-when";
import { booleanFlag, BooleanFlags } from "config/feature-flags";
jest.mock("config/feature-flags");

const buildContext = (payload): Context => {
	return new Context({
		"id": "hi",
		"name": "hi",
		"payload": payload
	}, GitHubAPI(), getLogger("logger"));
}

describe("code_scanning_alert transform", () => {
	Date.now = jest.fn(() => 12345678);
	const gitHubInstallationId = 1234;

	it("code_scanning_alert is transformed into a remote link", async () => {
		const remoteLinks = await transformCodeScanningAlert(buildContext(codeScanningPayload), gitHubInstallationId);
		expect(remoteLinks).toMatchObject({
			remoteLinks: [{
				schemaVersion: "1.0",
				id: "403470608-272",
				updateSequenceNumber: 12345678,
				displayName: "Alert #272",
				description: "Reflected cross-site scripting",
				url: "https://github.com/TerryAg/github-jira-test/security/code-scanning/272",
				type: "security",
				status: {
					appearance: "removed",
					label: "open"
				},
				lastUpdated: "2021-09-06T06:00:00Z",
				associations: [{
					associationType: "issueKeys",
					values: ["GH-9"]
				}]
			}]
		})
	})

	it("manual code_scanning_alert maps to multiple Jira issue keys", async () => {
		const payload = {...codeScanningPayload, action: "closed_by_user"};
		const remoteLinks = await transformCodeScanningAlert(buildContext(payload), gitHubInstallationId);
		expect(remoteLinks?.remoteLinks[0].associations[0].values).toEqual(["GH-9", "GH-10", "GH-11"])
	})

	it("code_scanning_alert truncates to a shorter description if too long", async () => {
		const payload = {
			...codeScanningPayload,
			alert: {...codeScanningPayload.alert, rule: {...codeScanningPayload.alert.rule, description: "A".repeat(300)}}
		};
		const remoteLinks = await transformCodeScanningAlert(buildContext(payload), gitHubInstallationId);
		expect(remoteLinks?.remoteLinks[0].description).toHaveLength(255);
	})

	it("code_scanning_alert with pr reference queries Pull Request title - OctoKit", async () => {
		const payload = {...codeScanningPayload, ref: "refs/pull/8/merge"};
		const context = buildContext(payload);
		const mySpy = jest.spyOn(context.github.pulls, "get");
		when(booleanFlag).calledWith(
			BooleanFlags.USE_NEW_GITHUB_CLIENT_FOR_PR_TITLE,
			expect.anything(),
			expect.anything()
		).mockResolvedValue(false);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(mySpy as jest.MockInstance<any, any>).mockResolvedValue({
			data: {
				title: "GH-10"
			},
			status: 200
		});
		const remoteLinks = await transformCodeScanningAlert(context, gitHubInstallationId);
		expect(remoteLinks?.remoteLinks[0].associations[0].values[0]).toEqual("GH-10");
	})

	it("code_scanning_alert with pr reference queries Pull Request title - GH Client", async () => {
		const payload = {...codeScanningPayload, ref: "refs/pull/8/merge"};
		const context = buildContext(payload);
		when(booleanFlag).calledWith(
			BooleanFlags.USE_NEW_GITHUB_CLIENT_FOR_PR_TITLE,
			expect.anything(),
			expect.anything()
		).mockResolvedValue(true);

		githubNock.get(`/repos/TerryAg/github-jira-test/pulls/8`)
			.reply(200, {
				title: "GH-10"
			});


		const remoteLinks = await transformCodeScanningAlert(context, gitHubInstallationId);
		expect(remoteLinks?.remoteLinks[0].associations[0].values[0]).toEqual("GH-10");
	})
})
