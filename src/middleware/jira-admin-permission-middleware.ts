import { NextFunction, Request, Response } from "express";
import { Installation } from "models/installation";
import { JiraClient } from "models/jira-client";
import { booleanFlag, BooleanFlags } from "config/feature-flags";

export const setJiraAdminPrivileges = async (req: Request, claims: Record<any, any>, installation: Installation) => {
	const ADMIN_PERMISSION = "ADMINISTER";
	// We only need to add this to the session if it doesn't exist
	if (req.session.isJiraAdmin !== undefined) {
		return;
	}

	try {
		const userAccountId = claims.sub;
		// Can't check permissions without userAccountId
		if (!userAccountId) {
			return;
		}
		const jiraClient = await JiraClient.getNewClient(installation, req.log);
		// Make jira call to permissions with userAccountId.
		const permissions = await jiraClient.checkAdminPermissions(userAccountId);
		const hasAdminPermissions = permissions.data.globalPermissions.includes(ADMIN_PERMISSION);

		req.session.isJiraAdmin = hasAdminPermissions;
		req.log.info({ isAdmin :req.session.isJiraAdmin }, "Admin permissions set");
	} catch (err) {
		req.log.error({ err }, "Failed to fetch Jira Admin rights");
	}
};

export const jiraAdminPermissionsMiddleware = async (req: Request, res: Response, next: NextFunction) => {
	const hasAdminPermissions = req.session;
	if (!(await booleanFlag(BooleanFlags.JIRA_ADMIN_CHECK))) {
		return next();
	}

	if (hasAdminPermissions === undefined) {
		// User permissions could bot be extracted from the Jira JWT, check that the jwt middleware has run
		req.log.info("No Jira user permissions found");
		return res.status(403).send("Forbidden - User Jira permissions have not been found.");
	}

	if (hasAdminPermissions === "false") {
		req.log.info("User does not have Jira admin permissions.");
		return res.status(403).send("Forbidden - User does not have Jira administer permissions.");
	}
	return next();
};
