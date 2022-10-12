import { e2eEnvVars } from "test/e2e/env-e2e";

export const STATE_PATH = "./test/e2e/test-results/states";
export const SCREENSHOT_PATH = "./test/e2e/test-results/screenshots";

export const testData: TestData = {
	storagePath: STATE_PATH,
	jira: {
		urls: {
			base: e2eEnvVars.ATLASSIAN_URL,
			login: `${e2eEnvVars.ATLASSIAN_URL}/login`,
			auth: `https://id.atlassian.com/login`,
			logout: `${e2eEnvVars.ATLASSIAN_URL}/logout`,
			dashboard: `${e2eEnvVars.ATLASSIAN_URL}/jira/dashboards`,
			yourWork: `${e2eEnvVars.ATLASSIAN_URL}/jira/your-work`,
			manageApps: `${e2eEnvVars.ATLASSIAN_URL}/plugins/servlet/upm`,
			connectJson: `${e2eEnvVars.APP_URL}/jira/atlassian-connect.json`
		},
		roles: {
			admin: {
				username: e2eEnvVars.JIRA_ADMIN_USERNAME,
				password: e2eEnvVars.JIRA_ADMIN_PASSWORD,
				storage: `${STATE_PATH}/jira-admin.json`
			}
		}
	},
	github: {
		urls: {
			base: e2eEnvVars.GITHUB_URL,
			login: `${e2eEnvVars.GITHUB_URL}/login`,
			logout: `${e2eEnvVars.GITHUB_URL}/logout`,
			appSettings: `${e2eEnvVars.GITHUB_URL}/settings/apps/${e2eEnvVars.APP_NAME}`,
			apps: `${e2eEnvVars.GITHUB_URL}/user/settings/apps`
		},
		roles: {
			admin: {
				username: e2eEnvVars.GITHUB_USERNAME,
				password: e2eEnvVars.GITHUB_PASSWORD
				// storage: `${STATE_PATH}/github-admin.json`
			}
		}
	}
};

export interface TestData {
	storagePath: string;
	jira: TestDataEntry<JiraTestDataURLs, JiraTestDataRoles>;
	github: TestDataEntry<GithubTestDataURLs>;
}

export interface TestDataEntry<U extends TestDataURLs = TestDataURLs, R extends TestDataRoles = TestDataRoles> {
	urls: U;
	roles: R;
}

export interface TestDataURLs {
	base: string;
	login: string;
	logout: string;
}

export interface JiraTestDataURLs extends TestDataURLs {
	yourWork: string;
	dashboard: string;
	auth: string;
	manageApps: string;
	connectJson: string;
}

export interface GithubTestDataURLs extends TestDataURLs {
	appSettings: string;
	apps: string;
}

export interface TestDataRoles {
	admin: TestDataRole;
}

export type GithubTestDataRoles = TestDataRoles;
export type JiraTestDataRoles = TestDataRoles;

export interface TestDataRole {
	username: string;
	password: string;
	storage?: string;
}
