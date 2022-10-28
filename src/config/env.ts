import { config } from "dotenv";
import { expand } from "dotenv-expand";
import path from "path";
import { LogLevelString } from "bunyan";
import { getNodeEnv } from "utils/is-node-env";
import { EnvironmentEnum } from "interfaces/common";
import { envCheck } from "utils/env-utils";

const nodeEnv: EnvironmentEnum = EnvironmentEnum[getNodeEnv()];

// Load environment files
[
	`.env.${nodeEnv}.local`,
	`.env.local`,
	`.env.${nodeEnv}`,
	".env"
].map((env) => expand(config({
	path: path.resolve(__dirname, "../..", env)
})));

type Transforms<T, K extends keyof T = keyof T> = {
	[P in K]?: (value?: string) => T[P];
};

const transforms: Transforms<EnvVars> = {
	MICROS_ENV: (value?: string) => EnvironmentEnum[value || EnvironmentEnum.development],
	MICROS_GROUP: (value?: string) => value || "",
	NODE_ENV: () => nodeEnv,
	PROXY: () => {
		const proxyHost = process.env.EXTERNAL_ONLY_PROXY_HOST;
		const proxyPort = process.env.EXTERNAL_ONLY_PROXY_PORT;
		return proxyHost && proxyPort ? `http://${proxyHost}:${proxyPort}` : undefined;
	},
	GITHUB_REPO_URL: (value?: string) => value || "https://github.com/atlassian/github-for-jira"
};

// Create proxy for `process.env`
export const envVars: EnvVars = new Proxy<object>({}, {
	get(_target: object, prop: keyof EnvVars) {
		// get from process.env directly since the whole env object might be replaced
		const value = process.env[prop];
		return transforms[prop]?.(value) || value;
	}
}) as EnvVars;

envCheck(
	"APP_ID",
	"APP_URL",
	"INSTANCE_NAME",
	"WEBHOOK_SECRET",
	"GITHUB_CLIENT_ID",
	"GITHUB_CLIENT_SECRET",
	"SQS_BACKFILL_QUEUE_URL",
	"SQS_BACKFILL_QUEUE_REGION",
	"SQS_PUSH_QUEUE_URL",
	"SQS_PUSH_QUEUE_REGION",
	"SQS_DEPLOYMENT_QUEUE_URL",
	"SQS_DEPLOYMENT_QUEUE_REGION",
	"SQS_BRANCH_QUEUE_URL",
	"SQS_BRANCH_QUEUE_REGION",
	"MICROS_AWS_REGION",
	"GLOBAL_HASH_SECRET",
	"CRYPTOR_URL",
	"CRYPTOR_SIDECAR_CLIENT_IDENTIFICATION_CHALLENGE"
);

export interface EnvVars {
	NODE_ENV: EnvironmentEnum,
	MICROS_ENV: EnvironmentEnum;
	MICROS_SERVICE_VERSION?: string;
	MICROS_GROUP: string;
	SQS_BACKFILL_QUEUE_URL: string;
	SQS_BACKFILL_QUEUE_REGION: string;
	SQS_PUSH_QUEUE_URL: string;
	SQS_PUSH_QUEUE_REGION: string;
	SQS_DEPLOYMENT_QUEUE_URL: string;
	SQS_DEPLOYMENT_QUEUE_REGION: string;
	SQS_BRANCH_QUEUE_URL: string;
	SQS_BRANCH_QUEUE_REGION: string;
	SQS_DEPLOYMENT_GATING_POLLER_QUEUE_URL: string;
	SQS_DEPLOYMENT_GATING_POLLER_QUEUE_REGION: string;

	APP_ID: string;
	APP_URL: string;
	WEBHOOK_SECRET: string;
	GITHUB_CLIENT_ID: string;
	GITHUB_CLIENT_SECRET: string;
	INSTANCE_NAME: string;
	DATABASE_URL: string;
	STORAGE_SECRET: string;
	PRIVATE_KEY_PATH: string;
	PRIVATE_KEY: string;
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
	DEPLOYMENT_DATE: string;
	GLOBAL_HASH_SECRET: string;

	// Micros Lifecycle Env Vars
	SNS_NOTIFICATION_LIFECYCLE_QUEUE_URL?: string;
	SNS_NOTIFICATION_LIFECYCLE_QUEUE_NAME?: string;
	SNS_NOTIFICATION_LIFECYCLE_QUEUE_REGION?: string;

	// Cryptor
	CRYPTOR_URL: string;
	CRYPTOR_SIDECAR_CLIENT_IDENTIFICATION_CHALLENGE: string;

	REDISX_CACHE_PORT: string;
	REDISX_CACHE_HOST: string;
	REDISX_CACHE_TLS_ENABLED?: string;
}
