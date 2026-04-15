/**
 * AI Plugin: Anthropic Claude
 */

import { AIPlugin } from '../core/contracts.js';
import { buildPrompt } from './_prompts.js';

export class ClaudeAI extends AIPlugin {
  /**
   * @param {Object} config
   * @param {string} config.apiKey
   * @param {string} [config.model='claude-sonnet-4-20250514']
   * @param {string} [config.baseUrl='https://api.anthropic.com']
   */
  constructor(config) {
    super();
    this._config = {
      model: 'claude-sonnet-4-20250514',
      baseUrl: 'https://api.anthropic.com',
      ...config,
    };
  }

  get id() { return 'claude'; }
  get name() { return `Claude (${this._config.model})`; }

  async summarize(articles, options = {}) {
    const { language = 'vi', style = 'digest', audience, systemPrompt, maxTokens = 4096 } = options;
    const prompt = buildPrompt(articles, { language, style, audience });

    const response = await fetch(`${this._config.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this._config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this._config.model,
        max_tokens: maxTokens,
        system: systemPrompt || prompt.system,
        messages: [{ role: 'user', content: prompt.user }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Claude API ${response.status}: ${err}`);
    }

    const data = await response.json();
    return {
      text: data.content.filter(b => b.type === 'text').map(b => b.text).join('\n'),
      model: this._config.model,
      usage: {
        input: data.usage?.input_tokens,
        output: data.usage?.output_tokens,
      },
    };
  }
}
