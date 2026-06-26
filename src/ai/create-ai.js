/**
 * Shared AI factory — single source of truth for creating AI plugins
 * Used by both Node.js and Cloudflare adapters
 */

import { ClaudeAI } from './claude.js';
import {
  OpenAICompatibleAI, openai, groq, gemini, qwen,
  deepseek, ollama, openRouter, togetherAI,
} from './openai-compat.js';

function isPlaceholderApiKey(apiKey) {
  if (!apiKey) return false;
  const normalized = apiKey.trim().toLowerCase();
  return (
    normalized.endsWith('xxxxx') ||
    normalized.includes('your_') ||
    normalized.includes('example') ||
    normalized === 'changeme'
  );
}

function assertApiKey(provider, apiKey) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error(`Missing API key for provider "${provider}". Check your environment variables.`);
  }
  if (isPlaceholderApiKey(apiKey)) {
    throw new Error(`Provider "${provider}" is using a placeholder API key. Replace it in .env or export a real key in your shell.`);
  }
}

/**
 * Create AI plugin from provider config
 * Each adapter maps its own env format to this config shape
 *
 * @param {Object} config
 * @param {string} [config.provider='claude'] - Provider name
 * @param {string} [config.model]             - Model override
 * @param {string} [config.apiKey]            - API key for the chosen provider
 * @param {string} [config.baseUrl]           - Custom base URL (for 'custom' provider)
 * @param {string} [config.name]              - Custom display name (for 'custom' provider)
 * @returns {import('../core/contracts.js').AIPlugin|null}
 */
export function createAI(config) {
  const { provider = 'claude', model, apiKey, baseUrl, name } = config;

  switch (provider.toLowerCase()) {
    case 'none':
    case 'off':
    case 'skip':
      return null;

    case 'claude':
    case 'anthropic':
      assertApiKey(provider, apiKey);
      return new ClaudeAI({ apiKey, ...(model && { model }) });

    case 'openai':
      assertApiKey(provider, apiKey);
      return openai(apiKey, model || 'gpt-4o-mini');

    case 'groq':
      assertApiKey(provider, apiKey);
      return groq(apiKey, model || 'llama-3.3-70b-versatile');

    case 'gemini':
    case 'google':
      assertApiKey(provider, apiKey);
      return gemini(apiKey, model || 'gemini-2.0-flash');

    case 'qwen':
    case 'alibaba':
    case 'dashscope':
      assertApiKey(provider, apiKey);
      return qwen(apiKey, model || 'qwen-plus');

    case 'deepseek':
      assertApiKey(provider, apiKey);
      return deepseek(apiKey, model || 'deepseek-chat');

    case 'ollama':
      return ollama(model || 'llama3.2', baseUrl || 'http://localhost:11434/v1');

    case 'openrouter':
      assertApiKey(provider, apiKey);
      return openRouter(apiKey, model || 'anthropic/claude-3.5-sonnet');

    case 'together':
      assertApiKey(provider, apiKey);
      return togetherAI(apiKey, model || 'meta-llama/Llama-3.3-70B-Instruct-Turbo');

    case 'custom':
      assertApiKey(provider, apiKey);
      return new OpenAICompatibleAI({
        apiKey,
        baseUrl,
        model: model || 'default',
        name: name || 'Custom AI',
      });

    default:
      throw new Error(`Unknown AI provider: "${provider}"\nSupported: claude, openai, groq, gemini, qwen, deepseek, ollama, openrouter, together, custom`);
  }
}
