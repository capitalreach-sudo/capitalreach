import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

// ─── Redis client (gracefully degrades when not configured) ─────────────────

const isRedisConfigured =
  process.env.UPSTASH_REDIS_REST_URL &&
  !process.env.UPSTASH_REDIS_REST_URL.includes("REPLACE_ME") &&
  !process.env.UPSTASH_REDIS_REST_URL.includes("placeholder");

let _redis: Redis | null = null;

try {
  if (isRedisConfigured) {
    _redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  } else {
    console.warn("[Redis] Not configured — rate limiting and caching will be bypassed.");
  }
} catch (err) {
  console.warn("[Redis] Failed to initialise client — rate limiting and caching will be bypassed.", err);
}

export const redis = _redis;

// ─── Mock rate limiter that always passes ────────────────────────────────────

const MOCK_LIMITER = {
  limit: async (_identifier: string) => ({
    success: true,
    limit: 9999,
    remaining: 9999,
    reset: Date.now() + 3_600_000,
    pending: Promise.resolve(),
  }),
};

// ─── Rate limiters ───────────────────────────────────────────────────────────

// Angel investors: 10 new message threads per month
export const messageRatelimit: Pick<Ratelimit, "limit"> = _redis
  ? new Ratelimit({
      redis: _redis,
      limiter: Ratelimit.fixedWindow(10, "30 d"),
      prefix: "capitalreach:messages",
    })
  : MOCK_LIMITER;

// General API rate limiter: 100 req per minute
export const apiRatelimit: Pick<Ratelimit, "limit"> = _redis
  ? new Ratelimit({
      redis: _redis,
      limiter: Ratelimit.slidingWindow(100, "1 m"),
      prefix: "capitalreach:api",
    })
  : MOCK_LIMITER;

// AI endpoints: 20 per hour
export const aiRatelimit: Pick<Ratelimit, "limit"> = _redis
  ? new Ratelimit({
      redis: _redis,
      limiter: Ratelimit.fixedWindow(20, "1 h"),
      prefix: "capitalreach:ai",
    })
  : MOCK_LIMITER;

// ─── Helpers (silently no-op when Redis is unavailable) ─────────────────────

export async function trackPageview(startupId: string, sessionId: string): Promise<boolean> {
  if (!_redis) return false;
  const key = `capitalreach:pv:${startupId}:${sessionId}`;
  const exists = await _redis.exists(key);
  if (exists) return false;
  await _redis.set(key, 1, { ex: 1800 });
  return true;
}

export async function getStartupPageviews(startupId: string, days = 7): Promise<number> {
  if (!_redis) return 0;
  const key = `capitalreach:pv_count:${startupId}`;
  const count = await _redis.get<number>(key);
  return count || 0;
}

export async function incrementPageviewCount(startupId: string): Promise<void> {
  if (!_redis) return;
  const key = `capitalreach:pv_count:${startupId}`;
  await _redis.incr(key);
}

export async function cacheStartupScore(startupId: string, score: number): Promise<void> {
  if (!_redis) return;
  await _redis.set(`capitalreach:score:${startupId}`, score, { ex: 86400 });
}

export async function getCachedScore(startupId: string): Promise<number | null> {
  if (!_redis) return null;
  return _redis.get<number>(`capitalreach:score:${startupId}`);
}

export async function getMessageThreadCount(investorId: string): Promise<number> {
  if (!_redis) return 0;
  const key = `capitalreach:msg_threads:${investorId}`;
  const count = await _redis.get<number>(key);
  return count || 0;
}

export async function incrementMessageThreadCount(investorId: string): Promise<void> {
  if (!_redis) return;
  const key = `capitalreach:msg_threads:${investorId}`;
  const ttl = await _redis.ttl(key);
  await _redis.incr(key);
  if (ttl < 0) {
    await _redis.expire(key, 30 * 24 * 60 * 60);
  }
}
