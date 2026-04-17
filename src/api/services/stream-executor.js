/**
 * Stream executor — builds a NewsEngine instance from a stream config JSON
 * Maps config → plugin instances using existing plugin factories
 */

import { NewsEngine, CloudflareKVCache, PrefixedCache, createScoringMiddleware, createSemanticDedupMiddleware } from '../../core/index.js';
import { createAI } from '../../ai/create-ai.js';
import { RSSSource, createRSSSources } from '../../sources/rss.js';
import { HackerNewsSource } from '../../sources/hackernews.js';
import { RedditSource } from '../../sources/reddit.js';
import { DevToSource } from '../../sources/devto.js';
import { GitHubTrendingSource } from '../../sources/github-trending.js';
import { TelegramOutput } from '../../outputs/telegram.js';
import { SlackOutput, DiscordOutput, WebhookOutput, EmailOutput } from '../../outputs/channels.js';

/**
 * Create source plugin from config entry
 * @param {{ type: string, [key: string]: any }} src
 * @returns {import('../../core/contracts.js').SourcePlugin}
 */
function createSource(src) {
  switch (src.type) {
    case 'rss': return new RSSSource({ url: src.url, name: src.name });
    case 'hackernews': return new HackerNewsSource({ minPoints: src.minPoints || 50 });
    case 'reddit': return new RedditSource({ subreddit: src.subreddit, minUpvotes: src.minUpvotes || 10 });
    case 'devto': return new DevToSource();
    case 'github-trending': return new GitHubTrendingSource(src);
    default: throw new Error(`Unknown source type: ${src.type}`);
  }
}

/**
 * Create output plugin from config entry
 * @param {{ type: string, [key: string]: any }} out
 * @returns {import('../../core/contracts.js').OutputPlugin}
 */
function createOutput(out) {
  switch (out.type) {
    case 'telegram': return new TelegramOutput({ botToken: out.botToken, chatId: out.chatId });
    case 'discord': return new DiscordOutput({ webhookUrl: out.webhookUrl });
    case 'slack': return new SlackOutput({ webhookUrl: out.webhookUrl });
    case 'webhook': return new WebhookOutput({ url: out.url, headers: out.headers });
    case 'email': return new EmailOutput({ to: out.to, from: out.from, subject: out.subject });
    default: throw new Error(`Unknown output type: ${out.type}`);
  }
}

/**
 * Build a fully configured NewsEngine from stream config JSON
 * @param {Object} config - parsed stream.config JSON
 * @param {Object} env - CF Worker env (for KV cache + AI keys)
 * @param {string} streamId - for cache key namespacing
 * @returns {NewsEngine}
 */
export function buildEngineFromConfig(config, env, streamId) {
  const engine = new NewsEngine();

  // Sources
  for (const src of config.sources) {
    engine.addSource(createSource(src));
  }

  // AI
  const aiConfig = config.ai;
  if (aiConfig && aiConfig.provider !== 'none') {
    const providerKeyMap = {
      claude: 'ANTHROPIC_API_KEY', anthropic: 'ANTHROPIC_API_KEY',
      openai: 'OPENAI_API_KEY', groq: 'GROQ_API_KEY',
      gemini: 'GEMINI_API_KEY', deepseek: 'DEEPSEEK_API_KEY',
      openrouter: 'OPENROUTER_API_KEY', together: 'TOGETHER_API_KEY',
    };
    const keyEnv = providerKeyMap[aiConfig.provider];
    const ai = createAI({
      provider: aiConfig.provider,
      model: aiConfig.model,
      apiKey: keyEnv ? env[keyEnv] : undefined,
    });
    if (ai) engine.useAI(ai);
  }

  // Outputs
  for (const out of config.outputs) {
    engine.addOutput(createOutput(out));
  }

  // Cache (KV-based, namespaced per stream)
  if (env.NEWS_CACHE) {
    const cache = new CloudflareKVCache(env.NEWS_CACHE);
    engine.useCache(new PrefixedCache(cache, `stream:${streamId}`));
  }

  // Middlewares
  engine.use(createScoringMiddleware({ maxArticles: config.maxArticles || 15 }));
  engine.use(createSemanticDedupMiddleware());

  // Config
  engine.configure({
    maxArticlesPerSource: 3,
    concurrency: config.concurrency || 5,
    language: aiConfig?.language || 'en',
    style: aiConfig?.style || 'digest',
    audience: aiConfig?.audience || 'developers',
  });

  return engine;
}
