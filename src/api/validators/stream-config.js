/**
 * Stream config validator — checks sources, AI, outputs, schedule
 */

const VALID_SOURCE_TYPES = ['rss', 'hackernews', 'reddit', 'devto', 'github-trending', 'html-scraper', 'json-api'];
const VALID_AI_PROVIDERS = ['groq', 'openai', 'claude', 'anthropic', 'gemini', 'google', 'deepseek', 'openrouter', 'together', 'ollama', 'custom'];
const VALID_OUTPUT_TYPES = ['telegram', 'discord', 'slack', 'email', 'webhook', 'markdown'];
const CRON_REGEX = /^(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)$/;
const MAX_CONFIG_SIZE = 10240; // 10KB

/**
 * Validate a stream config object
 * @param {Object} config
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateStreamConfig(config) {
  const errors = [];

  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Config must be an object'] };
  }

  // Size check
  const size = JSON.stringify(config).length;
  if (size > MAX_CONFIG_SIZE) {
    errors.push(`Config exceeds ${MAX_CONFIG_SIZE / 1024}KB limit`);
  }

  // Sources
  if (!Array.isArray(config.sources) || config.sources.length === 0) {
    errors.push('At least one source is required');
  } else {
    for (const src of config.sources) {
      if (!VALID_SOURCE_TYPES.includes(src.type)) {
        errors.push(`Invalid source type: "${src.type}"`);
      }
      if (src.type === 'rss' && (!src.url || !/^https?:\/\//.test(src.url))) {
        errors.push('RSS source requires a valid http(s) url');
      }
      if (src.type === 'reddit' && !src.subreddit) {
        errors.push('Reddit source requires a subreddit');
      }
    }
  }

  // AI
  if (!config.ai || typeof config.ai !== 'object') {
    errors.push('AI configuration is required');
  } else if (!VALID_AI_PROVIDERS.includes(config.ai.provider)) {
    errors.push(`Invalid AI provider: "${config.ai.provider}"`);
  }

  // Outputs
  if (!Array.isArray(config.outputs) || config.outputs.length === 0) {
    errors.push('At least one output is required');
  } else {
    for (const out of config.outputs) {
      if (!VALID_OUTPUT_TYPES.includes(out.type)) {
        errors.push(`Invalid output type: "${out.type}"`);
      }
      if (out.type === 'telegram' && (!out.botToken || !out.chatId)) {
        errors.push('Telegram output requires botToken and chatId');
      }
      if (out.type === 'discord' && (!out.webhookUrl || !/^https?:\/\//.test(out.webhookUrl))) {
        errors.push('Discord output requires a valid http(s) webhookUrl');
      }
      if (out.type === 'slack' && (!out.webhookUrl || !/^https?:\/\//.test(out.webhookUrl))) {
        errors.push('Slack output requires a valid http(s) webhookUrl');
      }
      if (out.type === 'webhook' && (!out.url || !/^https?:\/\//.test(out.url))) {
        errors.push('Webhook output requires a valid http(s) url');
      }
    }
  }

  // Schedule
  if (!config.schedule) {
    errors.push('Schedule (cron expression) is required');
  } else if (!CRON_REGEX.test(config.schedule.trim())) {
    errors.push('Invalid cron expression');
  }

  return { valid: errors.length === 0, errors };
}
