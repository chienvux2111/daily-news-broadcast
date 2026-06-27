/**
 * Channel definitions — each channel is an independent engine configuration
 * All channel state derived from env at runtime
 */

import { RSSSource, XSource } from '../sources/index.js';
import { createAI } from '../ai/create-ai.js';
import { TelegramOutput, XOutput, FacebookOutput, ThreadsOutput } from '../outputs/index.js';
import { bigTechBlogs } from '../presets/index.js';
import { KVTokenStore } from '../utils/token-store.js';

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
const TRADING_AUDIENCE = 'traders, retail investors, and financial professionals';
const IT_AUDIENCE = 'IT professionals';

/**
 * Helper: resolve env value (works for both CF env object and process.env)
 * @param {Object} env
 * @param {string} key
 * @param {string} [fallback]
 */
function e(env, key, fallback) { return env[key] ?? fallback; }

function eBool(env, key, fallback = false) {
  const value = env[key];
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function eList(env, key, fallback = []) {
  const value = env[key];
  if (!value) return fallback;
  return String(value).split(',').map(item => item.trim()).filter(Boolean);
}

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

  const telegramSources = [
    new RSSSource({
      id: 'coindesk',
      name: 'CoinDesk',
      feedUrl: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
      category: 'Crypto News',
      icon: '₿',
    }),
    new RSSSource({
      id: 'cointelegraph',
      name: 'Cointelegraph',
      feedUrl: 'https://cointelegraph.com/rss',
      category: 'Crypto News',
      icon: '⚡',
    }),
    new RSSSource({
      id: 'theblock',
      name: 'The Block',
      feedUrl: 'https://www.theblock.co/rss.xml',
      category: 'Crypto News',
      icon: '🧱',
    }),
    new RSSSource({
      id: 'bloomberg-markets',
      name: 'Bloomberg Markets',
      feedUrl: 'https://feeds.bloomberg.com/markets/news.rss',
      category: 'Macro & Markets',
      icon: '💼',
    }),
  ];

  const xSourceUsers = eList(env, 'X_SOURCE_USERS', []);
  if (env.X_BEARER_TOKEN && xSourceUsers.length > 0) {
    telegramSources.push(new XSource({
      id: 'x-crypto-watchlist',
      name: 'X Crypto Watchlist',
      usernames: xSourceUsers,
      bearerToken: env.X_BEARER_TOKEN,
      minEngagement: eInt(env, 'X_SOURCE_MIN_ENGAGEMENT', 50),
      maxResultsPerUser: eInt(env, 'X_SOURCE_MAX_RESULTS_PER_USER', 10),
      includeReplies: eBool(env, 'X_SOURCE_INCLUDE_REPLIES', false),
      includeReposts: eBool(env, 'X_SOURCE_INCLUDE_REPOSTS', false),
      includeQuotes: eBool(env, 'X_SOURCE_INCLUDE_QUOTES', true),
      ...(env.X_SOURCE_KEYWORDS ? { cryptoKeywords: eList(env, 'X_SOURCE_KEYWORDS', []) } : {}),
    }));
  }

  if (env.EXTRA_RSS_FEEDS) {
    const extraFeeds = env.EXTRA_RSS_FEEDS
      .split(',')
      .map(feed => feed.trim())
      .filter(Boolean);

    extraFeeds.forEach((feedUrl, index) => {
      telegramSources.push(new RSSSource({
        id: `extra-feed-${index + 1}`,
        name: `Extra Feed ${index + 1}`,
        feedUrl,
        category: 'Custom Feed',
        icon: '📰',
      }));
    });
  }

  // --- Telegram (crypto + macro news) ---
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    channels.push({
      id: 'telegram-main',
      sources: telegramSources,
      ai: makeAI(env),
      output: new TelegramOutput({
        botToken: env.TELEGRAM_BOT_TOKEN,
        chatId: env.TELEGRAM_CHAT_ID,
      }),
      prompt: {
        language: e(env, 'SUMMARY_LANGUAGE', 'en'),
        style: e(env, 'TELEGRAM_STYLE', 'digest'),
        audience: e(env, 'TARGET_AUDIENCE', TRADING_AUDIENCE),
        platform: 'telegram',
      },
      mode: e(env, 'BROADCAST_MODE', 'drip'),
      schedule: e(env, 'CRON_SCHEDULE', '0 1,7,13 * * *'),
      batchSize: eInt(env, 'DRIP_BATCH_SIZE', 1),
      delayMs: eInt(env, 'DRIP_DELAY_MS', 0),
      maxArticles: eInt(env, 'MAX_ARTICLES', 12),
      maxArticlesPerSource: eInt(env, 'MAX_ARTICLES_PER_SOURCE', 3),
      concurrency: eInt(env, 'CONCURRENCY_LIMIT', 5),
    });
  }

  // --- X (Twitter) — uncomment when OAuth 2.0 credentials configured ---
  // Requires: X_CLIENT_ID, TOKEN_ENCRYPTION_KEY, plus token stored in KV
  if (env.X_CLIENT_ID && env.TOKEN_ENCRYPTION_KEY && env.NEWS_CACHE) {
    const kvStore = new KVTokenStore(env.NEWS_CACHE, env.TOKEN_ENCRYPTION_KEY);
    channels.push({
      id: 'x-tech-vn',
      sources: bigTechBlogs(),
      ai: makeAI(env),
      output: new XOutput({ kvTokenStore: kvStore, channelId: 'x-tech-vn' }),
      prompt: { language: 'vi', style: 'digest', audience: IT_AUDIENCE, platform: 'x' },
      mode: 'drip',
      schedule: e(env, 'X_CRON_SCHEDULE', '0 0,6,12 * * *'),
      batchSize: eInt(env, 'X_BATCH_SIZE', 3),
      delayMs: 0,
      maxArticles: 10,
      maxArticlesPerSource: 3,
      concurrency: 5,
    });
  }

  // --- Facebook Page — uncomment when Meta app review approved ---
  // Requires: FB_PAGE_TOKEN, FB_PAGE_ID
  if (env.FB_PAGE_TOKEN && env.FB_PAGE_ID) {
    channels.push({
      id: 'fb-ai-vn',
      sources: bigTechBlogs(),
      ai: makeAI(env),
      output: new FacebookOutput({ pageToken: env.FB_PAGE_TOKEN, pageId: env.FB_PAGE_ID }),
      prompt: { language: 'vi', style: 'digest', audience: IT_AUDIENCE, platform: 'facebook' },
      mode: 'drip',
      schedule: e(env, 'FB_CRON_SCHEDULE', '0 1,7,13 * * *'),
      batchSize: eInt(env, 'FB_BATCH_SIZE', 1),
      delayMs: 0,
      maxArticles: 10,
      maxArticlesPerSource: 3,
      concurrency: 5,
    });
  }

  // --- Threads — uncomment when token stored in KV ---
  // Requires: THREADS_USER_ID, TOKEN_ENCRYPTION_KEY, plus token in KV
  if (env.THREADS_USER_ID && env.TOKEN_ENCRYPTION_KEY && env.NEWS_CACHE) {
    const kvStore = new KVTokenStore(env.NEWS_CACHE, env.TOKEN_ENCRYPTION_KEY);
    channels.push({
      id: 'threads-dev-vn',
      sources: bigTechBlogs(),
      ai: makeAI(env),
      output: new ThreadsOutput({ userId: env.THREADS_USER_ID, kvTokenStore: kvStore, channelId: 'threads-dev-vn' }),
      prompt: { language: 'vi', style: 'digest', audience: IT_AUDIENCE, platform: 'threads' },
      mode: 'drip',
      schedule: e(env, 'THREADS_CRON_SCHEDULE', '0 2,8 * * *'),
      batchSize: 2,
      delayMs: 0,
      maxArticles: 8,
      maxArticlesPerSource: 3,
      concurrency: 5,
    });
  }

  return channels;
}
