import Logger from "bunyan";
import dumpme from "dumpme";
import fs from "fs";
import { hasEnoughFreeHeap } from "utils/heap-size-utils";

/**
 * Please note: it will generate the coredump only once! If you need to take it multiple times, create a new object.
 */
export class GenerateOnceCoredumpGenerator {
	private config: {
		logger: Logger,
		lowHeapAvailPct: number,
	};

	private coreDumpGenerated = false;

	constructor(config: {
		logger: Logger,
		lowHeapAvailPct: number,
	}) {
		this.config = config;
	}

	/**
	 * In case of success, a file will be generated with the path /tmp/core.PID
	 */
	public maybeGenerateCoredump(): boolean {
		if (this.coreDumpGenerated) {
			return false;
		}

		if (!hasEnoughFreeHeap(this.config.lowHeapAvailPct, this.config.logger)) {
			this.config.logger.info(`Triggering coredump...`);

			const tsBeforeDump = Date.now();
			dumpme(undefined, `/tmp/core`); // pid will be added by dumpme() as a suffix
			const tsAfterDump = Date.now();

			this.config.logger.info(`Core dump was created, took ${tsAfterDump - tsBeforeDump}`);

			fs.renameSync(`/tmp/core.${process.pid.toString()}`, `/tmp/core.${process.pid.toString()}.ready`);
			this.coreDumpGenerated = true;
			return true;

		} else {
			this.config.logger.info(`Plenty of free heap, skip`);
		}
		return false;
	}
}