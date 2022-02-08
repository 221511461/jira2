import supertest from "supertest";
import express, { NextFunction, Request, Response } from "express";
import Logger from "bunyan";
import api from "../../src/routes/api";
import SubscriptionModel from "../../src/models/subscription";
import { Subscription } from "../../src/models";
import { wrapLogger } from "probot/lib/wrap-logger";

describe("api/index", () => {
	let sub: SubscriptionModel;
	beforeEach(async () => {
		sub = await Subscription.create({
			gitHubInstallationId: 123,
			jiraHost: "http://blah.com",
			jiraClientKey: "myClientKey",
		});

		githubNock
			.post("/graphql")
			.reply(200, {
				data: {
					viewer: {
						login: "monalisa",
						organization: {
							viewerCanAdminister: true
						}
					}
				}
			})
	});

	const createApp = async () => {
		const app = express();
		app.use((req: Request, res: Response, next: NextFunction) => {
			res.locals = {};
			req.log = wrapLogger(new Logger({
				name: "api.test.ts",
				level: "debug",
				stream: process.stdout
			}));
			req.session = { jiraHost: "http://blah.com" };
			next();
		});
		app.use("/api", api);
		return app;
	};

	it("should GET syncstate", async () => {
		await supertest(await createApp())
			.get(`/api/${sub.gitHubInstallationId}/${encodeURIComponent(sub.jiraHost)}/syncstate`)
			.set("Authorization", "Bearer xxx")
			.then((response) => {
				expect(response.text).toStrictEqual("{\"installationId\":123,\"jiraHost\":\"http://blah.com\",\"numberOfSyncedRepos\":0,\"repos\":{}}");
			});
	});
});
