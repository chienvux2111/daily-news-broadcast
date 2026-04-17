/**
 * Rate limiter middleware — KV-based counter with TTL auto-expire
 * Uses CF KV (NEWS_CACHE binding) for storage
 */

/**
 * Create rate limit middleware
 * @param {{ max: number, windowSec?: number, keyFn: (c) => string }} opts
 * @returns {import('hono').MiddlewareHandler}
 */
export function rateLimit({ max, windowSec = 60, keyFn }) {
  return async (c, next) => {
    if (!c.env.NEWS_CACHE) {
      await next();
      return;
    }

    const window = Math.floor(Date.now() / (windowSec * 1000));
    const key = `rl:${keyFn(c)}:${window}`;
    const current = parseInt(await c.env.NEWS_CACHE.get(key)) || 0;

    if (current >= max) {
      return c.json({ error: 'Rate limit exceeded. Try again later.' }, 429);
    }

    await c.env.NEWS_CACHE.put(key, String(current + 1), { expirationTtl: windowSec });
    c.header('X-RateLimit-Limit', String(max));
    c.header('X-RateLimit-Remaining', String(Math.max(0, max - current - 1)));
    await next();
  };
}

/** Rate limit by IP — for auth routes */
export function rateLimitByIP(max = 60, windowSec = 60) {
  return rateLimit({
    max,
    windowSec,
    keyFn: (c) => `ip:${c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown'}`,
  });
}

/** Rate limit by user ID — for API routes */
export function rateLimitByUser(max = 120, windowSec = 60) {
  return rateLimit({
    max,
    windowSec,
    keyFn: (c) => `user:${c.get('user')?.id || 'anon'}`,
  });
}
