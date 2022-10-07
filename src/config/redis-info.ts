import IORedis from "ioredis";
import { isNodeProd } from "utils/is-node-env";
import { envVars } from "config/env";

export const getRedisInfo = (connectionName: string): IORedis.RedisOptions => ({
	port: Number(envVars.REDISX_CACHE_PORT) || 6379,
	host: envVars.REDISX_CACHE_HOST || "127.0.0.1",
	db: 0,

	// TODO find out if we still need these options
	// https://github.com/OptimalBits/bull/issues/1873#issuecomment-950873766
	maxRetriesPerRequest: null,
	enableReadyCheck: false,

	tls: isNodeProd() ? { checkServerIdentity: () => undefined } : undefined,
	connectionName
});
