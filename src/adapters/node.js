#!/usr/bin/env node
/**
 * Adapter: Node.js CLI + Daemon
 * Usage: node src/adapters/node.js <run|cron|preview|help> [--force]
 */

import { NewsEngine, FileCache, RedisCache, MemoryCache } from '../core/index.js';
import { bigTechBlogs } from '../presets/index.js';
import { ClaudeAI, openai, groq, gemini, qwen, deepseek, ollama, openRouter, togetherAI, OpenAICompatibleAI } from '../ai/index.js';
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

function createAI() {
  const provider = env('AI_PROVIDER', 'claude').toLowerCase();
  const model = env('AI_MODEL', undefined);

  switch (provider) {
    case 'none':
    case 'off':
    case 'skip':
      return null;

    case 'claude':
    case 'anthropic':
      return new ClaudeAI({
        apiKey: process.env.ANTHROPIC_API_KEY,
        ...(model && { model }),
      });

    case 'openai':
      return openai(process.env.OPENAI_API_KEY, model || 'gpt-4o-mini');

    case 'groq':
      return groq(process.env.GROQ_API_KEY, model || 'llama-3.3-70b-versatile');

    case 'gemini':
    case 'google':
      return gemini(process.env.GEMINI_API_KEY, model || 'gemini-2.0-flash');

    case 'qwen':
    case 'alibaba':
    case 'dashscope':
      return qwen(process.env.QWEN_API_KEY, model || 'qwen-plus');

    case 'deepseek':
      return deepseek(process.env.DEEPSEEK_API_KEY, model || 'deepseek-chat');

    case 'ollama':
      return ollama(model || 'llama3.2', env('OLLAMA_BASE_URL', 'http://localhost:11434/v1'));

    case 'openrouter':
      return openRouter(process.env.OPENROUTER_API_KEY, model || 'anthropic/claude-3.5-sonnet');

    case 'together':
      return togetherAI(process.env.TOGETHER_API_KEY, model || 'meta-llama/Llama-3.3-70B-Instruct-Turbo');

    case 'custom':
      return new OpenAICompatibleAI({
        apiKey: process.env.CUSTOM_AI_API_KEY,
        baseUrl: process.env.CUSTOM_AI_BASE_URL,
        model: model || process.env.CUSTOM_AI_MODEL || 'default',
        name: env('CUSTOM_AI_NAME', 'Custom AI'),
      });

    default:
      console.error(`❌ Unknown AI_PROVIDER: "${provider}"\n   Supported: claude, openai, groq, gemini, qwen, deepseek, ollama, openrouter, together, custom`);
      process.exit(1);
  }
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

  const ai = createAI();
  console.log(`🤖 AI Provider: ${ai ? ai.name : 'None (raw mode)'}`);

  const engine = new NewsEngine();
  for (const s of bigTechBlogs()) engine.addSource(s);

  if (ai) engine.useAI(ai);

  return engine
    .addOutput(new TelegramOutput({
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      chatId: process.env.TELEGRAM_CHAT_ID,
    }))
    .useCache(createCache())
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

// === CLI ===

const cmd = process.argv[2] || 'run';
const force = process.argv.includes('--force');

switch (cmd) {
  case 'run': await runOnce(force); break;
  case 'cron': case 'daemon': await runCron(); break;
  case 'preview': await runPreview(); break;
  default:
    console.log(`
🔥 NewsEngine — Node.js Adapter

  node src/adapters/node.js <command> [--force]

  run       One-time execution (default)
  cron      Daemon with scheduled runs
  preview   Dry run — no Telegram send
  help      This message
`);
}
