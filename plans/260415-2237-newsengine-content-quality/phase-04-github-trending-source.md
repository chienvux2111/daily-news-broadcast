---
phase: 4
priority: medium
status: pending
effort: S
blockedBy: []
---

# Phase 4: GitHub Trending Source Plugin

## Overview
New source plugin that fetches trending repositories from GitHub. Independent of other phases — can be implemented in parallel.

## Problem
Dev community highly values trending repos. Currently no way to surface them in digests. GitHub Trending is a daily goldmine that many devs check manually.

## Solution
Create `src/sources/github-trending.js` using GitHub's unofficial trending page (HTML scraping) or the GitHub API search endpoint sorted by stars within a time window.

### Approach: GitHub Search API (no auth needed for public repos)
More reliable than scraping. Query: repos created/updated recently, sorted by stars.

### Files
- **Create:** `src/sources/github-trending.js`
- **Modify:** `src/sources/index.js` — export
- **Modify:** `src/presets/index.js` — add to community/devops presets

## Implementation

```js
// src/sources/github-trending.js
import { SourcePlugin } from '../core/contracts.js';

export class GitHubTrendingSource extends SourcePlugin {
  /**
   * @param {Object} [config]
   * @param {string} [config.language]     - Filter by language (e.g., 'javascript', 'rust')
   * @param {string} [config.since='daily'] - 'daily' | 'weekly'
   * @param {number} [config.minStars=50]
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
    const { language, since, minStars } = this._config;

    // Calculate date range
    const daysBack = since === 'weekly' ? 7 : 1;
    const dateFrom = new Date(Date.now() - daysBack * 86400000).toISOString().split('T')[0];

    let query = `created:>${dateFrom} stars:>=${minStars}`;
    if (language) query += ` language:${language}`;

    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${limit}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'NewsEngine/2.0',
        'Accept': 'application/vnd.github.v3+json',
      },
    });
    if (!response.ok) return [];

    const data = await response.json();
    return (data.items || []).slice(0, limit).map(repo => ({
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
      publishedAt: new Date(repo.created_at),
      meta: {
        icon: this.icon,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        language: repo.language,
        topics: repo.topics,
      },
    }));
  }
}
```

### Preset Integration

```js
// In presets/index.js, add to communitySources():
import { GitHubTrendingSource } from '../sources/github-trending.js';

export function communitySources() {
  return [
    new HackerNewsSource({ filter: 'front_page', minPoints: 100 }),
    new RedditSource({ subreddit: 'programming', minUpvotes: 200 }),
    new RedditSource({ subreddit: 'ExperiencedDevs', minUpvotes: 100 }),
    new DevToSource({ minReactions: 50 }),
    new GitHubTrendingSource({ minStars: 100 }),  // NEW
  ];
}
```

### Rate Limiting Note
GitHub Search API: 10 requests/min unauthenticated, 30/min with token. For daily digest (1 call), this is fine. Add optional `token` config for higher limits:

```js
if (this._config.token) {
  headers['Authorization'] = `token ${this._config.token}`;
}
```

---

## Success Criteria
- [ ] `GitHubTrendingSource` fetches trending repos correctly
- [ ] Articles include stars, language, topics in meta
- [ ] Works without auth (public API)
- [ ] Optional auth token for higher rate limits
- [ ] Added to `communitySources()` preset
- [ ] Exported from `src/sources/index.js`

## Todo
- [ ] Create `src/sources/github-trending.js`
- [ ] Export from `src/sources/index.js`
- [ ] Add `GitHubTrendingSource` to `communitySources()` preset
- [ ] Test: `node src/adapters/node.js preview` with community sources
