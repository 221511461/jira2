import { probot } from "./app";
import { sqsQueues } from "../sqs/queues";
import { getLogger } from "config/logger";

const logger = getLogger("worker");

let running = false;

export async function start() {
	if (running) {
		logger.debug("Worker instance already running, skipping.");
		return;
	}

	logger.info("Micros Lifecycle: Starting queue processing");
	sqsQueues.start();

	running = true;
}

export async function stop() {
	if (!running) {
		logger.debug("Worker instance not running, skipping.");
		return;
	}
	logger.info("Micros Lifecycle: Stopping queue processing");
	// TODO: change this to `probot.close()` once we update probot to latest version
	probot.httpServer?.close();

	await sqsQueues.stop();

	running = false;
}
