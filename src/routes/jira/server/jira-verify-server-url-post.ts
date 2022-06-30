import { Request, Response } from "express";
import axios from "axios";

export const JiraVerifyServerUrlPost = async (
	req: Request,
	res: Response
): Promise<void> => {
	const { gheServerURL } = req.body;
	req.log.info(`Verifying provided GHE server url: ${gheServerURL}`);

	try {
		await axios.get(gheServerURL);
		req.log.info(`Successfully verified GHE server url: ${gheServerURL}`);
		res.sendStatus(200);
	} catch (e) {
		req.log.error(`Failed to verify GHE server url: ${gheServerURL}`);
		res.status(401).send({ message: "Check your firewall configuration and try again." });
	}
};
