/**
 * Stream builder — single-page form to create/edit a stream config
 */

import { html, api, navigate, toast } from '../app.js';
import { useState } from 'https://esm.sh/preact@10.25.4/hooks';

const SOURCE_TYPES = [
  { type: 'rss', label: 'RSS Feed', fields: [{ key: 'url', placeholder: 'https://blog.example.com/feed' }] },
  { type: 'hackernews', label: 'Hacker News', fields: [{ key: 'minPoints', placeholder: '100', type: 'number' }] },
  { type: 'reddit', label: 'Reddit', fields: [{ key: 'subreddit', placeholder: 'programming' }] },
  { type: 'devto', label: 'Dev.to', fields: [] },
  { type: 'github-trending', label: 'GitHub Trending', fields: [] },
];

const OUTPUT_TYPES = [
  { type: 'telegram', label: 'Telegram', fields: [{ key: 'botToken', placeholder: 'Bot token' }, { key: 'chatId', placeholder: 'Chat ID' }] },
  { type: 'discord', label: 'Discord', fields: [{ key: 'webhookUrl', placeholder: 'Webhook URL' }] },
  { type: 'slack', label: 'Slack', fields: [{ key: 'webhookUrl', placeholder: 'Webhook URL' }] },
  { type: 'webhook', label: 'Webhook', fields: [{ key: 'url', placeholder: 'https://...' }] },
];

const SCHEDULES = [
  { label: 'Daily 7 AM UTC', value: '0 7 * * *' },
  { label: 'Twice daily', value: '0 7,19 * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
];

export default function StreamBuilder() {
  const [name, setName] = useState('');
  const [sources, setSources] = useState([{ type: 'hackernews', minPoints: 100, limit: 5 }]);
  const [ai, setAI] = useState({ provider: 'groq', model: 'llama-3.3-70b-versatile', language: 'en', style: 'digest' });
  const [outputs, setOutputs] = useState([{ type: 'telegram', botToken: '', chatId: '' }]);
  const [schedule, setSchedule] = useState('0 7 * * *');
  const [saving, setSaving] = useState(false);

  function addSource() {
    setSources([...sources, { type: 'rss', url: '', limit: 3 }]);
  }

  function removeSource(i) {
    setSources(sources.filter((_, idx) => idx !== i));
  }

  function updateSource(i, field, value) {
    const updated = [...sources];
    updated[i] = { ...updated[i], [field]: value };
    setSources(updated);
  }

  function addOutput() {
    setOutputs([...outputs, { type: 'telegram', botToken: '', chatId: '' }]);
  }

  function removeOutput(i) {
    setOutputs(outputs.filter((_, idx) => idx !== i));
  }

  function updateOutput(i, field, value) {
    const updated = [...outputs];
    updated[i] = { ...updated[i], [field]: value };
    setOutputs(updated);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const config = { sources, ai, outputs, schedule, maxArticles: 15, concurrency: 5 };
      await api('/streams', { method: 'POST', body: { name, config } });
      toast('Stream created!', 'success');
      navigate('/');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = 'width:100%;padding:6px 10px;border:1px solid var(--border);border-radius:4px;background:var(--bg-card);margin-top:4px';
  const sectionStyle = 'margin-bottom:24px;padding:16px;border:1px solid var(--border);border-radius:8px';

  return html`
    <div class="container" style="max-width:640px;margin:0 auto;padding:24px">
      <h2 style="margin-bottom:20px">New Stream</h2>
      <form onSubmit=${handleSubmit}>
        <!-- Name -->
        <div style="margin-bottom:16px">
          <label style="font-weight:600">Stream Name</label>
          <input value=${name} onInput=${(e) => setName(e.target.value)} required placeholder="My Tech Digest" style=${inputStyle} />
        </div>

        <!-- Sources -->
        <div style=${sectionStyle}>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <strong>Sources</strong>
            <button type="button" onClick=${addSource} style="font-size:12px;padding:4px 10px;border:1px solid var(--border);border-radius:4px;background:transparent;cursor:pointer">+ Add</button>
          </div>
          ${sources.map((src, i) => html`
            <div key=${i} style="margin-bottom:10px;padding:10px;background:var(--bg-card);border-radius:6px;position:relative">
              <select value=${src.type} onChange=${(e) => updateSource(i, 'type', e.target.value)} style="padding:4px 8px;border:1px solid var(--border);border-radius:4px">
                ${SOURCE_TYPES.map(t => html`<option value=${t.type}>${t.label}</option>`)}
              </select>
              ${sources.length > 1 && html`<button type="button" onClick=${() => removeSource(i)} style="position:absolute;top:8px;right:8px;border:none;background:none;color:var(--danger,#dc3545);cursor:pointer;font-size:14px">x</button>`}
              ${SOURCE_TYPES.find(t => t.type === src.type)?.fields.map(f => html`
                <input key=${f.key} placeholder=${f.placeholder} type=${f.type || 'text'}
                  value=${src[f.key] || ''} onInput=${(e) => updateSource(i, f.key, e.target.value)}
                  style="margin-top:6px;${inputStyle}" />
              `)}
            </div>
          `)}
        </div>

        <!-- AI -->
        <div style=${sectionStyle}>
          <strong>AI Provider</strong>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
            <select value=${ai.provider} onChange=${(e) => setAI({ ...ai, provider: e.target.value })} style="padding:6px;border:1px solid var(--border);border-radius:4px">
              <option value="groq">Groq (Free)</option>
              <option value="openai">OpenAI</option>
              <option value="claude">Claude</option>
              <option value="gemini">Gemini</option>
            </select>
            <select value=${ai.language} onChange=${(e) => setAI({ ...ai, language: e.target.value })} style="padding:6px;border:1px solid var(--border);border-radius:4px">
              <option value="en">English</option>
              <option value="vi">Vietnamese</option>
            </select>
            <select value=${ai.style} onChange=${(e) => setAI({ ...ai, style: e.target.value })} style="padding:6px;border:1px solid var(--border);border-radius:4px">
              <option value="digest">Digest</option>
              <option value="bullet">Bullet Points</option>
              <option value="thread">Thread</option>
              <option value="newsletter">Newsletter</option>
            </select>
          </div>
        </div>

        <!-- Outputs -->
        <div style=${sectionStyle}>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <strong>Outputs</strong>
            <button type="button" onClick=${addOutput} style="font-size:12px;padding:4px 10px;border:1px solid var(--border);border-radius:4px;background:transparent;cursor:pointer">+ Add</button>
          </div>
          ${outputs.map((out, i) => html`
            <div key=${i} style="margin-bottom:10px;padding:10px;background:var(--bg-card);border-radius:6px;position:relative">
              <select value=${out.type} onChange=${(e) => updateOutput(i, 'type', e.target.value)} style="padding:4px 8px;border:1px solid var(--border);border-radius:4px">
                ${OUTPUT_TYPES.map(t => html`<option value=${t.type}>${t.label}</option>`)}
              </select>
              ${outputs.length > 1 && html`<button type="button" onClick=${() => removeOutput(i)} style="position:absolute;top:8px;right:8px;border:none;background:none;color:var(--danger,#dc3545);cursor:pointer;font-size:14px">x</button>`}
              ${OUTPUT_TYPES.find(t => t.type === out.type)?.fields.map(f => html`
                <input key=${f.key} placeholder=${f.placeholder}
                  value=${out[f.key] || ''} onInput=${(e) => updateOutput(i, f.key, e.target.value)}
                  style="margin-top:6px;${inputStyle}" />
              `)}
            </div>
          `)}
        </div>

        <!-- Schedule -->
        <div style=${sectionStyle}>
          <strong>Schedule</strong>
          <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
            ${SCHEDULES.map(s => html`
              <button type="button" onClick=${() => setSchedule(s.value)}
                style="padding:6px 12px;border:1px solid ${schedule === s.value ? 'var(--primary)' : 'var(--border)'};border-radius:4px;background:${schedule === s.value ? 'var(--primary)' : 'transparent'};color:${schedule === s.value ? '#fff' : 'inherit'};cursor:pointer;font-size:13px">
                ${s.label}
              </button>
            `)}
          </div>
          <input value=${schedule} onInput=${(e) => setSchedule(e.target.value)} placeholder="0 7 * * *" style="margin-top:8px;${inputStyle}" />
        </div>

        <!-- Submit -->
        <button type="submit" disabled=${saving}
          style="width:100%;padding:12px;border:none;border-radius:6px;background:var(--primary);color:#fff;cursor:pointer;font-weight:600;font-size:15px">
          ${saving ? 'Creating...' : 'Create Stream'}
        </button>
      </form>
    </div>
  `;
}
