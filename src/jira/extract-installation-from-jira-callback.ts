import {Installation} from "../models";
import {NextFunction, Request, Response} from "express";

/**
 * Express middleware for connect app events
 *
 * Retrieves installation using clientKey and adds it to the res.locals
 *
 * @param req Request
 * @param res Response
 * @param next Next function
 */
export default async (req: Request, res: Response, next: NextFunction) => {
	if (!req.body) {
		res.status(401);
		return;
	}

	const installation = await Installation.getForClientKey(req.body.clientKey);
	if (!installation) {
		res.status(404);
		return;
	}

	const { jiraHost, clientKey } = installation;

	req.addLogFields({
		jiraHost,
		jiraClientKey: `${clientKey.substr(0, 5)}***}`
	});
	res.locals.installation = installation;
	next();
}
