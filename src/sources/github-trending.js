/**
 * Source Plugin: GitHub Trending Repos
 * Uses GitHub Search API (no auth required for public repos)
 * Finds recently active popular repos sorted by stars
 */

import { SourcePlugin } from '../core/contracts.js';
import { enrichMissingImages } from './og-image.js';

export class GitHubTrendingSource extends SourcePlugin {
  /**
   * @param {Object} [config]
   * @param {string} [config.language]       - Filter by programming language (e.g., 'javascript', 'rust')
   * @param {string} [config.since='daily']  - 'daily' | 'weekly'
   * @param {number} [config.minStars=50]    - Minimum star count
   * @param {string} [config.token]          - Optional GitHub token for higher rate limits
   */
  constructor(config = {}) {
    super();
    this._config = { since: 'daily', minStars: 50, ...config };
  }

  get id() { return `github-trending${this._config.language ? `:${this._config.language}` : ''}`; }
  get name() { return 'GitHub Trending'; }
  get icon() { return '⭐'; }

  async fetch(options = {}) {
    const { limit = 10 } = options;
    const { language, since, minStars, token } = this._config;

    // Use pushed:> to find recently active repos (closer to real "trending")
    const daysBack = since === 'weekly' ? 7 : 1;
    const dateFrom = new Date(Date.now() - daysBack * 86400000).toISOString().split('T')[0];

    let query = `pushed:>${dateFrom} stars:>=${minStars}`;
    if (language) query += ` language:${language}`;

    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${limit}`;

    const headers = {
      'User-Agent': 'NewsEngine/2.0',
      'Accept': 'application/vnd.github.v3+json',
    };
    if (token) headers['Authorization'] = `token ${token}`;

    let response;
    try {
      response = await fetch(url, { headers });
    } catch { return []; }
    if (!response.ok) return [];

    const data = await response.json();
    const articles = (data.items || []).slice(0, limit).map(repo => ({
      id: `github:${repo.full_name}`,
      title: `${repo.full_name} — ${repo.description || 'No description'}`,
      url: repo.html_url,
      content: [
        repo.description,
        `⭐ ${repo.stargazers_count} stars`,
        `Language: ${repo.language || 'N/A'}`,
        repo.topics?.length ? `Topics: ${repo.topics.slice(0, 5).join(', ')}` : '',
      ].filter(Boolean).join(' | '),
      source: this.name,
      category: 'Open Source',
      author: repo.owner?.login,
      publishedAt: new Date(repo.pushed_at),
      meta: {
        icon: this.icon,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        language: repo.language,
        topics: repo.topics,
      },
    }));

    await enrichMissingImages(articles);
    return articles;
  }
}
