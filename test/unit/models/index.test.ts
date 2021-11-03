/* eslint-disable jest/no-conditional-expect */
import { Installation, Subscription } from "../../../src/models";
import { getHashedKey } from "../../../src/models/installation";

describe("test installation model", () => {
	const newInstallPayload = {
		key: "com.github.integration.production",
		clientKey: "a-totally-unique-client-key",
		publicKey: "this-is-a-public-key",
		sharedSecret: "shared-secret",
		serverVersion: "100104",
		pluginsVersion: "1.415.0",
		baseUrl: "https://test-user.atlassian.net",
		productType: "jira",
		description: "Atlassian JIRA at https://test-user.atlassian.net ",
		eventType: "installed"
	};

	// this payload is identical to newInstallPayload except for a renamed `baseUrl`
	const renamedInstallPayload = {
		key: "com.github.integration.production",
		clientKey: "a-totally-unique-client-key", // This is the same clientKey as above
		publicKey: "this-is-a-public-key",
		sharedSecret: "shared-secret",
		serverVersion: "100104",
		pluginsVersion: "1.415.0",
		baseUrl: "https://renamed-user.atlassian.net", // This is the only part that's different
		productType: "jira",
		description: "Atlassian JIRA at https://renamed-user.atlassian.net ",
		eventType: "installed"
	};

	// Setup an installation
	const existingInstallPayload = {
		key: "com.github.integration.production",
		clientKey: "a-totally-unique-client-key",
		publicKey: "this-is-a-public-key",
		sharedSecret: "shared-secret",
		serverVersion: "100104",
		pluginsVersion: "1.415.0",
		baseUrl: "https://existing-instance.atlassian.net",
		productType: "jira",
		description: "Atlassian JIRA at https://existing-instance.atlassian.net ",
		eventType: "installed"
	};

	let storageSecret: string | undefined;

	beforeEach(async () => {
		storageSecret = process.env.STORAGE_SECRET;
		process.env.STORAGE_SECRET = "test-secret";

		const installation = await Installation.install({
			host: existingInstallPayload.baseUrl,
			sharedSecret: existingInstallPayload.sharedSecret,
			clientKey: existingInstallPayload.clientKey
		});

		// Setup two subscriptions for this host
		await Subscription.install({
			host: installation.jiraHost,
			installationId: "1234",
			clientKey: installation.clientKey
		});

		await Subscription.install({
			host: installation.jiraHost,
			installationId: "2345",
			clientKey: installation.clientKey
		});
	});

	afterEach(async () => {
		process.env.STORAGE_SECRET = storageSecret;
		// Clean up the database
		await Installation.truncate({
			cascade: true,
			restartIdentity: true
		});

		await Subscription.truncate({
			cascade: true,
			restartIdentity: true
		});
	});

	it("installs app when it receives an install payload from jira", async () => {
		const installation = await Installation.install({
			host: newInstallPayload.baseUrl,
			sharedSecret: newInstallPayload.sharedSecret,
			clientKey: newInstallPayload.clientKey,
		});

		expect(installation.jiraHost).toBe(newInstallPayload.baseUrl);

		// We hash the client key with the STORAGE_SECRET variable,
		// so the payload we received should be stored in the database
		// as a hashed key
		const hashedKey = getHashedKey(newInstallPayload.clientKey);
		expect(installation.clientKey).toBe(hashedKey);
	});

	it("updates the jiraHost for an installation when a site is renamed", async () => {
		const newInstallation = await Installation.install({
			host: newInstallPayload.baseUrl,
			sharedSecret: newInstallPayload.sharedSecret,
			clientKey: newInstallPayload.clientKey
		});
		expect(newInstallation.jiraHost).toBe(newInstallPayload.baseUrl);

		const updatedInstallation = await Installation.install({
			host: renamedInstallPayload.baseUrl,
			sharedSecret: renamedInstallPayload.sharedSecret,
			clientKey: renamedInstallPayload.clientKey
		});

		expect(updatedInstallation.jiraHost).toBe(renamedInstallPayload.baseUrl);
	});

	it("updates all Subscriptions for a given jira clientKey when a site is renamed", async () => {
		const updatedInstallation = await Installation.install({
			host: renamedInstallPayload.baseUrl,
			sharedSecret: renamedInstallPayload.sharedSecret,
			clientKey: renamedInstallPayload.clientKey
		});

		const updatedSubscriptions = await Subscription.getAllForClientKey(
			updatedInstallation.clientKey
		);

		expect(updatedSubscriptions.length).toBe(2);

		for (const subscription of updatedSubscriptions) {
			expect(subscription.jiraHost).toBe(renamedInstallPayload.baseUrl);
		}
	});

	it("should return the most recent entry if there are duplicate hosts", async () => {
		const jiraHost = "https://myfakejirasite.net";
		// Install jira host
		await Installation.install({
			host: jiraHost,
			sharedSecret: "badsecret",
			clientKey: "1234567",
		});

		const singleInstallation = await Installation.getAllForHost(jiraHost);
		expect(singleInstallation.length).toEqual(1);

		// Install duplicate of jira host
		await Installation.install({
			host: jiraHost,
			sharedSecret: "goodsecret",
			clientKey: "12345678",
		});

		const installations = await Installation.getAllForHost(jiraHost);
		expect(installations.length).toEqual(2);

		installations.forEach((installation) => {
			// both installations should have the same host.
			expect(installation.jiraHost).toBe(jiraHost);
		});

		// Ids of installations should decrement to ensure most recently added is retrieved first
		expect(installations[0].id).toBeGreaterThan(installations[1].id);

		const firstRetreivedInstallation = await Installation.getForHost(jiraHost);
		expect(firstRetreivedInstallation?.id).toEqual(installations[0].id);
	});
});
