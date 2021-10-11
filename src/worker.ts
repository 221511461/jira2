import "./config/env"; // Important to be before other dependencies
import "./config/proxy"; // Important to be before other dependencies
import throng from "throng";
import {v4 as uuidv4} from "uuid";
import { isNodeProd } from "./util/isNodeEnv";
import { listenToMicrosLifecycle } from "./services/micros/lifecycle";
import { ClusterCommand, sendCommandToCluster } from "./services/cluster/send-command";
import * as Sentry from "@sentry/node";

import { discovery, DISCOVERY_LOGGER_NAME } from "./sync/discovery";
import { INSTALLATION_LOGGER_NAME, processInstallation } from "./sync/installation";
import { processPushJob, PUSH_LOGGER_NAME } from "./transforms/push";
import metricsJob, { METRICS_LOGGER_NAME } from "./worker/metrics-job";
import statsd from "./config/statsd";
import app, { probot } from "./worker/app";
import AxiosErrorEventDecorator from "./models/axios-error-event-decorator";
import SentryScopeProxy from "./models/sentry-scope-proxy";
import { initializeSentry } from "./config/sentry";
import { getLogger } from "./config/logger";
import { booleanFlag, BooleanFlags } from "./config/feature-flags";
import { RateLimitingError } from "./config/enhance-octokit";
import { queues } from "./worker/queues";
import { queueMetrics } from "./config/metric-names";
import { Job } from "bull";
import { listenForClusterCommand } from "./services/cluster/listen-command";
import Timeout = NodeJS.Timeout;
import { LoggerWithTarget } from "probot/lib/wrap-logger";

const CONCURRENT_WORKERS = process.env.CONCURRENT_WORKERS || 1;
const logger = getLogger("worker");

/**
 * Return an async function that assigns a Sentry hub to `job.sentry` and sends exceptions.
 */
const sentryMiddleware = (jobHandler) => async (job, logger: LoggerWithTarget) => {
	job.sentry = new Sentry.Hub(Sentry.getCurrentHub().getClient());
	job.sentry.configureScope((scope) =>
		scope.addEventProcessor(AxiosErrorEventDecorator.decorate)
	);
	job.sentry.configureScope((scope) =>
		scope.addEventProcessor(SentryScopeProxy.processEvent)
	);

	try {
		await jobHandler(job, logger);
	} catch (err) {
		job.sentry.setExtra("job", {
			id: job.id,
			attemptsMade: job.attemptsMade,
			timestamp: new Date(job.timestamp),
			data: job.data
		});

		job.sentry.setTag("jiraHost", job.data.jiraHost);
		job.sentry.setTag("queue", job.queue.name);
		job.sentry.captureException(err);

		throw err;
	}
};

const logMiddleware = (jobHandler, jobName: string) => {
	return async (job) => {
		const jobLogger = await booleanFlag(BooleanFlags.PROPAGATE_REQUEST_ID, true) ? logger.child({
			name: jobName,
			// Probot uses "id" key as "requestId" for tracing; let's use the same key for consistency and also
			// to have uniform logs for webhooks that are processed both asynchronously and in request handlers
			//
			// Let's use random ID rather than "job.id" to be able to separate retries of the same job
			id: uuidv4(),
		}) : logger;
		try {
			await jobHandler(job, jobLogger);
		} catch (err) {
			jobLogger.error({err}, "Execution failed!");
		}
	};
}

const setDelayOnRateLimiting = (jobHandler) => async (job: Job, logger: LoggerWithTarget) => {
	try {
		await jobHandler(job, logger);
	} catch (err) {
		if (err instanceof RateLimitingError) {
			// delaying until the rate limit is reset (plus a buffer of a couple seconds)
			const delay = err.rateLimitReset * 1000 + 10000 - new Date().getTime();

			if (delay <= 0) {
				logger.warn({ job }, "Rate limiting detected but couldn't calculate delay, delaying exponentially");
				job.opts.backoff = {
					type: "exponential",
					delay: 10 * 60 * 1000
				};
			} else {
				logger.warn({ job }, `Rate limiting detected, delaying job by ${delay} ms`);
				job.opts.backoff = {
					type: "fixed",
					delay: delay
				};
			}
		}
		throw err;
	}
};

const sendQueueMetrics = async () => {
	if (await booleanFlag(BooleanFlags.EXPOSE_QUEUE_METRICS, false)) {

		for (const [queueName, queue] of Object.entries(queues)) {
			const jobCounts = await queue.getJobCounts();

			logger.info({ queue: queueName, queueMetrics: jobCounts }, "publishing queue metrics");

			const tags = { queue: queueName };
			statsd.gauge(queueMetrics.active, jobCounts.active, tags);
			statsd.gauge(queueMetrics.completed, jobCounts.completed, tags);
			statsd.gauge(queueMetrics.delayed, jobCounts.delayed, tags);
			statsd.gauge(queueMetrics.failed, jobCounts.failed, tags);
			statsd.gauge(queueMetrics.waiting, jobCounts.waiting, tags);
		}
	}
};

const commonMiddleware = (jobHandler, loggerName: string) => logMiddleware(sentryMiddleware(setDelayOnRateLimiting(jobHandler)), loggerName);

let running = false;
let timer: Timeout;

// Start function for Node cluster worker
async function start() {
	if (running) {
		logger.debug("Worker instance already running, skipping.");
		return;
	}

	logger.info("Micros Lifecycle: Starting queue processing");
	// exposing queue metrics at a regular interval
	timer = setInterval(sendQueueMetrics, 60000);

	// Start processing queues
	queues.discovery.process(5, commonMiddleware(discovery(app, queues), DISCOVERY_LOGGER_NAME));
	queues.installation.process(
		Number(CONCURRENT_WORKERS),
		commonMiddleware(processInstallation(app, queues), INSTALLATION_LOGGER_NAME)
	);
	queues.push.process(
		Number(CONCURRENT_WORKERS),
		commonMiddleware(processPushJob(app), PUSH_LOGGER_NAME)
	);
	queues.metrics.process(1, commonMiddleware(metricsJob, METRICS_LOGGER_NAME));
	running = true;
}

async function stop() {
	if (!running) {
		logger.debug("Worker instance not running, skipping.");
		return;
	}
	logger.info("Micros Lifecycle: Stopping queue processing");
	// TODO: change this to `probot.close()` once we update probot to latest version
	probot.httpServer?.close();

	// Stop sending metrics for queues
	clearInterval(timer);

	// Close all queues
	await Promise.all([
		queues.discovery.close(),
		queues.installation.close(),
		queues.push.close(),
		queues.metrics.close()
	]);
	running = false;
}

initializeSentry();
// starts healthcheck/deepcheck or else deploy will fail
probot.start();

if (isNodeProd()) {
	// Production clustering (one process per core)
	// Read more about Node clustering: https://nodejs.org/api/cluster.html
	throng({
		worker: () => {
			listenForClusterCommand(ClusterCommand.start, start);
			listenForClusterCommand(ClusterCommand.stop, stop);
		},
		master: () => {
			// Listen to micros lifecycle event to know when to start/stop
			setTimeout(() => {
				listenToMicrosLifecycle(
					// When 'active' event is triggered, start queue processing
					() => sendCommandToCluster(ClusterCommand.start),
					// When 'inactive' event is triggered, stop queue processing
					() => sendCommandToCluster(ClusterCommand.stop)
				);
			}, 10000);

		},
		lifetime: Infinity
	});
} else {
	// Dev/test single process, no need for clustering or lifecycle events
	start();
}

