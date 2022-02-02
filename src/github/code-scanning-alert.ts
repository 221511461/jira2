import transformCodeScanningAlert from "../transforms/code-scanning-alert";
import { Context } from "probot/lib/context";
import logger from "../config/logger";
import { booleanFlag, BooleanFlags } from "../config/feature-flags";

export default async (context: Context, jiraClient): Promise<void> => {
	if (!booleanFlag(BooleanFlags.SEND_CODE_SCANNING_ALERTS_AS_REMOTE_LINKS, false, jiraClient.baseUrl)) {
		return;
	}

	const jiraPayload = await transformCodeScanningAlert(context);

	if (!jiraPayload) {
		logger.info({noop: "no_jira_payload_code_scanning_alert"}, "Halting further execution for code scanning alert since jiraPayload is empty");
		return;
	}

	logger.info(`Sending code scanning alert event as Remote Link to Jira: ${jiraClient.baseURL}`);
	await jiraClient.remoteLink.submit(jiraPayload);
};
