/**
 * Source Plugin: RSS / Atom Feed
 * Dùng cho bất kỳ blog nào có RSS feed
 */

import { SourcePlugin } from '../core/contracts.js';

export class RSSSource extends SourcePlugin {
  /**
   * @param {Object} config
   * @param {string} config.id       - Unique ID
   * @param {string} config.name     - Display name
   * @param {string} config.feedUrl  - RSS/Atom feed URL
   * @param {string} [config.icon]   - Emoji icon
   * @param {string} [config.category]
   * @param {string} [config.baseUrl] - Base URL để resolve relative links
   */
  constructor(config) {
    super();
    this._config = config;
  }

  get id() { return this._config.id; }
  get name() { return this._config.name; }
  get icon() { return this._config.icon || '📰'; }

  async fetch(options = {}) {
    const { limit = 5, since } = options;

    const response = await fetchWithTimeout(this._config.feedUrl, 15000);
    if (!response.ok) return [];

    const xml = await response.text();
    let articles = this._parseXML(xml);

    // Filter by date
    if (since) {
      articles = articles.filter(a => !a.publishedAt || a.publishedAt > since);
    }

    return articles.slice(0, limit);
  }

  _parseXML(xml) {
    // Try RSS 2.0
    const rssItems = extractBlocks(xml, 'item');
    if (rssItems.length > 0) {
      return rssItems.map(item => this._parseItem(item, 'rss'));
    }

    // Try Atom
    const atomEntries = extractBlocks(xml, 'entry');
    return atomEntries.map(item => this._parseItem(item, 'atom'));
  }

  _parseItem(xml, format) {
    const title = cleanHTML(extractTag(xml, 'title'));
    const url = format === 'atom'
      ? extractAttr(xml, 'link', 'href') || extractTag(xml, 'link')
      : extractTag(xml, 'link');
    const rawContent = extractTag(xml, 'description')
      || extractTag(xml, 'content:encoded')
      || extractTag(xml, 'summary')
      || extractTag(xml, 'content')
      || '';
    const dateStr = extractTag(xml, 'pubDate')
      || extractTag(xml, 'published')
      || extractTag(xml, 'updated')
      || extractTag(xml, 'dc:date');

    const resolvedUrl = resolveUrl(url, this._config.baseUrl || this._config.feedUrl);

    return {
      id: resolvedUrl || `${this.id}:${title}`,
      title,
      url: resolvedUrl,
      content: cleanHTML(rawContent).substring(0, 1000),
      source: this.name,
      category: this._config.category,
      publishedAt: dateStr ? new Date(dateStr) : null,
      meta: { icon: this.icon },
    };
  }
}

// ============================================
// Batch helper: tạo nhiều RSSSource từ config array
// ============================================

/**
 * @param {Array<{id, name, feedUrl, icon?, category?, baseUrl?}>} configs
 * @returns {RSSSource[]}
 */
export function createRSSSources(configs) {
  return configs.map(c => new RSSSource(c));
}

// ============================================
// XML parsing helpers (zero dependencies)
// ============================================

function extractBlocks(xml, tag) {
  const blocks = [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  let m;
  while ((m = re.exec(xml))) blocks.push(m[1]);
  return blocks;
}

function extractTag(xml, tag) {
  const cdataRe = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`, 'i');
  const cdataMatch = xml.match(cdataRe);
  if (cdataMatch) return cdataMatch[1].trim();

  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : '';
}

function extractAttr(xml, tag, attr) {
  const re = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, 'i');
  const m = xml.match(re);
  return m ? m[1] : '';
}

export function cleanHTML(html) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveUrl(url, base) {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  try { return new URL(url, base).href; } catch { return url; }
}

async function fetchWithTimeout(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'NewsEngine/2.0' },
    });
  } finally {
    clearTimeout(timer);
  }
}
