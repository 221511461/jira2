import LaunchDarkly, { LDUser } from "launchdarkly-node-server-sdk";
import { getLogger } from "./logger";
import { envVars }  from "./env";
import { createHashWithSharedSecret } from "utils/encryption";
import Logger from "bunyan";

const logger = getLogger("feature-flags");

const launchdarklyClient = LaunchDarkly.init(envVars.LAUNCHDARKLY_KEY || "", {
	offline: !envVars.LAUNCHDARKLY_KEY,
	logger
});

export enum BooleanFlags {
	MAINTENANCE_MODE = "maintenance-mode",
	ASSOCIATE_PR_TO_ISSUES_IN_BODY = "associate-pr-to-issues-in-body",
	VERBOSE_LOGGING = "verbose-logging",
	LOG_UNSAFE_DATA = "log-unsafe-data",
	SEND_CODE_SCANNING_ALERTS_AS_REMOTE_LINKS = "send-code-scanning-alerts-as-remote-links",
	REGEX_FIX = "regex-fix",
	USE_NEW_GITHUB_CLIENT_FOR_INSTALLATION_API = "use-new-github-client-for-installation-api",
	RETRY_ALL_ERRORS = "retry-all-errors",
	GHE_SERVER = "ghe_server",
	USE_REST_API_FOR_DISCOVERY = "use-rest-api-for-discovery",
	TAG_BACKFILL_REQUESTS = "tag-backfill-requests",
	CONFIG_AS_CODE = "config-as-code",
	CREATE_BRANCH = "create-branch",
	USE_GITHUB_CONFIG_IN_BASE_CLIENT = "use-githubconfig-in-base-client",
	USE_OUTBOUND_PROXY_SKIPLIST = "use-outbound-proxy-skiplist"
}

export enum StringFlags {
	BLOCKED_INSTALLATIONS = "blocked-installations",
	LOG_LEVEL = "log-level",
	OUTBOUND_PROXY_SKIPLIST = "outbound-proxy-skiplist"
}

export enum NumberFlags {
	GITHUB_CLIENT_TIMEOUT = "github-client-timeout",
	SYNC_MAIN_COMMIT_TIME_LIMIT = "sync-main-commit-time-limit",
	SYNC_BRANCH_COMMIT_TIME_LIMIT= "sync-branch-commit-time-limit",
}

const createLaunchdarklyUser = (jiraHost?: string): LDUser => {
	if (!jiraHost) {
		return {
			key: "global"
		};
	}

	return {
		key: createHashWithSharedSecret(jiraHost)
	};
};

const getLaunchDarklyValue = async <T = boolean | string | number>(flag: BooleanFlags | StringFlags | NumberFlags, defaultValue: T, jiraHost?: string): Promise<T> => {
	try {
		await launchdarklyClient.waitForInitialization();
		const user = createLaunchdarklyUser(jiraHost);
		return launchdarklyClient.variation(flag, user, defaultValue);
	} catch (err) {
		logger.error({ flag, err }, "Error resolving value for feature flag");
		return defaultValue;
	}
};

// Include jiraHost for any FF that needs to be rolled out in stages
export const booleanFlag = async (flag: BooleanFlags, defaultValue: boolean, jiraHost?: string): Promise<boolean> =>
	await getLaunchDarklyValue(flag, defaultValue, jiraHost);

export const stringFlag = async <T = string>(flag: StringFlags, defaultValue: T, jiraHost?: string): Promise<T> =>
	await getLaunchDarklyValue<T>(flag, defaultValue, jiraHost);

export const numberFlag = async (flag: NumberFlags, defaultValue: number, jiraHost?: string): Promise<number> =>
	await getLaunchDarklyValue(flag, defaultValue, jiraHost);

export const onFlagChange =  (flag: BooleanFlags | StringFlags | NumberFlags, listener: () => void):void => {
	launchdarklyClient.on(`update:${flag}`, listener);
};

export const isBlocked = async (installationId: number, logger: Logger): Promise<boolean> => {
	try {
		const blockedInstallationsString = await stringFlag(StringFlags.BLOCKED_INSTALLATIONS, "[]");
		const blockedInstallations: number[] = JSON.parse(blockedInstallationsString);
		return blockedInstallations.includes(installationId);
	} catch (e) {
		logger.error({ err: e, installationId }, "Cannot define if isBlocked");
		return false;
	}
};

export const shouldTagBackfillRequests = async (): Promise<boolean> => {
	return booleanFlag(BooleanFlags.TAG_BACKFILL_REQUESTS, false);
};

export const GHE_SERVER_GLOBAL = false;
