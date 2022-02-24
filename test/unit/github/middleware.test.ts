import { mocked } from "ts-jest/utils";
import { Installation, Subscription } from "../../../src/models";
import GitHubAPI from "../../../src/config/github-api";
import middleware from "../../../src/github/middleware";
import { mockModels } from "../../utils/models";
import {wrapLogger} from "probot/lib/wrap-logger";
import Logger from "bunyan";
import {Writable} from "stream";
import { emitWebhookFailedMetrics } from "../../../src/util/webhooks";

jest.mock("../../../src/models");
jest.mock("../../../src/util/webhooks");

describe("Probot event middleware", () => {
	let context;
	let loggedStuff = "";
	beforeEach(async () => {
		context = {
			payload: {
				sender: {type: "not bot"},
				installation: {id: 1234}
			},
			github: GitHubAPI(),
			log: wrapLogger(Logger.createLogger({
				name: "test",
				stream: new Writable({
					write: function (chunk, _, next) {
						loggedStuff += chunk.toString();
						next();
					}
				})
			}))
		};

		const subscriptions = [...mockModels.Subscription.getAllForInstallation];
		// Repeat subscription 2 more times (3 total)
		subscriptions.push(subscriptions[0]);
		subscriptions.push(subscriptions[0]);
		mocked(Subscription.getAllForInstallation).mockResolvedValue(
			subscriptions
		);
	});

	describe("calls handler for each subscription", () => {
		it("when all ok", async () => {

			mocked(Installation.getForHost).mockResolvedValue(
				mockModels.Installation.getForHost
			);

			const spy = jest.fn();
			await expect(middleware(spy)(context)).toResolve();
			expect(spy).toHaveBeenCalledTimes(3);
		});

		it("when one call fails", async () => {
			mocked(Installation.getForHost).mockResolvedValue(
				mockModels.Installation.getForHost
			);

			const spy = jest.fn().mockRejectedValueOnce(new Error("Failed!"));
			await expect(middleware(spy)(context)).toResolve();
			expect(spy).toHaveBeenCalledTimes(3);
		});

		it("when all calls fail", async () => {
			mocked(Installation.getForHost).mockResolvedValue(
				mockModels.Installation.getForHost
			);

			const spy = jest.fn().mockRejectedValue(new Error("Failed!"));
			await expect(middleware(spy)(context)).toResolve();
			expect(spy).toHaveBeenCalledTimes(3);
		});

		it("should not call slo metrics when call fails with 401/404s", async () => {
			mocked(Installation.getForHost).mockResolvedValue(
				mockModels.Installation.getForHost
			);

			const spy = jest.fn().mockRejectedValue(new Error("Request Failed with 401"));
			await expect(middleware(spy)(context)).toResolve();
			expect(spy).toHaveBeenCalledTimes(3);
			expect(emitWebhookFailedMetrics).not.toHaveBeenCalled();
		});

		it("should call slo metrics when call fails with other errors", async () => {
			mocked(Installation.getForHost).mockResolvedValue(
				mockModels.Installation.getForHost
			);

			const spy = jest.fn().mockRejectedValue(new Error("Request Failed with 500"));
			await expect(middleware(spy)(context)).toResolve();
			expect(spy).toHaveBeenCalledTimes(3);
			expect(emitWebhookFailedMetrics).toHaveBeenCalled();
		});
	});

	it("preserves parent log", async () => {
		context.log = context.log.child({foo: 123});
		await middleware(jest.fn())(context);
		context.log.info("test");
		expect(loggedStuff).toContain("foo");
		expect(loggedStuff).toContain(123);
	});
});
