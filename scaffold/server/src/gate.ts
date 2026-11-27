import type { Redis } from 'ioredis';
import { getRedis } from './redis.js';

const BURST = 4;
const REFILL_PER_SEC = 3;
const FAILS_TTL_MS = 60_000;
const BACKOFF_BASE_MS = 500;
const BACKOFF_MAX_MS = 5000;

const gateKey = (workspace: string) => `sb:gate:${workspace}`;
const failsKey = (workspace: string) => `sb:gate:${workspace}:fails`;

const NOW_MS = `local t = redis.call('TIME'); local now = t[1] * 1000 + math.floor(t[2] / 1000)`;

const TAKE = `${NOW_MS}
local burst, rate = tonumber(ARGV[1]), tonumber(ARGV[2])
local s = redis.call('HMGET', KEYS[1], 'tokens', 'ts', 'blockedUntil')
local tokens, ts, blocked = tonumber(s[1]) or burst, tonumber(s[2]) or now, tonumber(s[3]) or 0
if blocked > now then return blocked - now end
tokens = math.min(burst, tokens + math.max(0, now - ts) * rate / 1000)
local wait = 0
if tokens >= 1 then tokens = tokens - 1 else wait = math.ceil((1 - tokens) * 1000 / rate) end
redis.call('HSET', KEYS[1], 'tokens', tostring(tokens), 'ts', now, 'blockedUntil', blocked)
redis.call('PEXPIRE', KEYS[1], 60000)
return wait`;

const PENALIZE = `${NOW_MS}
local until_ = now + tonumber(ARGV[1])
local cur = tonumber(redis.call('HGET', KEYS[1], 'blockedUntil')) or 0
if until_ > cur then redis.call('HSET', KEYS[1], 'blockedUntil', until_) end
redis.call('PEXPIRE', KEYS[1], 60000)
return 0`;

// Returns 0 when a token was granted, else how many milliseconds to wait.
export async function take(workspace: string, redis: Redis = getRedis()): Promise<number> {
  return Number(await redis.eval(TAKE, 1, gateKey(workspace), BURST, REFILL_PER_SEC));
}

export async function penalize(workspace: string, ms: number, redis: Redis = getRedis()): Promise<void> {
  await redis.eval(PENALIZE, 1, gateKey(workspace), Math.ceil(ms));
}

export async function recordFailure(workspace: string, redis: Redis = getRedis()): Promise<number> {
  const res = await redis.multi().incr(failsKey(workspace)).pexpire(failsKey(workspace), FAILS_TTL_MS).exec();
  return Number(res?.[0]?.[1] ?? 1);
}

export async function clearFailures(workspace: string, redis: Redis = getRedis()): Promise<void> {
  await redis.del(failsKey(workspace));
}

export function backoffMs(fails: number, rand: () => number = Math.random): number {
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, fails - 1));
  return Math.round(base * (0.5 + 0.5 * rand()));
}
