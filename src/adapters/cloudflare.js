/**
 * Adapter: Cloudflare Worker
 * Deploy: wrangler deploy
 */

import { NewsEngine, CloudflareKVCache } from '../core/index.js';
import { bigTechBlogs } from '../presets/index.js';
import { ClaudeAI, openai, groq, gemini, qwen, deepseek, openRouter, togetherAI, OpenAICompatibleAI } from '../ai/index.js';
import { TelegramOutput } from '../outputs/index.js';

function createAI(env) {
  const provider = (env.AI_PROVIDER || 'claude').toLowerCase();
  const model = env.AI_MODEL || undefined;

  switch (provider) {
    case 'claude':
    case 'anthropic':
      return new ClaudeAI({ apiKey: env.ANTHROPIC_API_KEY, ...(model && { model }) });
    case 'openai':
      return openai(env.OPENAI_API_KEY, model || 'gpt-4o-mini');
    case 'groq':
      return groq(env.GROQ_API_KEY, model || 'llama-3.3-70b-versatile');
    case 'gemini':
    case 'google':
      return gemini(env.GEMINI_API_KEY, model || 'gemini-2.0-flash');
    case 'qwen':
    case 'alibaba':
    case 'dashscope':
      return qwen(env.QWEN_API_KEY, model || 'qwen-plus');
    case 'deepseek':
      return deepseek(env.DEEPSEEK_API_KEY, model || 'deepseek-chat');
    case 'openrouter':
      return openRouter(env.OPENROUTER_API_KEY, model || 'anthropic/claude-3.5-sonnet');
    case 'together':
      return togetherAI(env.TOGETHER_API_KEY, model || 'meta-llama/Llama-3.3-70B-Instruct-Turbo');
    case 'custom':
      return new OpenAICompatibleAI({
        apiKey: env.CUSTOM_AI_API_KEY,
        baseUrl: env.CUSTOM_AI_BASE_URL,
        model: model || env.CUSTOM_AI_MODEL || 'default',
        name: env.CUSTOM_AI_NAME || 'Custom AI',
      });
    default:
      throw new Error(`Unknown AI_PROVIDER: "${provider}"`);
  }
}

function createEngine(env) {
  const engine = new NewsEngine();

  // Sources
  for (const source of bigTechBlogs()) engine.addSource(source);

  // AI
  engine.useAI(createAI(env));

  // Output
  engine.addOutput(new TelegramOutput({
    botToken: env.TELEGRAM_BOT_TOKEN,
    chatId: env.TELEGRAM_CHAT_ID,
  }));

  // Cache & config
  engine
    .useCache(new CloudflareKVCache(env.NEWS_CACHE))
    .configure({
      maxArticlesPerSource: parseInt(env.MAX_ARTICLES_PER_SOURCE || '3'),
      concurrency: parseInt(env.CONCURRENCY_LIMIT || '5'),
      language: env.SUMMARY_LANGUAGE || 'vi',
    });

  return engine;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(createEngine(env).run());
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
      ctx.waitUntil(createEngine(env).run({ force }));
      return json({ message: 'Triggered', force });
    }

    if (url.pathname === '/preview') {
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
