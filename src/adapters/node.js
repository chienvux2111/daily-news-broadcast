#!/usr/bin/env node
/**
 * Adapter: Node.js CLI + Daemon
 * Usage: node src/adapters/node.js <run|drip|cron|preview|help> [--force] [--channel <id>]
 *
 * Uses channel runner — each channel is an independent engine instance
 */

import { FileCache, RedisCache, MemoryCache } from '../core/index.js';
import { buildEngine, defineChannels, runChannels } from '../channels/index.js';
 
let envVars = {};
try {
  const { parse } = await import('dotenv');
  const { readFile } = await import('node:fs/promises');
  const envFileContent = await readFile('.env', 'utf-8');
  // Read .env and let it override inherited shell values for predictable local runs.
  envVars = { ...process.env, ...parse(envFileContent) };
} catch (e) {
  envVars = process.env; // Nếu không có file .env, quay lại dùng process.env
}

function env(key, fallback) { return envVars[key] ?? fallback; }

function createCache() {
  const type = env('CACHE_TYPE', 'file');
  switch (type) {
    case 'redis': return new RedisCache(env('REDIS_URL', 'redis://localhost:6379'));
    case 'memory': return new MemoryCache();
    default: return new FileCache(env('CACHE_PATH', '.cache/news.json'));
  }
}

/** Filter channels by --channel flag or return all */
function resolveChannels(channels, channelId, env) {
  if (!channelId) return channels;
  const found = channels.filter(c => c.id === channelId);
  if (found.length === 0) {
    console.error(`❌ Channel "${channelId}" not found. Available: ${channels.map(c => c.id).join(', ')}`);
    process.exit(1);
  }
  return found;
}

// === Commands ===

async function runOnce(channels, cache, force) {
  console.log(`🚀 Running ${channels.length} channel(s)...\n`);
  const results = await runChannels(channels, { cache, now: new Date(), force });
  console.log('\n📊 Results:', JSON.stringify(results, null, 2));
  if (cache.disconnect) await cache.disconnect();
}

async function runCron(channels, cache) {
  let cron;
  try { cron = await import('node-cron'); } catch {
    console.error('❌ npm install node-cron'); process.exit(1);
  }

  console.log(`⏰ Running ${channels.length} channel(s) via */30 cron`);
  channels.forEach(ch => console.log(`   ${ch.id}: ${ch.schedule} (${ch.mode})`));
  console.log('Waiting...\n');

  cron.schedule('*/30 * * * *', async () => {
    console.log(`\n⏰ [${new Date().toISOString()}] Checking channels...`);
    const results = await runChannels(channels, { cache, now: new Date() });
    if (results.length > 0) {
      console.log(`📊 ${results.map(r => `${r.channelId}:${r.status}`).join(', ')}`);
    }
  });

  const quit = async () => {
    console.log('\n🛑 Bye');
    if (cache.disconnect) await cache.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', quit);
  process.on('SIGTERM', quit);
}

async function runPreview(channels, cache) {
  const ch = channels[0];
  console.log(`👀 Preview: ${ch.id} (${ch.mode})\n`);
  const engine = buildEngine(ch, cache);
  const result = await engine.run({ dryRun: true });
  if (result.content) {
    console.log('─'.repeat(60));
    console.log(result.content);
    console.log('─'.repeat(60));
  }
  console.log('\n📊', JSON.stringify(result.stats, null, 2));
  if (cache.disconnect) await cache.disconnect();
}

// === CLI ===

const args = process.argv.slice(2);
const cmd = args.find(a => !a.startsWith('--')) || 'run';
const force = args.includes('--force');
const channelIdx = args.indexOf('--channel');
const channelId = channelIdx !== -1 ? args[channelIdx + 1] : null;

const allChannels = defineChannels(envVars);
if (allChannels.length === 0) {
  console.error('❌ No channels configured. Check env vars (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID).');
  process.exit(1);
}

const channels = resolveChannels(allChannels, channelId, envVars);
const cache = createCache();

console.log(`📡 ${channels.length} channel(s): ${channels.map(c => c.id).join(', ')}`);
if (channels[0]?.ai) console.log(`🤖 AI: ${channels[0].ai.name}`);

switch (cmd) {
  case 'run': await runOnce(channels, cache, force); break;
  case 'drip': await runOnce(channels, cache, force); break; // drip is per-channel mode, runner handles it
  case 'cron': case 'daemon': await runCron(channels, cache); break;
  case 'preview': await runPreview(channels, cache); break;
  default:
    console.log(`
🔥 NewsEngine — Node.js Adapter

  node src/adapters/node.js <command> [--force] [--channel <id>]

  run       Run all due channels (digest or drip per channel config)
  drip      Same as run (mode is per-channel config now)
  cron      Daemon — checks channels every 30 min
  preview   Dry run — no output send (first channel or --channel)
  help      This message

  --force           Skip dedup cache
  --channel <id>    Run specific channel only
`);
}
