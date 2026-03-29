/**
 * Source Plugin: Hacker News
 * Uses official HN Algolia API (no auth needed)
 */

import { SourcePlugin } from '../core/contracts.js';

export class HackerNewsSource extends SourcePlugin {
  /**
   * @param {Object} [config]
   * @param {string} [config.query]      - Search query (e.g. 'rust', 'kubernetes')
   * @param {string} [config.filter]     - 'front_page' | 'show_hn' | 'ask_hn' | null
   * @param {number} [config.minPoints=50] - Minimum points threshold
   */
  constructor(config = {}) {
    super();
    this._config = { minPoints: 50, ...config };
  }

  get id() { return `hackernews${this._config.query ? `:${this._config.query}` : ''}`; }
  get name() { return 'Hacker News'; }
  get icon() { return '🟠'; }

  async fetch(options = {}) {
    const { limit = 10, since } = options;
    const { query, filter, minPoints } = this._config;

    let url;
    if (query) {
      url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=${limit * 2}`;
    } else if (filter === 'front_page') {
      url = `https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=${limit * 2}`;
    } else {
      url = `https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=${limit * 2}`;
    }

    // Add date filter
    if (since) {
      const timestamp = Math.floor(since.getTime() / 1000);
      url += `&numericFilters=created_at_i>${timestamp}`;
    }

    const response = await fetch(url);
    if (!response.ok) return [];

    const data = await response.json();
    return (data.hits || [])
      .filter(hit => (hit.points || 0) >= minPoints)
      .slice(0, limit)
      .map(hit => ({
        id: `hn:${hit.objectID}`,
        title: hit.title || '',
        url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
        content: `${hit.points} points, ${hit.num_comments} comments`,
        source: this.name,
        category: 'Community',
        publishedAt: hit.created_at ? new Date(hit.created_at) : null,
        meta: {
          icon: this.icon,
          points: hit.points,
          comments: hit.num_comments,
          hnUrl: `https://news.ycombinator.com/item?id=${hit.objectID}`,
        },
      }));
  }
}
