/* eslint-disable jest/expect-expect */
import supertest from "supertest";
import { Installation } from "models/installation";
import { getFrontendApp } from "~/src/app";
import { Application } from "express";
import { generateSignedSessionCookieHeader } from "test/utils/cookies";
import { envVars }  from "config/env";

import singleInstallation from "fixtures/jira-configuration/single-installation.json";

describe("Github Setup", () => {
	let frontendApp: Application;
	let jiraDomain: string;

	beforeEach(async () => {
		jiraDomain = jiraHost.replace(/https?:\/\//, "").replace(/\.atlassian\.(net|com)/, "");
		frontendApp = getFrontendApp();
	});

	describe("#GET", () => {
		const installation_id = 1234;
		beforeEach(async () => {
			await Installation.create({
				jiraHost,
				clientKey: "abc123",
				//TODO: why? Comment this out make test works?
				//setting both fields make sequelize confused as it internally storage is just the "secrets"
				//secrets: "def234",
				//secrets: "def234",
				encryptedSharedSecret: "ghi345"
			});

		});

		describe("For new 5KU experience", () => {

			it("should notify page on success org installation", async () => {
				await supertest(frontendApp).get("/github/setup?installation_id=12345")
					.set("Cookie", ["is-spa=true;"])
					.expect("set-cookie", "is-spa=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT")
					.expect(302)
					.expect("location", "/rest/app/cloud/github-installed?installation_id=12345");
			});

			it("should notify page on requested org installation", async () => {
				await supertest(frontendApp).get("/github/setup?setup_action=request")
					.set("Cookie", ["is-spa=true;"])
					.expect("set-cookie", "is-spa=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT")
					.expect(302)
					.expect("location", "/rest/app/cloud/github-requested?setup_action=request");
			});
		});

		it("should return error when missing 'installation_id' from query", async () => {
			await supertest(frontendApp)
				.get("/github/setup")
				.set(
					"Cookie",
					generateSignedSessionCookieHeader({
						jiraHost
					})
				)
				.expect(422);
		});

		it("should work with a missing app installation", async () => {
			githubAppTokenNock();
			githubNock
				.get(`/app/installations/${installation_id}`)
				.reply(404);
			await supertest(frontendApp)
				.get("/github/setup")
				.set(
					"Cookie",
					generateSignedSessionCookieHeader({
						jiraHost
					})
				)
				.query({ installation_id })
				.expect(200);
		});

		it("should return 200 without jiraHost", async () => {
			githubAppTokenNock();
			githubNock
				.get(`/app/installations/${installation_id}`)
				.reply(200, singleInstallation);
			await supertest(frontendApp)
				.get("/github/setup")
				.set(
					"Cookie",
					generateSignedSessionCookieHeader({
						jiraHost
					})
				)
				.query({ installation_id })
				.expect(200);
		});

		it("should return 200 with jiraHost", async () => {
			githubAppTokenNock();
			githubNock
				.get(`/app/installations/${installation_id}`)
				.reply(200, singleInstallation);
			await supertest(frontendApp)
				.get("/github/setup")
				.query({ installation_id })
				.set(
					"Cookie",
					generateSignedSessionCookieHeader({
						jiraHost
					})
				)
				.expect(200);
		});
	});

	describe("#POST", () => {
		it.skip("should return a 200 with the redirect url to marketplace if a valid domain is given", async () => {
			jiraNock
				.get("/status")
				.reply(200);

			await supertest(frontendApp)
				.post("/github/setup")
				.set(
					"Cookie",
					generateSignedSessionCookieHeader({
						jiraHost
					})
				)
				.send({
					jiraDomain
				})
				.expect(res => {
					expect(res.status).toBe(200);
					expect(res.body.redirect).toBe(`${jiraHost}/jira/marketplace/discover/app/com.github.integration.production`);
				});
		});

		it("should return a 200 with the redirect url to the app if a valid domain is given and an installation already exists", async () => {
			await Installation.create({
				jiraHost,
				encryptedSharedSecret: "sharedSecret",
				clientKey: "clientKey"
			});

			jiraNock
				.get("/status")
				.reply(200);

			await supertest(frontendApp)
				.post("/github/setup")
				.set(
					"Cookie",
					generateSignedSessionCookieHeader({
						jiraHost
					})
				)
				.send({
					jiraDomain
				})
				.expect(res => {
					expect(res.status).toBe(200);
					expect(res.body.redirect).toBe(`${jiraHost}/plugins/servlet/ac/${envVars.APP_KEY}/github-post-install-page`);
				});
		});

		it.skip("should return a 400 if no domain is given", () =>
			supertest(frontendApp)
				.post("/github/setup")
				.set(
					"Cookie",
					generateSignedSessionCookieHeader({
						jiraHost
					})
				)
				.send({})
				.expect(400));

		it.skip("should return a 400 if an empty domain is given", () =>
			supertest(frontendApp)
				.post("/github/setup")
				.set(
					"Cookie",
					generateSignedSessionCookieHeader({
						jiraHost
					})
				)
				.send({
					jiraDomain: ""
				})
				.expect(400));
	});
});
