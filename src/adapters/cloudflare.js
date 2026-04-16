/**
 * Adapter: Cloudflare Worker
 * Deploy: wrangler deploy
 */

import { NewsEngine, CloudflareKVCache, createScoringMiddleware, createSemanticDedupMiddleware } from '../core/index.js';
import { bigTechBlogs } from '../presets/index.js';
import { createAI } from '../ai/create-ai.js';
import { TelegramOutput } from '../outputs/index.js';

/** Map CF Worker env bindings to createAI config */
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

function createEngine(cfEnv) {
  const provider = (cfEnv.AI_PROVIDER || 'claude').toLowerCase();
  const keyEnv = PROVIDER_KEY_MAP[provider];

  const ai = createAI({
    provider,
    model: cfEnv.AI_MODEL || undefined,
    apiKey: keyEnv ? cfEnv[keyEnv] : undefined,
    baseUrl: provider === 'custom' ? cfEnv.CUSTOM_AI_BASE_URL : undefined,
    name: provider === 'custom' ? (cfEnv.CUSTOM_AI_NAME || undefined) : undefined,
  });
  const engine = new NewsEngine();
  for (const source of bigTechBlogs()) engine.addSource(source);
  if (ai) engine.useAI(ai);

  engine.addOutput(new TelegramOutput({
    botToken: cfEnv.TELEGRAM_BOT_TOKEN,
    chatId: cfEnv.TELEGRAM_CHAT_ID,
  }));

  const maxArticles = parseInt(cfEnv.MAX_ARTICLES || '12');

  engine
    .useCache(new CloudflareKVCache(cfEnv.NEWS_CACHE))
    .use(createScoringMiddleware({ maxArticles }))
    .use(createSemanticDedupMiddleware())
    .configure({
      maxArticlesPerSource: parseInt(cfEnv.MAX_ARTICLES_PER_SOURCE || '3'),
      concurrency: parseInt(cfEnv.CONCURRENCY_LIMIT || '5'),
      language: cfEnv.SUMMARY_LANGUAGE || 'vi',
    });

  return engine;
}

export default {
  async scheduled(event, env, ctx) {
    const mode = (env.BROADCAST_MODE || 'drip').toLowerCase();
    if (mode === 'drip') {
      ctx.waitUntil(createEngine(env).runDrip({
        batchSize: parseInt(env.DRIP_BATCH_SIZE || '1'),
        delayMs: parseInt(env.DRIP_DELAY_MS || '3000'),
      }));
    } else {
      ctx.waitUntil(createEngine(env).run());
    }
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/' || url.pathname === '/health') {
      return json({ status: 'ok', time: new Date().toISOString() });
    }

    if (url.pathname === '/trigger' && request.method === 'POST') {
      if (env.TRIGGER_SECRET && request.headers.get('Authorization') !== `Bearer ${env.TRIGGER_SECRET}`) {
        return new Response('Unauthorized', { status: 401 });
      }
      const force = url.searchParams.get('force') === 'true';
      const mode = url.searchParams.get('mode') || env.BROADCAST_MODE || 'drip';
      if (mode === 'drip') {
        ctx.waitUntil(createEngine(env).runDrip({
          force,
          batchSize: parseInt(env.DRIP_BATCH_SIZE || '1'),
          delayMs: parseInt(env.DRIP_DELAY_MS || '3000'),
        }));
      } else {
        ctx.waitUntil(createEngine(env).run({ force }));
      }
      return json({ message: 'Triggered', force, mode });
    }

    if (url.pathname === '/preview') {
      if (env.TRIGGER_SECRET && request.headers.get('Authorization') !== `Bearer ${env.TRIGGER_SECRET}`) {
        return new Response('Unauthorized', { status: 401 });
      }
      const result = await createEngine(env).generate();
      return json(result);
    }

    return new Response('Not found', { status: 404 });
  },
};

function json(data) {
  return new Response(JSON.stringify(data, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
}
