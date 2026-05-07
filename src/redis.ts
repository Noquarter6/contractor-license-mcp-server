import { Redis } from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379/0";

let client: Redis | null = null;

export function getRedis(): Redis {
  if (client) return client;
  client = new Redis(REDIS_URL, {
    // Keep connections open; reconnect on failure with capped backoff.
    maxRetriesPerRequest: 3,
    enableOfflineQueue: false,
    retryStrategy: (times: number) => Math.min(times * 200, 2000),
    lazyConnect: false,
  });
  client.on("error", (err: Error) => {
    // ioredis emits one error per connection attempt — log but do not crash.
    console.error(`[redis] ${err.message}`);
  });
  client.on("connect", () => console.log(`[redis] connected to ${REDIS_URL}`));
  return client;
}

/**
 * GETDEL atomic: fetch and delete a key in a single command.
 * Used for single-use OAuth codes and oauth_ref tokens.
 */
export async function getdel(key: string): Promise<string | null> {
  return await getRedis().getdel(key);
}
