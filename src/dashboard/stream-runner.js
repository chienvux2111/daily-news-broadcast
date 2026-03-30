/**
 * Stream Runner — Builds NewsEngine from stream config JSON, executes pipeline
 * Maps JSON configs from the database to actual plugin instances.
 */

import { NewsEngine, MemoryCache, FileCache } from '../core/index.js';
import { RSSSource, HTMLScraperSource, HackerNewsSource, RedditSource, DevToSource, JSONAPISource } from '../sources/index.js';
import { ClaudeAI, openai, groq, gemini, ollama, openRouter, togetherAI, qwen, deepseek, OpenAICompatibleAI } from '../ai/index.js';
import { TelegramOutput, SlackOutput, DiscordOutput, EmailOutput, WebhookOutput, MarkdownFileOutput } from '../outputs/index.js';
import { bigTechBlogs, communitySources, aiMLBlogs, devopsSources, mobileSources } from '../presets/index.js';

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
  devopsSources,
  mobileSources,
};

function createSource(config) {
  // Preset: { type: 'preset', preset: 'bigTechBlogs' }
  if (config.type === 'preset') {
    const fn = PRESET_FACTORIES[config.preset];
    if (!fn) throw new Error(`Unknown preset: ${config.preset}`);
    return fn();
  }
  const factory = SOURCE_FACTORIES[config.type];
  if (!factory) throw new Error(`Unknown source type: ${config.type}`);
  return factory(config.config || {});
}

// ============================================
// AI factories
// ============================================

function createAI(config) {
  if (!config) return null;
  const { provider, apiKey, model, baseUrl, name: customName } = config;

  switch (provider) {
    case 'claude': return new ClaudeAI({ apiKey, ...(model && { model }), ...(baseUrl && { baseUrl }) });
    case 'openai': return openai(apiKey, model || 'gpt-4o-mini');
    case 'groq': return groq(apiKey, model || 'llama-3.3-70b-versatile');
    case 'gemini': return gemini(apiKey, model || 'gemini-2.0-flash');
    case 'qwen': return qwen(apiKey, model || 'qwen-plus');
    case 'deepseek': return deepseek(apiKey, model || 'deepseek-chat');
    case 'ollama': return ollama(model || 'llama3.2', baseUrl || 'http://localhost:11434/v1');
    case 'openrouter': return openRouter(apiKey, model || 'anthropic/claude-3.5-sonnet');
    case 'together': return togetherAI(apiKey, model || 'meta-llama/Llama-3.3-70B-Instruct-Turbo');
    case 'custom': return new OpenAICompatibleAI({ apiKey, baseUrl, model: model || 'default', name: customName || 'Custom AI' });
    case 'none': return null;
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
  return factory(config.config || {});
}

// ============================================
// Build engine from stream config
// ============================================

export function buildEngine(streamConfig) {
  const engine = new NewsEngine();

  // Wire sources
  for (const src of streamConfig.sources) {
    const result = createSource(src);
    if (Array.isArray(result)) {
      for (const s of result) engine.addSource(s);
    } else {
      engine.addSource(result);
    }
  }

  // Wire AI
  if (streamConfig.ai) {
    const ai = createAI(streamConfig.ai);
    if (ai) engine.useAI(ai);
  }

  // Wire outputs
  for (const out of streamConfig.outputs) {
    engine.addOutput(createOutput(out));
  }

  // Cache — use MemoryCache per run to avoid shared state issues
  engine.useCache(new MemoryCache());

  // Configure options
  const opts = streamConfig.options || {};
  engine.configure({
    language: streamConfig.ai?.language || opts.language || 'vi',
    style: streamConfig.ai?.style || opts.style || 'digest',
    ...(opts.concurrency && { concurrency: opts.concurrency }),
    ...(opts.maxArticlesPerSource && { maxArticlesPerSource: opts.maxArticlesPerSource }),
  });

  // Custom system prompt via middleware is not needed — AI plugins handle it
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

// ============================================
// Plugin registry (for frontend)
// ============================================

export function getAvailablePlugins() {
  return {
    sources: [
      { type: 'rss', name: 'RSS Feed', icon: '📡', fields: [
        { key: 'id', label: 'ID', type: 'text', required: true },
        { key: 'name', label: 'Name', type: 'text', required: true },
        { key: 'feedUrl', label: 'Feed URL', type: 'url', required: true },
        { key: 'icon', label: 'Icon', type: 'text', default: '📰' },
        { key: 'category', label: 'Category', type: 'text' },
      ]},
      { type: 'hackernews', name: 'Hacker News', icon: '🟠', fields: [
        { key: 'filter', label: 'Filter', type: 'select', options: ['front_page', 'show_hn', 'ask_hn'], default: 'front_page' },
        { key: 'query', label: 'Search Query', type: 'text' },
        { key: 'minPoints', label: 'Min Points', type: 'number', default: 50 },
      ]},
      { type: 'reddit', name: 'Reddit', icon: '🔴', fields: [
        { key: 'subreddit', label: 'Subreddit', type: 'text', required: true },
        { key: 'sort', label: 'Sort', type: 'select', options: ['hot', 'new', 'top', 'rising'], default: 'hot' },
        { key: 'minUpvotes', label: 'Min Upvotes', type: 'number', default: 100 },
      ]},
      { type: 'devto', name: 'Dev.to', icon: '🧑‍💻', fields: [
        { key: 'tag', label: 'Tag', type: 'text' },
        { key: 'minReactions', label: 'Min Reactions', type: 'number', default: 20 },
      ]},
      { type: 'html-scraper', name: 'HTML Scraper', icon: '🕷️', fields: [
        { key: 'id', label: 'ID', type: 'text', required: true },
        { key: 'name', label: 'Name', type: 'text', required: true },
        { key: 'url', label: 'URL', type: 'url', required: true },
        { key: 'icon', label: 'Icon', type: 'text', default: '🌐' },
        { key: 'category', label: 'Category', type: 'text' },
      ]},
    ],
    presets: [
      { id: 'bigTechBlogs', name: 'Big Tech Blogs', icon: '🏢', description: '15 RSS feeds: Uber, Meta, Netflix, AWS, Cloudflare, GitHub, etc.' },
      { id: 'communitySources', name: 'Community', icon: '👥', description: 'HN front page, r/programming, r/ExperiencedDevs, Dev.to' },
      { id: 'aiMLBlogs', name: 'AI/ML', icon: '🤖', description: 'OpenAI, DeepMind, Hugging Face, r/MachineLearning, HN AI' },
      { id: 'devopsSources', name: 'DevOps', icon: '🔧', description: 'Cloudflare, HashiCorp, r/devops, Dev.to devops' },
      { id: 'mobileSources', name: 'Mobile', icon: '📱', description: 'Android, Swift, r/androiddev, r/iOSProgramming' },
    ],
    ai: [
      { provider: 'claude', name: 'Claude (Anthropic)', fields: [
        { key: 'apiKey', label: 'API Key', type: 'password', required: true },
        { key: 'model', label: 'Model', type: 'text', default: 'claude-sonnet-4-20250514' },
      ]},
      { provider: 'openai', name: 'OpenAI', fields: [
        { key: 'apiKey', label: 'API Key', type: 'password', required: true },
        { key: 'model', label: 'Model', type: 'text', default: 'gpt-4o-mini' },
      ]},
      { provider: 'groq', name: 'Groq', fields: [
        { key: 'apiKey', label: 'API Key', type: 'password', required: true },
        { key: 'model', label: 'Model', type: 'text', default: 'llama-3.3-70b-versatile' },
      ]},
      { provider: 'gemini', name: 'Gemini (Google)', fields: [
        { key: 'apiKey', label: 'API Key', type: 'password', required: true },
        { key: 'model', label: 'Model', type: 'text', default: 'gemini-2.0-flash' },
      ]},
      { provider: 'deepseek', name: 'DeepSeek', fields: [
        { key: 'apiKey', label: 'API Key', type: 'password', required: true },
        { key: 'model', label: 'Model', type: 'text', default: 'deepseek-chat' },
      ]},
      { provider: 'qwen', name: 'Qwen (Alibaba)', fields: [
        { key: 'apiKey', label: 'API Key', type: 'password', required: true },
        { key: 'model', label: 'Model', type: 'text', default: 'qwen-plus' },
      ]},
      { provider: 'ollama', name: 'Ollama (Local)', fields: [
        { key: 'model', label: 'Model', type: 'text', default: 'llama3.2' },
        { key: 'baseUrl', label: 'Base URL', type: 'url', default: 'http://localhost:11434/v1' },
      ]},
      { provider: 'openrouter', name: 'OpenRouter', fields: [
        { key: 'apiKey', label: 'API Key', type: 'password', required: true },
        { key: 'model', label: 'Model', type: 'text', default: 'anthropic/claude-3.5-sonnet' },
      ]},
      { provider: 'together', name: 'Together AI', fields: [
        { key: 'apiKey', label: 'API Key', type: 'password', required: true },
        { key: 'model', label: 'Model', type: 'text', default: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' },
      ]},
      { provider: 'none', name: 'No AI (raw list)', fields: [] },
    ],
    languages: [
      { value: 'vi', label: 'Vietnamese' },
      { value: 'en', label: 'English' },
    ],
    styles: [
      { value: 'digest', label: 'Daily Digest' },
      { value: 'bullet', label: 'Bullet Points' },
      { value: 'thread', label: 'Social Thread' },
      { value: 'newsletter', label: 'Newsletter' },
    ],
    outputs: [
      { type: 'telegram', name: 'Telegram', icon: '✈️', fields: [
        { key: 'botToken', label: 'Bot Token', type: 'password', required: true },
        { key: 'chatId', label: 'Chat ID', type: 'text', required: true },
      ]},
      { type: 'slack', name: 'Slack', icon: '💬', fields: [
        { key: 'webhookUrl', label: 'Webhook URL', type: 'url', required: true },
        { key: 'channel', label: 'Channel', type: 'text' },
        { key: 'username', label: 'Bot Username', type: 'text' },
      ]},
      { type: 'discord', name: 'Discord', icon: '🎮', fields: [
        { key: 'webhookUrl', label: 'Webhook URL', type: 'url', required: true },
        { key: 'username', label: 'Bot Username', type: 'text' },
      ]},
      { type: 'email', name: 'Email', icon: '📧', fields: [
        { key: 'provider', label: 'Provider', type: 'select', options: ['resend', 'sendgrid'], required: true },
        { key: 'apiKey', label: 'API Key', type: 'password', required: true },
        { key: 'from', label: 'From', type: 'email', required: true },
        { key: 'to', label: 'To', type: 'text', required: true },
        { key: 'subject', label: 'Subject', type: 'text' },
      ]},
      { type: 'webhook', name: 'Webhook', icon: '🔗', fields: [
        { key: 'id', label: 'ID', type: 'text', required: true },
        { key: 'name', label: 'Name', type: 'text', required: true },
        { key: 'url', label: 'URL', type: 'url', required: true },
      ]},
      { type: 'markdown', name: 'Markdown File', icon: '📝', fields: [
        { key: 'outputDir', label: 'Output Directory', type: 'text', default: './digests' },
      ]},
    ],
  };
}
