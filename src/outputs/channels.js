/**
 * Output Plugin: Slack (Incoming Webhook)
 */

import { OutputPlugin } from '../core/contracts.js';

export class SlackOutput extends OutputPlugin {
  /**
   * @param {Object} config
   * @param {string} config.webhookUrl - Slack Incoming Webhook URL
   * @param {string} [config.channel]  - Override channel
   * @param {string} [config.username='Tech News Bot']
   * @param {string} [config.iconEmoji=':newspaper:']
   */
  constructor(config) {
    super();
    this._config = {
      username: 'Tech News Bot',
      iconEmoji: ':newspaper:',
      ...config,
    };
  }

  get id() { return 'slack'; }
  get name() { return 'Slack'; }
  get maxLength() { return 40000; } // Slack block text limit

  async send(content) {
    const body = {
      text: content,
      username: this._config.username,
      icon_emoji: this._config.iconEmoji,
    };
    if (this._config.channel) body.channel = this._config.channel;

    const res = await fetch(this._config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    return { success: res.ok, error: res.ok ? undefined : await res.text() };
  }
}

/**
 * Output Plugin: Discord (Webhook)
 */

export class DiscordOutput extends OutputPlugin {
  /**
   * @param {Object} config
   * @param {string} config.webhookUrl - Discord Webhook URL
   * @param {string} [config.username='Tech News Bot']
   */
  constructor(config) {
    super();
    this._config = { username: 'Tech News Bot', ...config };
  }

  get id() { return 'discord'; }
  get name() { return 'Discord'; }
  get maxLength() { return 2000; }

  async send(content) {
    // Discord max 2000 chars per message — split if needed
    const parts = splitByLength(content, 2000);
    let firstId = null;

    for (let i = 0; i < parts.length; i++) {
      const res = await fetch(this._config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: parts[i],
          username: this._config.username,
        }),
      });
      if (!res.ok) return { success: false, error: await res.text() };
      if (i === 0) {
        try { const data = await res.json(); firstId = data.id; } catch {}
      }
      if (i < parts.length - 1) await new Promise(r => setTimeout(r, 500));
    }

    return { success: true, messageId: firstId, meta: { parts: parts.length } };
  }
}

/**
 * Output Plugin: Generic Webhook
 * Gửi POST request đến bất kỳ URL nào
 */

export class WebhookOutput extends OutputPlugin {
  /**
   * @param {Object} config
   * @param {string} config.id       - Unique ID
   * @param {string} config.name     - Display name
   * @param {string} config.url      - Webhook URL
   * @param {Object} [config.headers]
   * @param {Function} [config.formatBody] - (content, articles) => body object
   */
  constructor(config) {
    super();
    this._config = config;
  }

  get id() { return this._config.id; }
  get name() { return this._config.name; }

  async send(content) {
    const body = this._config.formatBody
      ? this._config.formatBody(content)
      : { text: content, timestamp: new Date().toISOString() };

    const res = await fetch(this._config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this._config.headers,
      },
      body: JSON.stringify(body),
    });

    return { success: res.ok, error: res.ok ? undefined : await res.text() };
  }
}

/**
 * Output Plugin: Email (via Resend / SendGrid / generic SMTP API)
 */

export class EmailOutput extends OutputPlugin {
  /**
   * @param {Object} config
   * @param {string} config.provider     - 'resend' | 'sendgrid'
   * @param {string} config.apiKey
   * @param {string} config.from         - Sender email
   * @param {string|string[]} config.to  - Recipient(s)
   * @param {string} [config.subject='🔥 Daily Tech Digest']
   */
  constructor(config) {
    super();
    this._config = { subject: '🔥 Daily Tech Digest', ...config };
  }

  get id() { return 'email'; }
  get name() { return `Email (${this._config.provider})`; }

  async send(content) {
    const to = Array.isArray(this._config.to) ? this._config.to : [this._config.to];
    const htmlContent = markdownToBasicHTML(content);

    if (this._config.provider === 'resend') {
      return this._sendResend(to, htmlContent);
    } else if (this._config.provider === 'sendgrid') {
      return this._sendSendGrid(to, htmlContent);
    }
    return { success: false, error: `Unknown provider: ${this._config.provider}` };
  }

  async _sendResend(to, html) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this._config.apiKey}`,
      },
      body: JSON.stringify({
        from: this._config.from,
        to,
        subject: this._config.subject,
        html,
      }),
    });
    const data = await res.json();
    return { success: res.ok, messageId: data.id, error: data.message };
  }

  async _sendSendGrid(to, html) {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this._config.apiKey}`,
      },
      body: JSON.stringify({
        personalizations: [{ to: to.map(email => ({ email })) }],
        from: { email: this._config.from },
        subject: this._config.subject,
        content: [{ type: 'text/html', value: html }],
      }),
    });
    return { success: res.ok, error: res.ok ? undefined : await res.text() };
  }
}

// ============================================
// Output Plugin: Markdown File (for static sites, GitHub, etc.)
// ============================================

export class MarkdownFileOutput extends OutputPlugin {
  /**
   * @param {Object} config
   * @param {string} [config.outputDir='./output']
   * @param {string} [config.filenamePattern='digest-{date}.md']
   */
  constructor(config = {}) {
    super();
    this._config = {
      outputDir: './output',
      filenamePattern: 'digest-{date}.md',
      ...config,
    };
  }

  get id() { return 'markdown-file'; }
  get name() { return 'Markdown File'; }

  async send(content) {
    try {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');

      await fs.mkdir(this._config.outputDir, { recursive: true });
      const date = new Date().toISOString().split('T')[0];
      const filename = this._config.filenamePattern.replace('{date}', date);
      const filepath = path.join(this._config.outputDir, filename);
      await fs.writeFile(filepath, content, 'utf-8');

      return { success: true, meta: { path: filepath } };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}

// ============================================
// Helpers
// ============================================

function splitByLength(text, max) {
  if (text.length <= max) return [text];
  const parts = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= max) { parts.push(remaining); break; }
    const cut = remaining.lastIndexOf('\n', max) || max;
    parts.push(remaining.substring(0, cut));
    remaining = remaining.substring(cut).trimStart();
  }
  return parts;
}

function markdownToBasicHTML(md) {
  return md
    .replace(/\*([^*]+)\*/g, '<strong>$1</strong>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p>').replace(/$/, '</p>');
}
