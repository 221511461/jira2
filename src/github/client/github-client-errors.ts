import { AxiosError, AxiosResponse } from "axios";

export class GithubClientError extends Error {
	cause: AxiosError;
	isRetryable = true;

	status?: number;
	code?: string;

	constructor(message: string, cause: AxiosError) {
		super(message);

		this.status = cause.response?.status;
		this.code = cause.code;

		this.cause = { ...cause };
		this.stack = this.stack?.split("\n").slice(0, 2).join("\n") + "\n" + cause.stack;
	}
}

export class GithubClientTimeoutError extends GithubClientError {
	constructor(cause: AxiosError) {
		super("Timeout", cause);
	}
}

export class GithubClientRateLimitingError extends GithubClientError {
	/**
	 * The value of the x-ratelimit-reset header, i.e. the epoch seconds when the rate limit is refreshed.
	 */
	rateLimitReset: number;

	constructor(cause: AxiosError) {
		super("Rate limiting error", cause);
		const rateLimitResetHeaderValue: string = cause.response?.headers?.["x-ratelimit-reset"] || "";
		this.rateLimitReset = parseInt(rateLimitResetHeaderValue) || ((Date.now() / 1000) + ONE_HOUR_IN_SECONDS);
		this.isRetryable = false;
	}
}

export class GithubClientBlockedIpError extends GithubClientError {
	constructor(cause: AxiosError) {
		super("Blocked by GitHub allowlist", cause);
		this.isRetryable = false;
	}
}

export class GithubClientInvalidPermissionsError extends GithubClientError {
	constructor(cause: AxiosError) {
		super("Resource not accessible by integration", cause);
	}
}

export class GithubClientNotFoundError extends GithubClientError {
	constructor(cause: AxiosError) {
		super("Not found", cause);
	}
}


/**
 * Type for errors section in GraphQL response
 */
export type GraphQLError = {
	message: string;
	type: string;
	path?: string[];
	extensions?: {
		code?: string;
		timestamp?: string;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		[key: string]: any;
	};
	locations?:
		{
			line: number;
			column: number;
		}[];
};

export const buildAxiosStubErrorForGraphQlErrors = (response: AxiosResponse) => {
	return {
		name: "GraphQLError",
		message: "GraphQLError(s)",
		config: response.config,
		response,
		request: response.request,
		isAxiosError: true
	} as AxiosError;
};

export class GithubClientGraphQLError extends GithubClientError {

	/**
	 * errors section from the GraplQL response
	 */
	errors: GraphQLError[];

	constructor(response: AxiosResponse, errors: GraphQLError[]) {
		super(
			errors[0].message + (errors.length > 1 ? ` and ${errors.length - 1} more errors` : ""),
			buildAxiosStubErrorForGraphQlErrors(response)
		);
		this.errors = errors;
		this.isRetryable = !!errors.find(
			(error) =>
				"MAX_NODE_LIMIT_EXCEEDED" == error.type ||
				error.message?.startsWith("Something went wrong while executing your query")
		);
	}

	isChangedFilesError(): boolean {
		return !!this.errors.find(err => err.message.includes("changedFiles"));
	}
}

const ONE_HOUR_IN_SECONDS = 60 * 60;
