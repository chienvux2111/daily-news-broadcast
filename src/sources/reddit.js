/**
 * Source Plugin: Reddit
 * Uses public JSON API (no auth needed for read-only)
 */

import { SourcePlugin } from '../core/contracts.js';

export class RedditSource extends SourcePlugin {
  /**
   * @param {Object} config
   * @param {string}   config.subreddit    - e.g. 'programming', 'devops'
   * @param {string}   [config.sort='hot'] - 'hot' | 'new' | 'top' | 'rising'
   * @param {number}   [config.minUpvotes=100]
   */
  constructor(config) {
    super();
    this._config = { sort: 'hot', minUpvotes: 100, ...config };
  }

  get id() { return `reddit:${this._config.subreddit}`; }
  get name() { return `r/${this._config.subreddit}`; }
  get icon() { return '🔴'; }

  async fetch(options = {}) {
    const { limit = 10, since } = options;
    const { subreddit, sort, minUpvotes } = this._config;
    const url = `https://www.reddit.com/r/${subreddit}/${sort}.json?limit=${limit * 3}&raw_json=1`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'NewsEngine/2.0' },
    });
    if (!response.ok) return [];

    const data = await response.json();
    return (data?.data?.children || [])
      .map(c => c.data)
      .filter(post => !post.stickied && post.ups >= minUpvotes)
      .filter(post => {
        if (!since) return true;
        return new Date(post.created_utc * 1000) > since;
      })
      .slice(0, limit)
      .map(post => ({
        id: `reddit:${post.id}`,
        title: post.title,
        url: post.url?.startsWith('https://www.reddit.com') ? `https://www.reddit.com${post.permalink}` : post.url,
        content: (post.selftext || '').substring(0, 500) || `${post.ups} upvotes, ${post.num_comments} comments`,
        source: this.name,
        category: 'Community',
        publishedAt: new Date(post.created_utc * 1000),
        meta: {
          icon: this.icon,
          upvotes: post.ups,
          comments: post.num_comments,
          redditUrl: `https://www.reddit.com${post.permalink}`,
        },
      }));
  }
}
