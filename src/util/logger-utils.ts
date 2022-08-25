import { Writable } from "stream";
import safeJsonStringify from "safe-json-stringify";
import bformat from "bunyan-format";
import { DEBUG } from "bunyan";
import { createHashWithSharedSecret } from "utils/encryption";

const SENSITIVE_DATA_FIELDS = ["jiraHost", "orgName", "repoName", "userGroup", "userGroup", "aaid", "username"];
// For any Micros env we want the logs to be in JSON format.
// Otherwise, if local development, we want human readable logs.
const outputMode = process.env.MICROS_ENV ? "json" : "short";

//TODO Remove this code when there will be convenient way to do it in Probot.
//  See https://github.com/probot/probot/issues/1577
export const filterHttpRequests = (record: Record<string, any>, filteredLoggerName: string) => {
	const { msg, name } = record;
	if (name !== filteredLoggerName) {
		return false;
	}
	return !!msg.match(/(GET|POST|DELETE|PUT|PATCH)/);
};

class RawLogStream extends Writable {
	private readonly  filteredHttpLoggerName: string;
	private writeStream: NodeJS.WritableStream;

	public constructor(filteredHttpLoggerName: string) {
		super({ objectMode: true });
		this.filteredHttpLoggerName = filteredHttpLoggerName;
		this.writeStream = bformat({ outputMode, levelInString: true });
	}

	public async _write(record: any, encoding: BufferEncoding, next): Promise<void> {

		// Skip unwanted logs
		if (filterHttpRequests(record, this.filteredHttpLoggerName)) {
			return next();
		}

		const chunk = safeJsonStringify(record) + "\n";
		this.writeStream.write(chunk, encoding);
		next();
	}
}

export class SafeRawLogStream extends RawLogStream {
	public constructor(filteredHttpLoggerName: string) {
		super(filteredHttpLoggerName);
	}

	public async _write(record: any, encoding: BufferEncoding, next): Promise<void> {
		const hashedRecord = this.hashSensitiveData(record);
		await super._write(hashedRecord, encoding, next);
	}

	private hashSensitiveData(record: Record<string, any>): Record<string, string | undefined> {
		const recordClone = { ...record };
		Object.keys(recordClone).forEach(key => {
			if (SENSITIVE_DATA_FIELDS.includes(key)) {
				recordClone[key] = createHashWithSharedSecret(recordClone[key]);
			}
		});
		return recordClone;
	}
}

export class UnsafeRawLogStream extends RawLogStream {

	public constructor(filteredHttpLoggerName: string) {
		super(filteredHttpLoggerName);
	}

	public async _write(record: any, encoding: BufferEncoding, next): Promise<void> {

		// Skip any log above DEBUG level
		if (!record.level || record.level > DEBUG) {
			return next();
		}
		// Tag the record do it gets indexed to the _unsafe logging environment
		record.env_suffix = "unsafe";
		await super._write(record, encoding, next);
	}
}
