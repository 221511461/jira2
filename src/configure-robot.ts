import { Application, Probot } from "probot";
import setupGitHub from "./github/webhooks";
import { overrideProbotLoggingMethods } from "./config/logger";
import { setupFrontend } from "./app";

export async function setupApp(app: Application): Promise<Application> {
	setupGitHub(app);
	setupFrontend(app);
	return app;
}

export default function configureAndLoadApp(probot: Probot) {
	probot.load(setupApp);
	probot.webhook.on("error", (err: Error) => {
		probot.logger.error(err, "Webhook Error");
	});
	overrideProbotLoggingMethods(probot.logger);
}


