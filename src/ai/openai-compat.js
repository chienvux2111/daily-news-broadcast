/**
 * AI Plugin: OpenAI-compatible API
 * Works with: OpenAI, Groq, OpenRouter, Together, Ollama, LM Studio, vLLM, etc.
 */

import { AIPlugin } from '../core/contracts.js';
import { buildPrompt } from './_prompts.js';

export class OpenAICompatibleAI extends AIPlugin {
  /**
   * @param {Object} config
   * @param {string} [config.apiKey]
   * @param {string} [config.model='gpt-4o-mini']
   * @param {string} [config.baseUrl='https://api.openai.com/v1']
   * @param {string} [config.name]          - Custom display name
   * @param {Object} [config.extraHeaders]  - Additional headers
   * @param {Object} [config.extraBody]     - Additional body params
   */
  constructor(config = {}) {
    super();
    this._config = {
      model: 'gpt-4o-mini',
      baseUrl: 'https://api.openai.com/v1',
      ...config,
    };
  }

  get id() { return 'openai-compatible'; }
  get name() { return this._config.name || `OpenAI (${this._config.model})`; }

  async summarize(articles, options = {}) {
    const { language = 'vi', style = 'digest', systemPrompt, maxTokens = 4096 } = options;
    const prompt = buildPrompt(articles, { language, style });

    const headers = {
      'Content-Type': 'application/json',
      ...this._config.extraHeaders,
    };
    if (this._config.apiKey) {
      headers['Authorization'] = `Bearer ${this._config.apiKey}`;
    }

    const response = await fetch(`${this._config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this._config.model,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: systemPrompt || prompt.system },
          { role: 'user', content: prompt.user },
        ],
        ...this._config.extraBody,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`API ${response.status}: ${err}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0]?.message?.content || '';

    return {
      text: choice,
      model: data.model || this._config.model,
      usage: data.usage ? {
        input: data.usage.prompt_tokens,
        output: data.usage.completion_tokens,
      } : undefined,
    };
  }
}

// ============================================
// Pre-configured factory helpers
// ============================================

/** OpenAI GPT */
export function openai(apiKey, model = 'gpt-4o-mini') {
  return new OpenAICompatibleAI({ apiKey, model, name: `OpenAI (${model})` });
}

/** Groq (ultra fast inference) */
export function groq(apiKey, model = 'llama-3.3-70b-versatile') {
  return new OpenAICompatibleAI({
    apiKey, model,
    baseUrl: 'https://api.groq.com/openai/v1',
    name: `Groq (${model})`,
  });
}

/** OpenRouter (model marketplace) */
export function openRouter(apiKey, model = 'anthropic/claude-3.5-sonnet') {
  return new OpenAICompatibleAI({
    apiKey, model,
    baseUrl: 'https://openrouter.ai/api/v1',
    name: `OpenRouter (${model})`,
  });
}

/** Together AI */
export function togetherAI(apiKey, model = 'meta-llama/Llama-3.3-70B-Instruct-Turbo') {
  return new OpenAICompatibleAI({
    apiKey, model,
    baseUrl: 'https://api.together.xyz/v1',
    name: `Together (${model})`,
  });
}

/** Ollama (local) */
export function ollama(model = 'llama3.2', baseUrl = 'http://localhost:11434/v1') {
  return new OpenAICompatibleAI({
    model, baseUrl,
    name: `Ollama (${model})`,
  });
}

/** Google Gemini via OpenAI-compatible endpoint */
export function gemini(apiKey, model = 'gemini-2.0-flash') {
  return new OpenAICompatibleAI({
    apiKey, model,
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    name: `Gemini (${model})`,
  });
}

/** Alibaba Qwen via DashScope OpenAI-compatible endpoint */
export function qwen(apiKey, model = 'qwen-plus') {
  return new OpenAICompatibleAI({
    apiKey, model,
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    name: `Qwen (${model})`,
  });
}

/** DeepSeek */
export function deepseek(apiKey, model = 'deepseek-chat') {
  return new OpenAICompatibleAI({
    apiKey, model,
    baseUrl: 'https://api.deepseek.com/v1',
    name: `DeepSeek (${model})`,
  });
}
