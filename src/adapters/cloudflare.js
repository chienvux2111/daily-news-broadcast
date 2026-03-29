/**
 * Adapter: Cloudflare Worker
 * Deploy: wrangler deploy
 */

import { NewsEngine, CloudflareKVCache } from '../core/index.js';
import { bigTechBlogs } from '../presets/index.js';
import { ClaudeAI } from '../ai/index.js';
import { TelegramOutput } from '../outputs/index.js';

function createEngine(env) {
  const engine = new NewsEngine();

  // Sources
  for (const source of bigTechBlogs()) engine.addSource(source);

  // AI
  engine.useAI(new ClaudeAI({ apiKey: env.ANTHROPIC_API_KEY }));

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
