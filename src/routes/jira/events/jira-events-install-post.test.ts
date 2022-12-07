/* eslint-disable @typescript-eslint/no-explicit-any */
import { JiraEventsInstallPost } from "./jira-events-install-post";
import { mocked } from "ts-jest/utils";
import { Installation } from "models/installation";

jest.mock("models/installation");

describe("Webhook: /events/installed", () => {
	let installation;
	let body;

	beforeEach(async () => {
		body = {
			baseUrl: "https://test-host.jira.com",
			clientKey: "abc123",
			sharedSecret: "ghi345"
		};

		installation = {
			id: 19,
			jiraHost: body.baseUrl,
			clientKey: body.clientKey,
			enabled: true,
			subscriptions: jest.fn().mockResolvedValue([])
		};

		// Allows us to modify installation before it's finally called
		mocked(Installation.install).mockImplementation(() => installation);
	});

	it("Install", async () => {
		const req = {
			log: {
				info: jest.fn(),
				debugger: jest.fn(),
				error: jest.fn(),
				child: () => ({
					warn: jest.fn(),
					info: jest.fn(),
					errors: jest.fn()
				})
			},
			body
		};
		const res = { sendStatus: jest.fn(), on: jest.fn() };

		await JiraEventsInstallPost(req as any, res as any);
		expect(res.sendStatus).toHaveBeenCalledWith(204);
	});
});
