export { NewsEngine } from './engine.js';
export { SourcePlugin, AIPlugin, OutputPlugin, CachePlugin } from './contracts.js';
export { MemoryCache, FileCache, CloudflareKVCache, RedisCache } from './caches.js';
export { createScoringMiddleware } from './scoring.js';
export { createSemanticDedupMiddleware } from './semantic-dedup.js';
export { groupByCategory } from './grouping.js';
