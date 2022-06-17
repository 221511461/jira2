/* eslint-disable @typescript-eslint/no-explicit-any */
export const mockModels = {
	Installation: {
		getForHost: {
			jiraHost: process.env.ATLASSIAN_URL,
			sharedSecret: process.env.ATLASSIAN_SECRET,
			enabled: true
		} as any,
		findByPk: {
			gitHubInstallationId: 1234,
			enabled: true,
			id: 1234,
			jiraHost: process.env.ATLASSIAN_URL
		} as any,
		install: {
			id: 1234,
			jiraHost: process.env.ATLASSIAN_URL,
			sharedSecret: process.env.ATLASSIAN_SECRET,
			enabled: true,
			secrets: "secrets",
			clientKey: "client-key"
		} as any
	},
	Subscription: {
		getAllForInstallation: [
			{
				jiraHost: process.env.ATLASSIAN_URL
			}
		] as any,
		install: {} as any,
		getSingleInstallation: {
			id: 1,
			jiraHost: process.env.ATLASSIAN_URL,
			gitHubInstallationId: 1234
		} as any,
		findOrStartSync: {
			id: 1,
			data: {
				installationId: 1234,
				jiraHost: process.env.ATLASSIAN_URL
			}
		} as any,
		getAllForHost: {
			id: 1,
			jiraHost: process.env.ATLASSIAN_URL
		} as any
	},
	GitHubServerApp: {
		install: {
			uuid: "97da6b0e-ec61-11ec-8ea0-0242ac120002",
			gitHubAppName: "My GitHub Server App",
			gitHubBaseUrl: "http://myinternalserver.com",
			gitHubClientId: "lvl.1234",
			gitHubClientSecret: "myghsecret",
			webhookSecret: "mywebhooksecret",
			privateKey: "myprivatekey",
			installationId: 2
		} as any,
		getForGitHubServerAppId: {
			gitHubServerAppId: 3
		}
	}
};
