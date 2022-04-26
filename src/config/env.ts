import dotenv from "dotenv";
import path from "path";
import { LogLevelString } from "bunyan";
import { getNodeEnv, isNodeTest } from "utils/is-node-env";
import { EnvironmentEnum } from "interfaces/common";

const nodeEnv: EnvironmentEnum = EnvironmentEnum[getNodeEnv()];

const requiredEnvVars = [
	"APP_ID",
	"APP_URL",
	"WEBHOOK_SECRET",
	"GITHUB_CLIENT_ID",
	"GITHUB_CLIENT_SECRET",
	"SQS_BACKFILL_QUEUE_URL",
	"SQS_BACKFILL_QUEUE_REGION",
	"SQS_PUSH_QUEUE_URL",
	"SQS_PUSH_QUEUE_REGION",
	"SQS_DISCOVERY_QUEUE_URL",
	"SQS_DISCOVERY_QUEUE_REGION",
	"SQS_DEPLOYMENT_QUEUE_URL",
	"SQS_DEPLOYMENT_QUEUE_REGION",
	"SQS_BRANCH_QUEUE_URL",
	"SQS_BRANCH_QUEUE_REGION",
	"MICROS_AWS_REGION"
];

const filename = isNodeTest() ? ".env.test" : ".env";
const env = dotenv.config({
	path: path.resolve(process.cwd(), filename)
});

// TODO: add checks for environment variables here and error out if missing any
if (env.error && nodeEnv !== EnvironmentEnum.production) {
	throw env.error;
}

const getProxyFromEnvironment = (): string | undefined => {
	const proxyHost = process.env.EXTERNAL_ONLY_PROXY_HOST;
	const proxyPort = process.env.EXTERNAL_ONLY_PROXY_PORT;
	return proxyHost && proxyPort ? `http://${proxyHost}:${proxyPort}` : undefined;
};

export const envVars: EnvVars = {
	...process.env,
	MICROS_ENV: EnvironmentEnum[process.env.MICROS_ENV || EnvironmentEnum.development],
	MICROS_SERVICE_VERSION: process.env.MICROS_SERVICE_VERSION,
	NODE_ENV: nodeEnv,
	SENTRY_DSN: process.env.SENTRY_DSN,
	JIRA_LINK_TRACKING_ID: process.env.JIRA_LINK_TRACKING_ID,
	PROXY: getProxyFromEnvironment(),
	GITHUB_REPO_URL: "https://github.com/atlassian/github-for-jira",
	GITHUB_HOSTNAME: process.env.GHE_HOST || "github.com"
} as EnvVars;

// TODO: Make envvars dynamic
// Check to see if all required environment variables are set
const missingVars = requiredEnvVars.filter(key => envVars[key] === undefined);
if (missingVars.length) {
	throw new Error(`Missing required Environment Variables: ${missingVars.join(", ")}`);
}

export interface EnvVars {
	NODE_ENV: EnvironmentEnum,
	MICROS_ENV: EnvironmentEnum;
	MICROS_SERVICE_VERSION?: string;
	SQS_BACKFILL_QUEUE_URL: string;
	SQS_BACKFILL_QUEUE_REGION: string;
	SQS_PUSH_QUEUE_URL: string;
	SQS_PUSH_QUEUE_REGION: string;
	SQS_DISCOVERY_QUEUE_URL: string;
	SQS_DISCOVERY_QUEUE_REGION: string;
	SQS_DEPLOYMENT_QUEUE_URL: string;
	SQS_DEPLOYMENT_QUEUE_REGION: string;
	SQS_BRANCH_QUEUE_URL: string;
	SQS_BRANCH_QUEUE_REGION: string;

	APP_ID: string;
	APP_URL: string;
	WEBHOOK_SECRET: string;
	GITHUB_CLIENT_ID: string;
	GITHUB_CLIENT_SECRET: string;
	INSTANCE_NAME: string;
	DATABASE_URL: string;
	STORAGE_SECRET: string;
	PRIVATE_KEY_PATH: string;
	ATLASSIAN_URL: string;
	WEBHOOK_PROXY_URL: string;
	MICROS_AWS_REGION: string;
	TUNNEL_PORT?: string;
	TUNNEL_SUBDOMAIN?: string;
	LOG_LEVEL?: LogLevelString;
	SENTRY_DSN?: string,
	JIRA_LINK_TRACKING_ID?: string,
	PROXY?: string,
	LAUNCHDARKLY_KEY?: string;
	GIT_COMMIT_SHA?: string;
	GIT_COMMIT_DATE?: string;
	GIT_BRANCH_NAME?: string;
	GITHUB_REPO_URL: string;
	GITHUB_HOSTNAME: string;
	DEPLOYMENT_DATE: string;
	BULL_QUEUE_PREFIX?: string;

	// Test Vars
	ATLASSIAN_SECRET?: string;
	AWS_ACCESS_KEY_ID?: string;
	AWS_SECRET_ACCESS_KEY?: string;
	SQS_TEST_QUEUE_URL: string;
	SQS_TEST_QUEUE_REGION: string;

	// Micros Lifecycle Env Vars
	SNS_NOTIFICATION_LIFECYCLE_QUEUE_URL?: string;
	SNS_NOTIFICATION_LIFECYCLE_QUEUE_NAME?: string;
	SNS_NOTIFICATION_LIFECYCLE_QUEUE_REGION?: string;
}
