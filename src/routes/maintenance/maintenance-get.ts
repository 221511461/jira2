import { Request, Response } from "express";

export const MaintenanceGet = (_: Request, res: Response) => {
	// Best HTTP status code for maintenance mode: https://en.wikipedia.org/wiki/List_of_HTTP_status_codes#5xx_server_errors
	return res.status(503).render("maintenance.hbs", {
		title: "Github for Jira - Under Maintenance",
		APP_URL: process.env.APP_URL,
		nonce: res.locals.nonce
	});
};
