/* eslint-disable @typescript-eslint/no-explicit-any */
import { Installation} from "models/installation";
import { Subscription } from "models/subscription";
import { getAxiosInstance } from "./axios";
import { getJiraId } from "../util/id";
import { AxiosInstance, AxiosResponse } from "axios";
import Logger from "bunyan";
import { JiraCommit, JiraIssue } from "interfaces/jira";
import { getLogger } from "config/logger";
import { jiraIssueKeyParser } from "utils/jira-utils";
import { uniq } from "lodash";

// Max number of issue keys we can pass to the Jira API
export const ISSUE_KEY_API_LIMIT = 100;
const issueKeyLimitWarning = "Exceeded issue key reference limit. Some issues may not be linked.";

export interface DeploymentsResult {
	status: number;
	rejectedDeployments?: any[];
}

/*
 * Similar to the existing Octokit rest.js instance included in probot
 * apps by default, this client adds a Jira client that allows us to
 * abstract away the underlying HTTP requests made for each action. In
 * general, the client should match the Octokit rest.js design for clear
 * interoperability.
 */

// TODO: need to type jiraClient ASAP
export const getJiraClient = async (
	jiraHost: string,
	gitHubInstallationId: number,
	log: Logger = getLogger("jira-client")
): Promise<any> => {
	const logger = log.child({ jiraHost, gitHubInstallationId });
	const installation = await Installation.getForHost(jiraHost);
	if (!installation) {
		logger.warn("Cannot initialize Jira Client, Installation doesn't exist.");
		return undefined;
	}
	const instance = getAxiosInstance(
		installation.jiraHost,
		installation.sharedSecret,
		logger
	);

	// TODO: need to create actual class for this
	const client = {
		baseURL: installation.jiraHost,
		issues: {
			get: (issueId: string, query = { fields: "summary" }): Promise<AxiosResponse<JiraIssue>> =>
				instance.get("/rest/api/latest/issue/{issue_id}", {
					params: query,
					urlParams: {
						issue_id: issueId
					}
				}),
			getAll: async (issueIds: string[], query?: { fields: string }): Promise<JiraIssue[]> => {
				const responses = await Promise.all<AxiosResponse<JiraIssue> | undefined>(
					issueIds.map((issueId) => client.issues.get(issueId, query)
						// Ignore any errors
						.catch(() => undefined))
				);
				return responses.reduce((acc: JiraIssue[], response) => {
					if (response?.status === 200 && !!response?.data) {
						acc.push(response.data);
					}
					return acc;
				}, []);
			},
			parse: (text: string): string[] | undefined => {
				if (!text) return undefined;
				return jiraIssueKeyParser(text);
			},
			comments: {
				// eslint-disable-next-line camelcase
				getForIssue: (issue_id: string) =>
					instance.get("/rest/api/latest/issue/{issue_id}/comment", {
						urlParams: {
							issue_id
						}
					}),
				// eslint-disable-next-line camelcase
				addForIssue: (issue_id: string, payload) =>
					instance.post("/rest/api/latest/issue/{issue_id}/comment", payload, {
						urlParams: {
							issue_id
						}
					})
			},
			transitions: {
				// eslint-disable-next-line camelcase
				getForIssue: (issue_id: string) =>
					instance.get("/rest/api/latest/issue/{issue_id}/transitions", {
						urlParams: {
							issue_id
						}
					}),
				// eslint-disable-next-line camelcase
				updateForIssue: (issue_id: string, transition_id: string) =>
					instance.post(
						"/rest/api/latest/issue/{issue_id}/transitions",
						{
							transition: {
								id: transition_id
							}
						},
						{
							urlParams: {
								issue_id
							}
						}
					)
			},
			worklogs: {
				// eslint-disable-next-line camelcase
				getForIssue: (issue_id: string) =>
					instance.get("/rest/api/latest/issue/{issue_id}/worklog", {
						urlParams: {
							issue_id
						}
					}),
				// eslint-disable-next-line camelcase
				addForIssue: (issue_id: string, payload) =>
					instance.post("/rest/api/latest/issue/{issue_id}/worklog", payload, {
						urlParams: {
							issue_id
						}
					})
			}
		},
		devinfo: {
			branch: {
				delete: (repositoryId: string, branchRef: string) =>
					instance.delete(
						"/rest/devinfo/0.10/repository/{repositoryId}/branch/{branchJiraId}",
						{
							params: {
								_updateSequenceId: Date.now()
							},
							urlParams: {
								repositoryId,
								branchJiraId: getJiraId(branchRef)
							}
						}
					)
			},
			// Add methods for handling installationId properties that exist in Jira
			installation: {
				exists: (gitHubInstallationId: string | number) =>
					instance.get(
						`/rest/devinfo/0.10/existsByProperties`,
						{
							params: {
								installationId: gitHubInstallationId
							}
						}
					),
				delete: async (gitHubInstallationId: string | number) =>
					Promise.all([

						// We are sending devinfo events with the property "installationId", so we delete by this property.
						instance.delete(
							"/rest/devinfo/0.10/bulkByProperties",
							{
								params: {
									installationId: gitHubInstallationId
								}
							}
						),

						// We are sending build events with the property "gitHubInstallationId", so we delete by this property.
						instance.delete(
							"/rest/builds/0.1/bulkByProperties",
							{
								params: {
									gitHubInstallationId
								}
							}
						),

						// We are sending deployments events with the property "gitHubInstallationId", so we delete by this property.
						instance.delete(
							"/rest/deployments/0.1/bulkByProperties",
							{
								params: {
									gitHubInstallationId
								}
							}
						)
					])
			},
			pullRequest: {
				delete: (repositoryId: string, pullRequestId: string) =>
					instance.delete(
						"/rest/devinfo/0.10/repository/{repositoryId}/pull_request/{pullRequestId}",
						{
							params: {
								_updateSequenceId: Date.now()
							},
							urlParams: {
								repositoryId,
								pullRequestId
							}
						}
					)
			},
			repository: {
				get: (repositoryId: string) =>
					instance.get("/rest/devinfo/0.10/repository/{repositoryId}", {
						urlParams: { repositoryId }
					}),
				delete: (repositoryId: string) =>
					instance.delete("/rest/devinfo/0.10/repository/{repositoryId}", {
						params: {
							_updateSequenceId: Date.now()
						},
						urlParams: {
							repositoryId
						}
					}),
				update: async (data, options?: { preventTransitions: boolean }) => {
					dedupIssueKeys(data, logger);

					if (
						!withinIssueKeyLimit(data.commits) ||
						!withinIssueKeyLimit(data.branches)
					) {
						logger.warn({
							truncatedCommits: getTruncatedIssuekeys(data.commits),
							truncatedBranches: getTruncatedIssuekeys(data.branches)
						}, issueKeyLimitWarning);
						truncateIssueKeys(data);
						const subscription = await Subscription.getSingleInstallation(
							jiraHost,
							gitHubInstallationId
						);
						await subscription?.update({ syncWarning: issueKeyLimitWarning });
					}

					return batchedBulkUpdate(
						data,
						instance,
						gitHubInstallationId,
						options
					);
				}
			}
		},
		workflow: {
			submit: async (data) => {
				updateIssueKeysFor(data.builds, uniq);
				if (!withinIssueKeyLimit(data.builds)) {
					logger.warn({
						truncatedBuilds: getTruncatedIssuekeys(data.builds)
					}, issueKeyLimitWarning);
					updateIssueKeysFor(data.builds, truncate);
					const subscription = await Subscription.getSingleInstallation(jiraHost, gitHubInstallationId);
					await subscription?.update({ syncWarning: issueKeyLimitWarning });
				}
				const payload = {
					builds: data.builds,
					properties: {
						gitHubInstallationId
					},
					providerMetadata: {
						product: data.product
					}
				};
				logger?.debug(`Sending builds payload to jira. Payload: ${payload}`);
				logger?.info("Sending builds payload to jira.");
				return await instance.post("/rest/builds/0.1/bulk", payload);
			}
		},
		deployment: {
			submit: async (data): Promise<DeploymentsResult> => {
				updateIssueKeysFor(data.deployments, uniq);
				if (!withinIssueKeyLimit(data.deployments)) {
					logger.warn({
						truncatedDeployments: getTruncatedIssuekeys(data.deployments)
					}, issueKeyLimitWarning);
					updateIssueKeysFor(data.deployments, truncate);
					const subscription = await Subscription.getSingleInstallation(jiraHost, gitHubInstallationId);
					await subscription?.update({ syncWarning: issueKeyLimitWarning });
				}
				const payload = {
					deployments: data.deployments,
					properties: {
						gitHubInstallationId
					}
				};
				logger?.debug(`Sending deployments payload to jira. Payload: ${payload}`);
				logger?.info("Sending deployments payload to jira.");
				const response: AxiosResponse = await instance.post("/rest/deployments/0.1/bulk", payload);
				return {
					status: response.status,
					rejectedDeployments: response.data?.rejectedDeployments
				};
			}
		},
		remoteLink: {
			submit: async (data) => {
				// Note: RemoteLinks doesn't have an issueKey field and takes in associations instead
				updateIssueKeyAssociationValuesFor(data.remoteLinks, dedup);
				if (!withinIssueKeyAssociationsLimit(data.remoteLinks)) {
					updateIssueKeyAssociationValuesFor(data.remoteLinks, truncate);
					const subscription = await Subscription.getSingleInstallation(jiraHost, gitHubInstallationId);
					await subscription?.update({ syncWarning: issueKeyLimitWarning });
				}
				const payload = {
					remoteLinks: data.remoteLinks,
					properties: {
						gitHubInstallationId
					}
				};
				logger.info("Sending remoteLinks payload to jira.");
				await instance.post("/rest/remotelinks/1.0/bulk", payload);
			}
		}
	};

	return client;
}

/**
 * Splits commits in data payload into chunks of 400 and makes separate requests
 * to avoid Jira API limit
 */
const batchedBulkUpdate = async (
	data,
	instance: AxiosInstance,
	installationId: number,
	options?: { preventTransitions: boolean }
) => {
	const dedupedCommits = dedupCommits(data.commits);

	// Initialize with an empty chunk of commits so we still process the request if there are no commits in the payload
	const commitChunks: JiraCommit[][] = [];
	do {
		commitChunks.push(dedupedCommits.splice(0, 400));
	} while (dedupedCommits.length);

	const batchedUpdates = commitChunks.map((commitChunk) => {
		if (commitChunk.length) {
			data.commits = commitChunk;
		}
		const body = {
			preventTransitions: options?.preventTransitions || false,
			repositories: [data],
			properties: {
				installationId
			}
		};
		return instance.post("/rest/devinfo/0.10/bulk", body);
	});
	return Promise.all(batchedUpdates);
};

/**
 * Returns if the max length of the issue
 * key field is within the limit
 */
const withinIssueKeyLimit = (resources: { issueKeys: string[] }[]): boolean => {
	if (!resources) return true;
	const issueKeyCounts = resources.map((resource) => resource.issueKeys.length);
	return Math.max(...issueKeyCounts) <= ISSUE_KEY_API_LIMIT;
};

/**
 * Returns if the max length of the issue key field is within the limit
 * Assumption is that the transformed resource only has one association which is for
 * "issueIdOrKeys" association.
 */
const withinIssueKeyAssociationsLimit = (resources) => {
	let issueKeyCounts = [];

	if (resources?.associations?.length > 0) {
		issueKeyCounts = resources.map((resource) => resource.associations[0].values.length);
		return Math.max(...issueKeyCounts) <= ISSUE_KEY_API_LIMIT;
	}

	return issueKeyCounts;
}

/**
 * Deduplicates commits by ID field for a repository payload
 */
const dedupCommits = (commits: JiraCommit[] = []): JiraCommit[] =>
	commits.filter(
		(obj, pos, arr) =>
			arr.map((mapCommit) => mapCommit.id).indexOf(obj.id) === pos
	);

/**
 * Deduplicates issueKeys field for branches and commits
 */
const dedupIssueKeys = (repositoryObj, logger?) => {
	updateRepositoryIssueKeys(repositoryObj, logger);
};

/**
 * Truncates branches and commits to first 100 issue keys for branch or commit
 */
const truncateIssueKeys = (repositoryObj) => {
	updateRepositoryIssueKeys(repositoryObj, truncate);
};

interface IssueKeyObject {
	issueKeys?: string[];
}

export const getTruncatedIssuekeys = (data: IssueKeyObject[] = []): IssueKeyObject[] =>
	data.reduce((acc: IssueKeyObject[], value: IssueKeyObject) => {
		// Filter out anything that doesn't have issue keys or are not over the limit
		if (value.issueKeys && value.issueKeys.length > ISSUE_KEY_API_LIMIT) {
			// Create copy of object and add the issue keys that are truncated
			acc.push({
				...value,
				issueKeys: value.issueKeys.slice(ISSUE_KEY_API_LIMIT)
			});
		}
		return acc;
	}, []);

/**
 * Runs a mutating function on all branches and commits
 * with issue keys in a Jira Repository object
 */
const updateRepositoryIssueKeys = (repositoryObj, logger?) => {
	if (repositoryObj.commits) {
		repositoryObj.commits = updateIssueKeysFor(repositoryObj.commits, uniq);
	}

	if (repositoryObj.branches) {
		repositoryObj.branches = updateIssueKeysFor(repositoryObj.branches, uniq);
		repositoryObj.branches.forEach((branch) => {
			if (branch.lastCommit) {
				branch.lastCommit = updateIssueKeysFor([branch.lastCommit], uniq)[0];
			}
		});
	}

	if (!repositoryObj.commits && !repositoryObj.branches) {
		logger?.warn("No branches or commits found. Cannot update.");
	}
};

/**
 * Runs the mutatingFunc on the issue keys field for each branch or commit
 */
const updateIssueKeysFor = (resources, func) => {
	resources.forEach((resource) => {
		resource.issueKeys = func(resource.issueKeys);
	});
	return resources;
};

/**
 * Runs the mutatingFunc on the association values field for each entity resource
 * Assumption is that the transformed resource only has one association which is for
 * "issueIdOrKeys" association.
 */
const updateIssueKeyAssociationValuesFor = (resources, mutatingFunc) => {
	if (resources?.associations?.length > 0) {
		resources.forEach((resource) => {
			resource.associations[0].values = mutatingFunc(resource.associations[0].values)
		});
		return resources;
	}
};

/**
 * Deduplicates elements in an array
 */
const dedup = (array) => [...new Set(array)];

/**
 * Truncates to 100 elements in an array
 */
const truncate = (array) => array.slice(0, ISSUE_KEY_API_LIMIT);
