/**
 * Onboarding wizard — guided 5-step stream creation for new users
 */

import { html, api, navigate, toast } from '../app.js';
import { useState } from 'https://esm.sh/preact@10.25.4/hooks';

const SOURCES = [
  { type: 'hackernews', label: 'Hacker News', desc: 'Top stories by points', icon: '🟧' },
  { type: 'reddit', label: 'Reddit', desc: 'Subreddit posts', icon: '🔴', field: 'subreddit', placeholder: 'programming' },
  { type: 'devto', label: 'Dev.to', desc: 'Developer articles', icon: '🖤' },
  { type: 'github-trending', label: 'GitHub Trending', desc: 'Popular repositories', icon: '🐙' },
  { type: 'rss', label: 'RSS Feed', desc: 'Any blog or site', icon: '📰', field: 'url', placeholder: 'https://blog.example.com/feed' },
];

const SCHEDULES = [
  { label: 'Daily at 7 AM', cron: '0 7 * * *' },
  { label: 'Twice daily', cron: '0 7,19 * * *' },
  { label: 'Every 6 hours', cron: '0 */6 * * *' },
];

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState({});
  const [sourceFields, setSourceFields] = useState({});
  const [ai, setAI] = useState({ provider: 'groq', language: 'en', style: 'digest' });
  const [output, setOutput] = useState({ type: 'telegram', botToken: '', chatId: '' });
  const [schedule, setSchedule] = useState('0 7 * * *');
  const [name, setName] = useState('My Tech Digest');
  const [saving, setSaving] = useState(false);

  function toggleSource(type) {
    setSelected(prev => ({ ...prev, [type]: !prev[type] }));
  }

  function updateField(type, value) {
    setSourceFields(prev => ({ ...prev, [type]: value }));
  }

  function buildSources() {
    return SOURCES.filter(s => selected[s.type]).map(s => {
      const base = { type: s.type, limit: 5 };
      if (s.type === 'rss') base.url = sourceFields.rss || '';
      if (s.type === 'reddit') base.subreddit = sourceFields.reddit || 'programming';
      if (s.type === 'hackernews') base.minPoints = 100;
      return base;
    });
  }

  async function handleCreate() {
    setSaving(true);
    try {
      const config = {
        sources: buildSources(),
        ai: { ...ai, model: ai.provider === 'groq' ? 'llama-3.3-70b-versatile' : undefined },
        outputs: [output],
        schedule,
        maxArticles: 15,
        concurrency: 5,
      };
      await api('/streams', { method: 'POST', body: { name, config } });
      toast('Stream created! It will run on schedule.', 'success');
      navigate('/');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const selectedCount = Object.values(selected).filter(Boolean).length;
  const canNext = [
    selectedCount > 0 && selectedCount <= 2,
    true,
    output.botToken && output.chatId,
    true,
    true,
  ];

  const inputStyle = 'width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;background:var(--bg-card);margin-top:6px';

  const steps = [
    // Step 0: Sources
    html`
      <h3>Choose your sources</h3>
      <p style="color:var(--text-dim);margin-bottom:16px;font-size:14px">Pick up to 2 sources (free tier)</p>
      <div style="display:grid;gap:10px">
        ${SOURCES.map(s => html`
          <div key=${s.type} onClick=${() => toggleSource(s.type)}
            style="padding:14px;border:2px solid ${selected[s.type] ? 'var(--primary)' : 'var(--border)'};border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:12px">
            <span style="font-size:1.5rem">${s.icon}</span>
            <div style="flex:1">
              <strong>${s.label}</strong>
              <div style="font-size:13px;color:var(--text-dim)">${s.desc}</div>
            </div>
            ${selected[s.type] && html`<span style="color:var(--primary);font-weight:700">✓</span>`}
          </div>
          ${selected[s.type] && s.field && html`
            <input placeholder=${s.placeholder} value=${sourceFields[s.type] || ''}
              onInput=${(e) => updateField(s.type, e.target.value)}
              onClick=${(e) => e.stopPropagation()} style=${inputStyle} />
          `}
        `)}
      </div>
    `,
    // Step 1: AI
    html`
      <h3>AI Settings</h3>
      <p style="color:var(--text-dim);margin-bottom:16px;font-size:14px">Groq is free and fast. Upgrade later for more providers.</p>
      <label style="display:block;margin-bottom:12px">
        <span style="font-size:13px">Language</span>
        <select value=${ai.language} onChange=${(e) => setAI({ ...ai, language: e.target.value })} style=${inputStyle}>
          <option value="en">English</option>
          <option value="vi">Vietnamese</option>
        </select>
      </label>
      <label style="display:block">
        <span style="font-size:13px">Style</span>
        <select value=${ai.style} onChange=${(e) => setAI({ ...ai, style: e.target.value })} style=${inputStyle}>
          <option value="digest">Digest</option>
          <option value="bullet">Bullet Points</option>
          <option value="newsletter">Newsletter</option>
        </select>
      </label>
    `,
    // Step 2: Output
    html`
      <h3>Connect Telegram</h3>
      <p style="color:var(--text-dim);margin-bottom:16px;font-size:14px">Your digest will be sent here daily.</p>
      <label style="display:block;margin-bottom:12px">
        <span style="font-size:13px">Bot Token</span>
        <input value=${output.botToken} onInput=${(e) => setOutput({ ...output, botToken: e.target.value })}
          placeholder="123456:ABC-DEF..." style=${inputStyle} />
        <div style="font-size:11px;color:var(--text-dim);margin-top:4px">Get from @BotFather on Telegram</div>
      </label>
      <label style="display:block">
        <span style="font-size:13px">Chat ID</span>
        <input value=${output.chatId} onInput=${(e) => setOutput({ ...output, chatId: e.target.value })}
          placeholder="-100123456789" style=${inputStyle} />
        <div style="font-size:11px;color:var(--text-dim);margin-top:4px">Channel or group ID</div>
      </label>
    `,
    // Step 3: Schedule
    html`
      <h3>Set Schedule</h3>
      <p style="color:var(--text-dim);margin-bottom:16px;font-size:14px">When should your digest be delivered? (UTC)</p>
      <div style="display:grid;gap:10px">
        ${SCHEDULES.map(s => html`
          <div key=${s.cron} onClick=${() => setSchedule(s.cron)}
            style="padding:14px;border:2px solid ${schedule === s.cron ? 'var(--primary)' : 'var(--border)'};border-radius:8px;cursor:pointer;text-align:center;font-weight:${schedule === s.cron ? '600' : '400'}">
            ${s.label}
          </div>
        `)}
      </div>
    `,
    // Step 4: Review
    html`
      <h3>Review & Activate</h3>
      <label style="display:block;margin-bottom:16px">
        <span style="font-size:13px">Stream Name</span>
        <input value=${name} onInput=${(e) => setName(e.target.value)} style=${inputStyle} />
      </label>
      <div style="padding:16px;background:var(--bg-card);border-radius:8px;font-size:14px">
        <div><strong>Sources:</strong> ${buildSources().map(s => s.type).join(', ') || 'None'}</div>
        <div><strong>AI:</strong> Groq (${ai.language}, ${ai.style})</div>
        <div><strong>Output:</strong> Telegram</div>
        <div><strong>Schedule:</strong> ${schedule}</div>
      </div>
    `,
  ];

  return html`
    <div class="container" style="max-width:480px;margin:40px auto;padding:24px">
      <div style="text-align:center;margin-bottom:24px">
        <span style="font-size:13px;color:var(--text-dim)">Step ${step + 1} of ${steps.length}</span>
        <div style="height:4px;background:var(--border);border-radius:2px;margin-top:8px">
          <div style="height:100%;width:${((step + 1) / steps.length) * 100}%;background:var(--primary);border-radius:2px;transition:width .3s"></div>
        </div>
      </div>

      ${steps[step]}

      <div style="display:flex;justify-content:space-between;margin-top:24px">
        ${step > 0
          ? html`<button onClick=${() => setStep(step - 1)} style="padding:10px 20px;border:1px solid var(--border);border-radius:6px;background:transparent;cursor:pointer">Back</button>`
          : html`<a href="#/" style="padding:10px 20px;font-size:13px;color:var(--text-dim)">Skip setup</a>`
        }
        ${step < steps.length - 1
          ? html`<button onClick=${() => setStep(step + 1)} disabled=${!canNext[step]}
              style="padding:10px 20px;border:none;border-radius:6px;background:var(--primary);color:#fff;cursor:pointer;font-weight:600;opacity:${canNext[step] ? 1 : 0.5}">
              Next
            </button>`
          : html`<button onClick=${handleCreate} disabled=${saving}
              style="padding:10px 20px;border:none;border-radius:6px;background:var(--primary);color:#fff;cursor:pointer;font-weight:600">
              ${saving ? 'Creating...' : 'Activate Stream'}
            </button>`
        }
      </div>
    </div>
  `;
}
