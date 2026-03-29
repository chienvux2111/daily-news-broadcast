/**
 * Output Plugin: Telegram
 */

import { OutputPlugin } from '../core/contracts.js';

export class TelegramOutput extends OutputPlugin {
  /**
   * @param {Object} config
   * @param {string} config.botToken
   * @param {string} config.chatId
   * @param {boolean} [config.disablePreview=true]
   * @param {boolean} [config.silent=false]
   */
  constructor(config) {
    super();
    this._config = { disablePreview: true, silent: false, ...config };
  }

  get id() { return 'telegram'; }
  get name() { return 'Telegram'; }
  get maxLength() { return 4096; }

  async send(content) {
    const messages = splitSmart(content, this.maxLength);
    const results = [];

    for (let i = 0; i < messages.length; i++) {
      const result = await this._sendOne(
        i > 0 ? `(${i + 1}/${messages.length})\n\n${messages[i]}` : messages[i],
        i > 0, // silent for parts after first
      );
      results.push(result);
      if (i < messages.length - 1) await sleep(500);
    }

    const allOk = results.every(r => r.success);
    return {
      success: allOk,
      messageId: results[0]?.messageId,
      meta: { parts: results.length },
    };
  }

  async _sendOne(text, forceQuiet = false) {
    const url = `https://api.telegram.org/bot${this._config.botToken}/sendMessage`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this._config.chatId,
          text,
          parse_mode: 'Markdown',
          disable_web_page_preview: this._config.disablePreview,
          disable_notification: forceQuiet || this._config.silent,
        }),
      });

      const data = await res.json();
      if (!data.ok) {
        // Markdown parse error → retry as plain text
        if (data.description?.includes('parse') || data.description?.includes('entities')) {
          return this._sendPlain(text, forceQuiet);
        }
        return { success: false, error: data.description };
      }
      return { success: true, messageId: data.result.message_id };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async _sendPlain(text, forceQuiet) {
    const url = `https://api.telegram.org/bot${this._config.botToken}/sendMessage`;
    const plain = text.replace(/\*([^*]+)\*/g, '$1').replace(/_([^_]+)_/g, '$1').replace(/`([^`]+)`/g, '$1');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: this._config.chatId,
        text: plain,
        disable_web_page_preview: this._config.disablePreview,
        disable_notification: forceQuiet || this._config.silent,
      }),
    });
    const data = await res.json();
    return data.ok
      ? { success: true, messageId: data.result.message_id }
      : { success: false, error: data.description };
  }
}

function splitSmart(text, max) {
  if (text.length <= max) return [text];
  const parts = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= max) { parts.push(remaining); break; }
    let cut = max;
    const sep = remaining.lastIndexOf('━━━', max);
    if (sep > max * 0.5) cut = sep;
    else { const nl = remaining.lastIndexOf('\n\n', max); if (nl > max * 0.5) cut = nl; }
    parts.push(remaining.substring(0, cut));
    remaining = remaining.substring(cut).trimStart();
  }
  return parts;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
