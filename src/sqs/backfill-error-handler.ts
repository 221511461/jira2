import { BackfillMessagePayload, ErrorHandler, ErrorHandlingResult, SQSMessageContext } from "~/src/sqs/sqs.types";
import { SqsQueue } from "./sqs";
import { markCurrentTaskAsFailedAndContinue, TaskError } from "~/src/sync/installation";
import { Task } from "~/src/sync/sync.types";
import { handleUnknownError } from "~/src/sqs/error-handlers";
import Logger from "bunyan";

const handleTaskError = async (backfillQueue: SqsQueue<BackfillMessagePayload>, task: Task, cause: Error, context: SQSMessageContext<BackfillMessagePayload>, rootLogger: Logger
) => {
	const log = rootLogger.child({ task });
	log.info({ task }, "Handling error task");

	// TODO: add task-related logic: e.g. mark as complete for 404; retry RateLimiting errors;

	if (context.lastAttempt) {
		// Otherwise the sync will be "stuck", not something we want
		await markCurrentTaskAsFailedAndContinue(context.payload, task, async (delayMs) => {
			return await backfillQueue.sendMessage(context.payload, delayMs / 1000);
		}, log);
		return {
			isFailure: false
		};
	}

	return handleUnknownError(cause, context);
};

export const backfillErrorHandler: (backfillQueueHolder: { queue: SqsQueue<BackfillMessagePayload> | undefined }) => ErrorHandler<BackfillMessagePayload> =
	(backfillQueueHolder) =>
		async (err: Error, context: SQSMessageContext<BackfillMessagePayload>): Promise<ErrorHandlingResult> => {
			const log = context.log.child({ err });
			log.info("Handling error");

			if (!backfillQueueHolder.queue) {
				log.warn("Queue was not ready, retry");
				return {
					isFailure: true,
					retryable: true
				};
			}

			if (err instanceof TaskError) {
				return await handleTaskError(backfillQueueHolder.queue, err.task, err.cause, context, log);
			}

			return handleUnknownError(err, context);

			return {
				isFailure: false
			};
		};