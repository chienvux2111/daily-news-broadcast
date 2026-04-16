/**
 * Channel definitions — each channel is an independent engine configuration
 * All channel state derived from env at runtime
 */

import { bigTechBlogs } from '../presets/index.js';
import { createAI } from '../ai/create-ai.js';
import { TelegramOutput } from '../outputs/index.js';

/** Map provider name → env var for API key */
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

/**
 * Helper: resolve env value (works for both CF env object and process.env)
 * @param {Object} env
 * @param {string} key
 * @param {string} [fallback]
 */
function e(env, key, fallback) { return env[key] ?? fallback; }

/** parseInt with NaN guard */
function eInt(env, key, fallback) {
  const n = parseInt(env[key]);
  return isNaN(n) ? fallback : n;
}

/**
 * Create AI plugin from env vars (shared logic extracted from both adapters)
 * @param {Object} env
 * @returns {import('../core/contracts.js').AIPlugin|null}
 */
function makeAI(env) {
  const provider = e(env, 'AI_PROVIDER', 'claude').toLowerCase();
  const keyEnv = PROVIDER_KEY_MAP[provider];
  return createAI({
    provider,
    model: e(env, 'AI_MODEL', undefined),
    apiKey: keyEnv ? env[keyEnv] : undefined,
    baseUrl: provider === 'ollama'
      ? e(env, 'OLLAMA_BASE_URL', undefined)
      : provider === 'custom' ? env.CUSTOM_AI_BASE_URL : undefined,
    name: provider === 'custom' ? e(env, 'CUSTOM_AI_NAME', undefined) : undefined,
  });
}

/**
 * Define all channels from env vars
 * @param {Object} env - CF Worker env or process.env
 * @returns {Array<import('./runner.js').ChannelConfig>}
 */
export function defineChannels(env) {
  const channels = [];

  // --- Telegram (existing, mirrors pre-refactor behavior) ---
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    channels.push({
      id: 'telegram-main',
      sources: bigTechBlogs(),
      ai: makeAI(env),
      output: new TelegramOutput({
        botToken: env.TELEGRAM_BOT_TOKEN,
        chatId: env.TELEGRAM_CHAT_ID,
      }),
      prompt: {
        language: e(env, 'SUMMARY_LANGUAGE', 'vi'),
        style: 'digest',
        audience: 'senior developers',
      },
      mode: e(env, 'BROADCAST_MODE', 'drip'),
      schedule: e(env, 'CRON_SCHEDULE', '0 1,7,13 * * *'),
      batchSize: eInt(env, 'DRIP_BATCH_SIZE', 5),
      delayMs: eInt(env, 'DRIP_DELAY_MS', 3_600_000),
      maxArticles: eInt(env, 'MAX_ARTICLES', 12),
      maxArticlesPerSource: eInt(env, 'MAX_ARTICLES_PER_SOURCE', 3),
      concurrency: eInt(env, 'CONCURRENCY_LIMIT', 5),
    });
  }

  // --- Future channels (uncomment when credentials configured) ---
  // X channel:   see phase-03-x-output-plugin.md
  // FB channel:  see phase-04-fb-threads-output.md
  // Threads:     see phase-04-fb-threads-output.md

  return channels;
}
