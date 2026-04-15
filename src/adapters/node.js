#!/usr/bin/env node
/**
 * Adapter: Node.js CLI + Daemon
 * Usage: node src/adapters/node.js <run|cron|preview|help> [--force]
 */

import { NewsEngine, FileCache, RedisCache, MemoryCache, createScoringMiddleware, createSemanticDedupMiddleware } from '../core/index.js';
import { bigTechBlogs } from '../presets/index.js';
import { createAI } from '../ai/create-ai.js';
import { TelegramOutput } from '../outputs/index.js';

// Load .env
try { const { config } = await import('dotenv'); config(); } catch {}

function env(key, fallback) { return process.env[key] || fallback; }

function requiredEnv(...keys) {
  const missing = keys.filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`❌ Missing env: ${missing.join(', ')}\n   Copy .env.example → .env and fill in values.`);
    process.exit(1);
  }
}

/** Map provider name to the correct env var for API key */
const PROVIDER_KEY_MAP = {
  claude: 'ANTHROPIC_API_KEY', anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  groq: 'GROQ_API_KEY',
  gemini: 'GEMINI_API_KEY', google: 'GEMINI_API_KEY',
  qwen: 'QWEN_API_KEY', alibaba: 'QWEN_API_KEY', dashscope: 'QWEN_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  together: 'TOGETHER_API_KEY',
  custom: 'CUSTOM_AI_API_KEY',
};

function makeAI() {
  const provider = env('AI_PROVIDER', 'claude').toLowerCase();
  const keyEnv = PROVIDER_KEY_MAP[provider];

  return createAI({
    provider,
    model: env('AI_MODEL', undefined),
    apiKey: keyEnv ? process.env[keyEnv] : undefined,
    baseUrl: provider === 'ollama'
      ? env('OLLAMA_BASE_URL', undefined)
      : provider === 'custom' ? process.env.CUSTOM_AI_BASE_URL : undefined,
    name: provider === 'custom' ? env('CUSTOM_AI_NAME', undefined) : undefined,
  });
}

function createCache() {
  const type = env('CACHE_TYPE', 'file');
  switch (type) {
    case 'redis': return new RedisCache(env('REDIS_URL', 'redis://localhost:6379'));
    case 'memory': return new MemoryCache();
    default: return new FileCache(env('CACHE_PATH', '.cache/news.json'));
  }
}

function createEngine() {
  requiredEnv('TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID');

  const ai = makeAI();
  console.log(`🤖 AI Provider: ${ai ? ai.name : 'None (raw mode)'}`);

  const engine = new NewsEngine();
  for (const s of bigTechBlogs()) engine.addSource(s);

  if (ai) engine.useAI(ai);

  const maxArticles = parseInt(env('MAX_ARTICLES', '12'));

  return engine
    .addOutput(new TelegramOutput({
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      chatId: process.env.TELEGRAM_CHAT_ID,
    }))
    .useCache(createCache())
    .use(createScoringMiddleware({ maxArticles }))
    .use(createSemanticDedupMiddleware())
    .configure({
      maxArticlesPerSource: parseInt(env('MAX_ARTICLES_PER_SOURCE', '3')),
      concurrency: parseInt(env('CONCURRENCY_LIMIT', '5')),
      language: env('SUMMARY_LANGUAGE', 'vi'),
    });
}

// === Commands ===

async function runOnce(force = false) {
  const engine = createEngine();
  console.log('🚀 Running digest...\n');
  const result = await engine.run({ force });
  console.log('\n📊 Result:', JSON.stringify(result, null, 2));
  const cache = engine.cache;
  if (cache.disconnect) await cache.disconnect();
}

async function runCron() {
  const schedule = env('CRON_SCHEDULE', '0 7 * * *');
  let cron;
  try { cron = await import('node-cron'); } catch {
    console.error('❌ npm install node-cron'); process.exit(1);
  }

  const engine = createEngine();
  console.log(`⏰ Cron: "${schedule}" | Sources: ${engine.sources.length}`);
  console.log('Waiting...\n');

  cron.schedule(schedule, async () => {
    console.log(`\n⏰ [${new Date().toISOString()}] Triggered`);
    const r = await engine.run();
    console.log(`📊 ${r.status}`);
  });

  const quit = async () => { console.log('\n🛑 Bye'); process.exit(0); };
  process.on('SIGINT', quit);
  process.on('SIGTERM', quit);
}

async function runPreview() {
  const engine = createEngine();
  console.log('👀 Preview mode...\n');
  const result = await engine.run({ dryRun: true });
  if (result.content) {
    console.log('─'.repeat(60));
    console.log(result.content);
    console.log('─'.repeat(60));
  }
  console.log('\n📊', JSON.stringify(result.stats, null, 2));
  if (engine.cache.disconnect) await engine.cache.disconnect();
}

async function runDrip(force = false) {
  const engine = createEngine();
  const delayMs = parseInt(env('DRIP_DELAY_MS', '5000'));
  console.log(`💧 Drip mode — sending articles one by one (${delayMs}ms delay)...\n`);
  const result = await engine.runDrip({ force, delayMs });
  console.log('\n📊 Result:', JSON.stringify(result.stats, null, 2));
  if (engine.cache.disconnect) await engine.cache.disconnect();
}

// === CLI ===

const cmd = process.argv[2] || 'run';
const force = process.argv.includes('--force');

switch (cmd) {
  case 'run': await runOnce(force); break;
  case 'drip': await runDrip(force); break;
  case 'cron': case 'daemon': await runCron(); break;
  case 'preview': await runPreview(); break;
  default:
    console.log(`
🔥 NewsEngine — Node.js Adapter

  node src/adapters/node.js <command> [--force]

  run       One-time digest (all articles in 1 message)
  drip      Drip mode (each article as individual message)
  cron      Daemon with scheduled runs
  preview   Dry run — no Telegram send
  help      This message
`);
}
