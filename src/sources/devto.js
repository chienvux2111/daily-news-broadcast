/**
 * Source Plugin: Dev.to
 * Uses public API (no auth needed)
 */

import { SourcePlugin } from '../core/contracts.js';

export class DevToSource extends SourcePlugin {
  /**
   * @param {Object} [config]
   * @param {string} [config.tag]          - Filter by tag (e.g. 'javascript', 'devops')
   * @param {number} [config.minReactions=20]
   */
  constructor(config = {}) {
    super();
    this._config = { minReactions: 20, ...config };
  }

  get id() { return `devto${this._config.tag ? `:${this._config.tag}` : ''}`; }
  get name() { return 'Dev.to'; }
  get icon() { return '🖤'; }

  async fetch(options = {}) {
    const { limit = 10 } = options;
    const { tag, minReactions } = this._config;

    let url = `https://dev.to/api/articles?per_page=${limit * 2}`;
    if (tag) url += `&tag=${encodeURIComponent(tag)}`;

    const response = await fetch(url);
    if (!response.ok) return [];

    const posts = await response.json();
    return posts
      .filter(p => p.public_reactions_count >= minReactions)
      .slice(0, limit)
      .map(p => ({
        id: `devto:${p.id}`,
        title: p.title,
        url: p.url,
        content: p.description || '',
        source: this.name,
        category: (p.tags || []).join(', ') || 'Dev Community',
        author: p.user?.name,
        publishedAt: p.published_at ? new Date(p.published_at) : null,
        meta: {
          icon: this.icon,
          reactions: p.public_reactions_count,
          comments: p.comments_count,
          readingTime: p.reading_time_minutes,
        },
      }));
  }
}

/**
 * Source Plugin: Generic JSON API
 * Cho bất kỳ API nào trả về JSON list
 */

export class JSONAPISource extends SourcePlugin {
  /**
   * @param {Object} config
   * @param {string} config.id
   * @param {string} config.name
   * @param {string} config.url             - API endpoint
   * @param {Object} [config.headers]       - Extra headers (auth, etc.)
   * @param {string} [config.icon]
   * @param {string} [config.category]
   * @param {Function} config.transform     - (apiResponse) => Article[]
   */
  constructor(config) {
    super();
    this._config = config;
  }

  get id() { return this._config.id; }
  get name() { return this._config.name; }
  get icon() { return this._config.icon || '🔌'; }

  async fetch(options = {}) {
    const { limit = 10 } = options;

    const response = await fetch(this._config.url, {
      headers: { 'User-Agent': 'NewsEngine/2.0', ...this._config.headers },
    });
    if (!response.ok) return [];

    const data = await response.json();
    return this._config.transform(data).slice(0, limit);
  }
}
