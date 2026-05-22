/**
 * Stream Runner — Builds NewsEngine from stream config JSON, executes pipeline
 * Supports $ENV_VAR references in config values (resolved at runtime).
 */

import { NewsEngine, MemoryCache } from '../core/index.js';
import { RSSSource, HTMLScraperSource, HackerNewsSource, RedditSource, DevToSource, JSONAPISource } from '../sources/index.js';
import { ClaudeAI, openai, groq, gemini, ollama, openRouter, togetherAI, qwen, deepseek, OpenAICompatibleAI } from '../ai/index.js';
import { TelegramOutput, SlackOutput, DiscordOutput, EmailOutput, WebhookOutput, MarkdownFileOutput } from '../outputs/index.js';
import { bigTechBlogs, communitySources, aiMLBlogs, aiNewsSources, aiDeepDiveSources, devopsSources, mobileSources } from '../presets/index.js';

// ============================================
// Env var resolution — "$VAR_NAME" → process.env.VAR_NAME
// ============================================

function resolveEnv(value) {
  if (typeof value === 'string' && value.startsWith('$')) {
    return process.env[value.slice(1)] || value;
  }
  return value;
}

function resolveConfig(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(resolveConfig);
  const resolved = {};
  for (const [k, v] of Object.entries(obj)) {
    resolved[k] = typeof v === 'object' ? resolveConfig(v) : resolveEnv(v);
  }
  return resolved;
}

// ============================================
// Source factories
// ============================================

const SOURCE_FACTORIES = {
  rss: (cfg) => new RSSSource(cfg),
  'html-scraper': (cfg) => new HTMLScraperSource(cfg),
  hackernews: (cfg) => new HackerNewsSource(cfg),
  reddit: (cfg) => new RedditSource(cfg),
  devto: (cfg) => new DevToSource(cfg),
  'json-api': (cfg) => new JSONAPISource(cfg),
};

const PRESET_FACTORIES = {
  bigTechBlogs,
  communitySources,
  aiMLBlogs,
  aiNewsSources,
  aiDeepDiveSources,
  devopsSources,
  mobileSources,
};

function createSource(config) {
  if (config.type === 'preset') {
    const fn = PRESET_FACTORIES[config.preset];
    if (!fn) throw new Error(`Unknown preset: ${config.preset}`);
    return fn();
  }
  const factory = SOURCE_FACTORIES[config.type];
  if (!factory) throw new Error(`Unknown source type: ${config.type}`);
  return factory(resolveConfig(config.config || {}));
}

// ============================================
// AI factories
// ============================================

function createAI(config) {
  if (!config || config.provider === 'none') return null;
  const { provider, model, baseUrl, name: customName } = config;
  const apiKey = resolveEnv(config.apiKey);

  switch (provider) {
    case 'claude': return new ClaudeAI({ apiKey, ...(model && { model }), ...(baseUrl && { baseUrl: resolveEnv(baseUrl) }) });
    case 'openai': return openai(apiKey, model || 'gpt-4o-mini');
    case 'groq': return groq(apiKey, model || 'llama-3.3-70b-versatile');
    case 'gemini': return gemini(apiKey, model || 'gemini-2.0-flash');
    case 'qwen': return qwen(apiKey, model || 'qwen-plus');
    case 'deepseek': return deepseek(apiKey, model || 'deepseek-chat');
    case 'ollama': return ollama(model || 'llama3.2', resolveEnv(baseUrl) || 'http://localhost:11434/v1');
    case 'openrouter': return openRouter(apiKey, model || 'anthropic/claude-3.5-sonnet');
    case 'together': return togetherAI(apiKey, model || 'meta-llama/Llama-3.3-70B-Instruct-Turbo');
    case 'custom': return new OpenAICompatibleAI({ apiKey, baseUrl: resolveEnv(baseUrl), model: model || 'default', name: customName || 'Custom AI' });
    default: throw new Error(`Unknown AI provider: ${provider}`);
  }
}

// ============================================
// Output factories
// ============================================

const OUTPUT_FACTORIES = {
  telegram: (cfg) => new TelegramOutput(cfg),
  slack: (cfg) => new SlackOutput(cfg),
  discord: (cfg) => new DiscordOutput(cfg),
  email: (cfg) => new EmailOutput(cfg),
  webhook: (cfg) => new WebhookOutput(cfg),
  markdown: (cfg) => new MarkdownFileOutput(cfg),
};

function createOutput(config) {
  const factory = OUTPUT_FACTORIES[config.type];
  if (!factory) throw new Error(`Unknown output type: ${config.type}`);
  return factory(resolveConfig(config.config || {}));
}

// ============================================
// Build engine from stream config
// ============================================

export function buildEngine(streamConfig) {
  const engine = new NewsEngine();

  for (const src of streamConfig.sources) {
    const result = createSource(src);
    if (Array.isArray(result)) {
      for (const s of result) engine.addSource(s);
    } else {
      engine.addSource(result);
    }
  }

  if (streamConfig.ai) {
    const ai = createAI(streamConfig.ai);
    if (ai) engine.useAI(ai);
  }

  for (const out of streamConfig.outputs) {
    engine.addOutput(createOutput(out));
  }

  engine.useCache(new MemoryCache());

  const opts = streamConfig.options || {};
  engine.configure({
    language: 'vi',
    style: streamConfig.ai?.style || opts.style || 'digest',
    audience: streamConfig.ai?.audience || opts.audience || 'IT professionals',
    platform: streamConfig.ai?.platform || opts.platform || 'telegram',
    ...(opts.concurrency && { concurrency: opts.concurrency }),
    ...(opts.maxArticlesPerSource && { maxArticlesPerSource: opts.maxArticlesPerSource }),
  });

  return engine;
}

// ============================================
// Execute a stream
// ============================================

export async function executeStream(streamConfig, { dryRun = false, force = true } = {}) {
  const engine = buildEngine(streamConfig);
  const logs = [];
  engine.setLogger((msg) => logs.push({ time: new Date().toISOString(), msg }));

  try {
    const result = await engine.run({ dryRun, force });
    return { ...result, logs };
  } catch (error) {
    return { status: 'error', error: error.message, logs };
  }
}
