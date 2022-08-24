import { NextFunction, Request, Response } from "express";
import { GitHubServerApp } from "~/src/models/github-server-app";

export const JiraConnectEnterpriseAppDelete = async (
	req: Request,
	res: Response,
	next: NextFunction
): Promise<void> => {
	try {
		req.log.debug("Received Jira Connect Enterprise App DELETE request");

		await GitHubServerApp.uninstallApp(req.body.uuid);

		res.status(200).send({ success: true });
		req.log.debug("Jira Connect Enterprise App deleted successfully.");
	} catch (error) {
		res.status(200).send({ success: false, message: "Failed to delete GitHub App." });
		return next(new Error(`Failed to render Jira Connect Enterprise App DELETE request : ${error}`));
	}
};
