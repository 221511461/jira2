import { getLogger } from "config/logger";
import { RepoSyncState } from "models/reposyncstate";
import { GitHubInstallationClient } from "../github/client/github-installation-client";
import { Config } from "interfaces/common";
import YAML from "yaml";
import { InstallationId } from "../github/client/installation-id";
import { Subscription } from "models/subscription";

const USER_CONFIG_FILE = ".jira/config.yml";
const logger = getLogger("services.user-config");
const MAX_PATTERNS_PER_ENVIRONMENT = 10;

/**
 * Checks whether a list of modified files contains the config file. If yes, reads that config file
 * from the GitHub repository, parses it, and stores the config against the given repository
 * in the database.
 *
 * This function is meant to be called whenever there is a change in the repository so we can check
 * if the config file has changed.
 *
 * @param subscription the subscription to which the repository belongs.
 * @param repositoryId the ID of the repository.
 * @param githubInstallationId the ID of the installation to which the repository belongs.
 * @param modifiedFiles list of modified files (added, modified, or removed). The config will only be updated if this list contains
 * the config file.
 */
export const updateRepoConfig = async (
	subscription: Subscription,
	repositoryId: number,
	githubInstallationId: InstallationId,
	modifiedFiles: string[] = []): Promise<void> => {

	if (modifiedFiles.includes(USER_CONFIG_FILE)) {
		try {
			const repoSyncState = await RepoSyncState.findByRepoId(subscription, repositoryId);
			await updateRepoConfigFromGitHub(repoSyncState, githubInstallationId);
		} catch (err) {
			logger.error({
				err,
				githubInstallationId,
				repositoryId
			}, "error while updating the repo config");
		}
	}
};

/**
 * Returns the config for a given repo.
 */
export const getRepoConfig = async (subscription: Subscription, repositoryId: number): Promise<Config | undefined> => {
	// In the future, we may look in other places for a config than just in the RepoSyncState (for example,
	// we might fall back to default configs on the level of a subscription or an installation).
	const repoSyncState = await RepoSyncState.findByRepoId(subscription, repositoryId);
	return repoSyncState.config;
};

/**
 * Fetches contents from CONFIG_PATH from GitHub via GitHub's API, transforms it from base64 to ascii and returns the transformed string.
 */
const getRepoConfigFromGitHub = async (githubInstallationId: InstallationId, owner: string, repo: string): Promise<string | undefined> => {
	const client = new GitHubInstallationClient(githubInstallationId, logger);
	const contents = await client.getRepositoryFile(owner, repo, USER_CONFIG_FILE);

	if (!contents) {
		return undefined;
	}
	return Buffer.from(contents, "base64").toString("utf-8");
};

/**
 * Iterates through environment patterns and returns true if any environment contains too many patterns to test against.
 */
const hasTooManyPatternsPerEnvironment = (config: Config): boolean => {
	const environmentMapping = config?.deployments?.environmentMapping;
	if (!environmentMapping) {
		return false;
	}
	return Object.keys(environmentMapping).some(key => {
		return environmentMapping[key].length > MAX_PATTERNS_PER_ENVIRONMENT;
	});
};

/**
 * Converts incoming YAML string to JSON (RepoConfig)
 */
const convertYamlToUserConfig = (input?: string): Config => {

	if (!input) {
		return {};
	}

	const config: Config = YAML.parse(input);

	if (!config?.deployments?.environmentMapping) {
		throw new Error(`Invalid .jira/config.yml structure`);
	}

	// Trim the input data to only include the required attributes
	const output = {
		deployments: {
			environmentMapping: {
				development: config.deployments.environmentMapping.development,
				testing: config.deployments.environmentMapping.testing,
				staging: config.deployments.environmentMapping.staging,
				production: config.deployments.environmentMapping.production
			}
		}
	};

	if (hasTooManyPatternsPerEnvironment(output)) {
		throw new Error(`Too many patterns per environment! Maximum is: ${MAX_PATTERNS_PER_ENVIRONMENT}`);
	}
	return output;
};

const updateRepoConfigFromGitHub = async (repoSyncState: RepoSyncState, githubInstallationId: InstallationId): Promise<void> => {
	const yamlConfig = await getRepoConfigFromGitHub(githubInstallationId, repoSyncState.repoOwner, repoSyncState.repoName);
	const config = convertYamlToUserConfig(yamlConfig);
	await repoSyncState.update({ config });
};
