import { deploymentWebhookHandler } from "./deployment";
import { WebhookContext } from "routes/github/webhook/webhook-context";
import { getLogger } from "config/logger";
import { GITHUB_CLOUD_HOSTNAME, GITHUB_CLOUD_API_BASEURL } from "utils/get-github-client-config";
import { sqsQueues } from "../sqs/queues";

jest.mock("../sqs/queues");


const GITHUB_INSTALLATION_ID = 1234;
const GHES_GITHUB_APP_ID = 111;
const GHES_GITHUB_UUID = "xxx-xxx-xxx-xxx";
const GHES_GITHUB_APP_APP_ID = 1;
const GHES_GITHUB_APP_CLIENT_ID = "client-id";

describe("DeploymentWebhookHandler", () => {
	let jiraClient: any;
	let util: any;
	beforeEach(() => {
		jiraClient = { baseURL: jiraHost };
		util = null;
	});
	describe("GitHub Cloud", () => {
		it("should be called with cloud GitHubAppConfig", async () => {
			await deploymentWebhookHandler(getWebhookContext({ cloud: true }), jiraClient, util, GITHUB_INSTALLATION_ID);
			expect(sqsQueues.deployment.sendMessage).toBeCalledWith(expect.objectContaining({
				gitHubAppConfig: {
					uuid: undefined,
					gitHubAppId: undefined,
					appId: parseInt(process.env.APP_ID),
					clientId: process.env.GITHUB_CLIENT_ID,
					gitHubBaseUrl: GITHUB_CLOUD_HOSTNAME,
					gitHubApiUrl: GITHUB_CLOUD_API_BASEURL
				}
			}));
		});
	});
	describe("GitHub Enterprise Server", () => {
		it("should be called with GHES GitHubAppConfig", async () => {
			await deploymentWebhookHandler(getWebhookContext({ cloud: false }), jiraClient, util, GITHUB_INSTALLATION_ID);
			expect(sqsQueues.deployment.sendMessage).toBeCalledWith(expect.objectContaining({
				gitHubAppConfig: {
					uuid: GHES_GITHUB_UUID,
					gitHubAppId: GHES_GITHUB_APP_ID,
					appId: GHES_GITHUB_APP_APP_ID,
					clientId: GHES_GITHUB_APP_CLIENT_ID,
					gitHubBaseUrl: gheUrl,
					gitHubApiUrl: gheUrl
				}
			}));
		});
	});
	const getWebhookContext = ({ cloud }: {cloud: boolean}) => {
		return new WebhookContext({
			id: "1",
			name: "created",
			log: getLogger("test"),
			payload: {},
			gitHubAppConfig: cloud ? {
				uuid: undefined,
				gitHubAppId: undefined,
				appId: parseInt(process.env.APP_ID),
				clientId: process.env.GITHUB_CLIENT_ID,
				gitHubBaseUrl: GITHUB_CLOUD_HOSTNAME,
				gitHubApiUrl: GITHUB_CLOUD_API_BASEURL
			} : {
				uuid: GHES_GITHUB_UUID,
				gitHubAppId: GHES_GITHUB_APP_ID,
				appId: GHES_GITHUB_APP_APP_ID,
				clientId: GHES_GITHUB_APP_CLIENT_ID,
				gitHubBaseUrl: gheUrl,
				gitHubApiUrl: gheUrl
			}
		});
	};
});

