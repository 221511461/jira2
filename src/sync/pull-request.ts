import { PullRequestSort, PullRequestState, SortDirection } from "../github/client/github-client.types";
import url from "url";
import { extractIssueKeysFromPr, transformPullRequest } from "../transforms/transform-pull-request";
import { transformPullRequest as transformPullRequestSync } from "./transforms/pull-request";
import { statsd }  from "config/statsd";
import { metricHttpRequest } from "config/metric-names";
import { Repository } from "models/subscription";
import { GitHubInstallationClient } from "../github/client/github-installation-client";
import Logger from "bunyan";
import { AxiosResponseHeaders } from "axios";
import { Octokit } from "@octokit/rest";
import { getCloudOrServerFromHost } from "utils/get-cloud-or-server";
import { transformRepositoryDevInfoBulk } from "~/src/transforms/transform-repository";
import { getPullRequestReviews } from "~/src/transforms/util/github-get-pull-request-reviews";
import { getGithubUser } from "services/github/user";
import { booleanFlag, BooleanFlags, numberFlag, NumberFlags } from "config/feature-flags";
import { isEmpty } from "lodash";

/**
 * Find the next page number from the response headers.
 */
export const getNextPage = (logger: Logger, headers: Headers = {}): number | undefined => {
	const nextUrl = ((headers.link || "").match(/<([^>]+)>;\s*rel="next"/) ||
		[])[1];
	if (!nextUrl) {
		return undefined;
	}
	logger.debug("Extracting next PRs page url");
	const parsed = url.parse(nextUrl)?.query?.split("&");
	let nextPage;
	parsed?.forEach((query) => {
		const [key, value] = query.split("=");
		if (key === "page") {
			nextPage = Number(value);
		}
	});
	return nextPage;
};

type Headers = AxiosResponseHeaders & {
	link?: string;
}

type PullRequestWithCursor = { cursor: number } & Octokit.PullsListResponseItem;

export const getPullRequestTask = async (
	logger: Logger,
	gitHubInstallationClient: GitHubInstallationClient,
	jiraHost: string,
	repository: Repository,
	cursorOrigStr: string | number = 1,
	perPageOrig: number
) => {
	logger.debug("Syncing PRs: started");

	const startTime = Date.now();

	const cursorOrig = Number(cursorOrigStr);
	let cursor = cursorOrig;
	let perPage = perPageOrig;
	let nextPage = cursorOrig + 1;

	const pageSizeCoef = await numberFlag(NumberFlags.INCREASE_BUILDS_AND_PRS_PAGE_SIZE_COEF, 0, jiraHost);
	if (pageSizeCoef > 0) {
		// An experiment to speed up a particular customer by increasing the page size
		perPage = perPageOrig * pageSizeCoef;
		cursor = Math.max(1, Math.floor(cursorOrig / pageSizeCoef));
		nextPage = cursorOrig + pageSizeCoef;
	}

	const {
		data: edges,
		status,
		headers,
		request
	} =	await gitHubInstallationClient
		.getPullRequests(repository.owner.login, repository.name,
			{
				per_page: perPage,
				page: cursor,
				state: PullRequestState.ALL,
				sort: PullRequestSort.CREATED,
				direction: SortDirection.DES
			});

	const gitHubProduct = getCloudOrServerFromHost(request.host);
	statsd.timing(
		metricHttpRequest.syncPullRequest,
		Date.now() - startTime,
		1,
		[`status:${status}`, `gitHubProduct:${gitHubProduct}`]);

	// Force us to go to a non-existant page if we're past the max number of pages
	if (pageSizeCoef == 0) {
		nextPage = getNextPage(logger, headers) || cursor + 1;
	}

	// Attach the "cursor" (next page number) to each edge, because the function that uses this data
	// fetches the cursor from one of the edges instead of letting us return it explicitly.
	const edgesWithCursor: PullRequestWithCursor[] = edges.map((edge) => ({ ...edge, cursor: nextPage }));

	// TODO: change this to reduce
	const pullRequests = (
		await Promise.all(
			edgesWithCursor.map(async (pull) => {

				if (isEmpty(extractIssueKeysFromPr(pull))) {
					logger.info({
						prId: pull.id
					}, "Skip PR cause has no issue keys");
					return undefined;
				}

				const prResponse = await gitHubInstallationClient.getPullRequest(repository.owner.login, repository.name, pull.number);
				const prDetails = prResponse?.data;

				if (await booleanFlag(BooleanFlags.USE_SHARED_PR_TRANSFORM)) {
					const	reviews = await getPullRequestReviews(gitHubInstallationClient, repository, pull, logger);
					const data = await transformPullRequest(gitHubInstallationClient, prDetails, reviews, logger);
					return data?.pullRequests[0];
				}

				const ghUser = await getGithubUser(gitHubInstallationClient, prDetails?.user.login);
				const data = transformPullRequestSync(
					{ pullRequest: pull, repository },
					prDetails,
					gitHubInstallationClient.baseUrl,
					ghUser
				);
				return data?.pullRequests[0];

			})
		)
	).filter((value) => !!value);

	logger.debug("Syncing PRs: finished");

	return {
		edges: edgesWithCursor,
		jiraPayload:
			pullRequests?.length
				? {
					... transformRepositoryDevInfoBulk(repository, gitHubInstallationClient.baseUrl),
					pullRequests
				}
				: undefined
	};
};
