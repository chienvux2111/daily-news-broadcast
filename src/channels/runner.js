/**
 * Channel runner — iterates channels, runs due ones sequentially
 * Each channel creates its own NewsEngine instance with namespaced cache
 */

import { NewsEngine, PrefixedCache, createScoringMiddleware, createSemanticDedupMiddleware } from '../core/index.js';

/**
 * Check if a cron expression should fire at the given time (UTC)
 * Supports: star, star-slash-N, single integer, comma-separated, ranges
 * @param {string} cronExpr - 5-field cron: "min hour dom month dow"
 * @param {Date} now
 * @returns {boolean}
 */
export function shouldRun(cronExpr, now) {
  const fields = cronExpr.trim().split(/\s+/);
  if (fields.length !== 5) return false;

  const vals = [
    now.getUTCMinutes(), now.getUTCHours(),
    now.getUTCDate(), now.getUTCMonth() + 1, now.getUTCDay(),
  ];

  return fields.every((field, i) => matchField(field, vals[i]));
}

/** Match a single cron field against a value */
function matchField(field, value) {
  if (field === '*') return true;
  if (field.startsWith('*/')) {
    const n = parseInt(field.slice(2));
    return n > 0 ? value % n === 0 : false;
  }
  // Comma-separated: "1,7,13"
  return field.split(',').some(part => {
    if (part.includes('-')) {
      const [lo, hi] = part.split('-').map(Number);
      return value >= lo && value <= hi;
    }
    return parseInt(part) === value;
  });
}

/**
 * Build a NewsEngine instance for a single channel
 * Shared by runner, and adapters for /preview, /queue endpoints
 * @param {Object} ch - ChannelConfig
 * @param {import('../core/contracts.js').CachePlugin} cache - raw cache (will be prefixed)
 * @returns {NewsEngine}
 */
export function buildEngine(ch, cache) {
  const prefixed = new PrefixedCache(cache, `news:${ch.id}`);
  const engine = new NewsEngine();
  for (const src of ch.sources) engine.addSource(src);
  if (ch.ai) engine.useAI(ch.ai);
  engine.addOutput(ch.output);
  engine.useCache(prefixed);
  engine.use(createScoringMiddleware({ maxArticles: ch.maxArticles || 12 }));
  engine.use(createSemanticDedupMiddleware());
  engine.configure({
    maxArticlesPerSource: ch.maxArticlesPerSource || 3,
    concurrency: ch.concurrency || 5,
    ...ch.prompt,
  });
  return engine;
}

/**
 * Run all channels whose schedule matches `now`
 * @param {Array} channels - ChannelConfig[]
 * @param {Object} opts
 * @param {import('../core/contracts.js').CachePlugin} opts.cache
 * @param {Date} [opts.now]
 * @param {boolean} [opts.force] - Skip schedule check
 * @returns {Promise<Array<{ channelId: string, status: string, error?: string }>>}
 */
export async function runChannels(channels, { cache, now = new Date(), force = false } = {}) {
  const results = [];

  for (const ch of channels) {
    if (!force && !shouldRun(ch.schedule, now)) continue;

    console.log(`[Runner] ▶ ${ch.id} (${ch.mode})`);
    const start = Date.now();

    try {
      const engine = buildEngine(ch, cache);
      const result = ch.mode === 'drip'
        ? await engine.runDrip({ batchSize: ch.batchSize || 5, delayMs: ch.delayMs || 3_600_000 })
        : await engine.run({ force });

      const ms = Date.now() - start;
      console.log(`[Runner] ✓ ${ch.id} — ${result.status} (${ms}ms)`);
      results.push({ channelId: ch.id, status: result.status });
    } catch (err) {
      console.log(`[Runner] ✗ ${ch.id} — ${err.message}`);
      results.push({ channelId: ch.id, status: 'error', error: err.message });
    }
  }

  return results;
}
