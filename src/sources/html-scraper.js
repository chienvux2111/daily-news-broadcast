/**
 * Source Plugin: HTML Scraper
 * Cho các blog không có RSS feed (Discord, Figma, Stripe...)
 */

import { SourcePlugin } from '../core/contracts.js';
import { cleanHTML } from './rss.js';

export class HTMLScraperSource extends SourcePlugin {
  /**
   * @param {Object} config
   * @param {string} config.id
   * @param {string} config.name
   * @param {string} config.url         - Page URL to scrape
   * @param {string} [config.icon]
   * @param {string} [config.category]
   * @param {Object} [config.selectors] - Custom CSS-like regex patterns
   */
  constructor(config) {
    super();
    this._config = config;
  }

  get id() { return this._config.id; }
  get name() { return this._config.name; }
  get icon() { return this._config.icon || '🌐'; }

  async fetch(options = {}) {
    const { limit = 5 } = options;

    const response = await fetch(this._config.url, {
      headers: { 'User-Agent': 'NewsEngine/2.0', 'Accept': 'text/html' },
    });
    if (!response.ok) return [];

    const html = await response.text();
    return this._extractArticles(html).slice(0, limit);
  }

  _extractArticles(html) {
    const articles = [];
    const seen = new Set();

    // Strategy 1: <article> blocks
    const articleBlocks = html.match(/<article[^>]*>[\s\S]*?<\/article>/gi) || [];
    for (const block of articleBlocks) {
      const article = this._parseBlock(block);
      if (article && !seen.has(article.url)) {
        seen.add(article.url);
        articles.push(article);
      }
    }
    if (articles.length > 0) return articles;

    // Strategy 2: Link patterns for blog posts
    const linkRe = /<a[^>]*href="([^"]*(?:blog|post|article|engineering)[^"]*)"[^>]*>([^<]{10,})<\/a>/gi;
    let m;
    while ((m = linkRe.exec(html))) {
      const url = this._resolveUrl(m[1]);
      const title = cleanHTML(m[2]);
      if (!seen.has(url) && title.length > 10) {
        seen.add(url);
        articles.push({
          id: url,
          title,
          url,
          content: '',
          source: this.name,
          category: this._config.category,
          publishedAt: null,
          meta: { icon: this.icon },
        });
      }
    }

    return articles;
  }

  _parseBlock(block) {
    const linkMatch = block.match(/<a[^>]*href="([^"]*)"[^>]*>/);
    const titleMatch = block.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i)
      || block.match(/<a[^>]*>([^<]{10,})<\/a>/);
    const descMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const dateMatch = block.match(/<time[^>]*datetime="([^"]*)"/);

    if (!linkMatch || !titleMatch) return null;

    const url = this._resolveUrl(linkMatch[1]);
    return {
      id: url,
      title: cleanHTML(titleMatch[1]),
      url,
      content: descMatch ? cleanHTML(descMatch[1]).substring(0, 500) : '',
      source: this.name,
      category: this._config.category,
      publishedAt: dateMatch ? new Date(dateMatch[1]) : null,
      meta: { icon: this.icon },
    };
  }

  _resolveUrl(url) {
    if (url.startsWith('http')) return url;
    try { return new URL(url, this._config.url).href; } catch { return url; }
  }
}
