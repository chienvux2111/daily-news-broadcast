/**
 * Output Plugin: Facebook Page
 * Uses Graph API to post to a Facebook Page
 * System User token (never expires) stored as CF Secret
 */

import { OutputPlugin } from '../core/contracts.js';

const GRAPH_API = 'https://graph.facebook.com/v22.0';

export class FacebookOutput extends OutputPlugin {
  /**
   * @param {Object} config
   * @param {string} config.pageToken - Page Access Token (System User, never expires)
   * @param {string} config.pageId - Facebook Page ID
   */
  constructor(config) {
    super();
    this._pageToken = config.pageToken;
    this._pageId = config.pageId;
  }

  get id() { return 'facebook'; }
  get name() { return 'Facebook'; }
  get maxLength() { return 63206; }

  async send(content) {
    const url = extractUrl(content);
    const message = url ? stripUrl(content, url) : content;

    const params = new URLSearchParams({ message });
    if (url) params.set('link', url);

    const res = await fetch(`${GRAPH_API}/${this._pageId}/feed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${this._pageToken}`,
      },
      body: params.toString(),
    });

    const data = await res.json();

    if (!res.ok) {
      const errMsg = data.error?.message || JSON.stringify(data);
      throw new Error(`Facebook API error ${res.status}: ${errMsg}`);
    }

    return {
      success: true,
      messageId: data.id,
      meta: { hasLink: !!url },
    };
  }
}

/** Extract first https URL from content */
function extractUrl(content) {
  const match = content.match(/https?:\/\/[^\s)>\]]+/);
  return match ? match[0].replace(/[.,;:!?'"]+$/, '') : null;
}

/** Remove URL from content and clean whitespace */
function stripUrl(content, url) {
  return content.replace(url, '').replace(/\n{3,}/g, '\n\n').trim();
}
