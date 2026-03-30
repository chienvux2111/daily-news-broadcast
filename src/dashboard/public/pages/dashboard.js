/**
 * Dashboard Page — Stream overview grid
 */

import { useState, useEffect, useCallback } from 'https://esm.sh/preact@10.25.4/hooks';
import { html, api, navigate, useSSE, toast } from '../app.js';

function StatusBadge({ status, running }) {
  if (running) return html`<span class="badge badge-running"><span class="spinner"></span> Running</span>`;
  if (!status) return html`<span class="badge badge-dim">No runs</span>`;
  const map = {
    success: 'badge-success',
    error: 'badge-error',
    skipped: 'badge-warning',
    preview: 'badge-info',
    running: 'badge-running',
  };
  return html`<span class="badge ${map[status] || 'badge-dim'}">${status}</span>`;
}

function timeAgo(dateStr) {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr + 'Z').getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function StreamCard({ stream, onToggle, onRun }) {
  const sourceCount = stream.sources.reduce((n, s) => n + (s.type === 'preset' ? 1 : 1), 0);
  const lastStatus = stream.last_run?.status;
  const lastRunTime = stream.last_run?.started_at;

  return html`
    <div class="stream-card ${!stream.enabled ? 'disabled' : ''}" onClick=${() => navigate(`/streams/${stream.id}`)}>
      <div class="stream-card-header">
        <div class="stream-name">${stream.name}</div>
        <${StatusBadge} status=${lastStatus} running=${stream.is_running} />
      </div>

      <div class="stream-meta">
        <span class="meta-tag">🕐 ${stream.cron}</span>
        <span class="meta-tag">📡 ${sourceCount} source${sourceCount !== 1 ? 's' : ''}</span>
        ${stream.ai ? html`<span class="meta-tag">🤖 ${stream.ai.provider}</span>` : null}
        <span class="meta-tag">📤 ${stream.outputs.length} output${stream.outputs.length !== 1 ? 's' : ''}</span>
      </div>

      <div class="stream-card-footer">
        <span style="font-size:12px;color:var(--text-dim)">
          ${lastRunTime ? `Last: ${timeAgo(lastRunTime)}` : 'No runs yet'}
        </span>
        <div class="stream-actions" onClick=${(e) => e.stopPropagation()}>
          <label class="toggle">
            <input type="checkbox" checked=${stream.enabled} onChange=${() => onToggle(stream.id)} />
            <span class="toggle-slider"></span>
          </label>
          <button class="btn btn-sm btn-primary" onClick=${() => onRun(stream.id)} disabled=${stream.is_running}>
            Run
          </button>
        </div>
      </div>
    </div>
  `;
}

export default function DashboardPage() {
  const [streams, setStreams] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await api('/streams');
      setStreams(data);
    } catch (err) {
      toast(err.message, 'error');
    }
  }, []);

  useEffect(() => { load(); }, []);

  useSSE((event) => {
    if (event.type?.startsWith('stream:') || event.type?.startsWith('run:')) {
      load();
    }
  });

  const handleToggle = async (id) => {
    try {
      await api(`/streams/${id}/toggle`, { method: 'POST' });
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const handleRun = async (id) => {
    try {
      toast('Stream triggered...', 'info');
      await api(`/streams/${id}/run`, { method: 'POST' });
      load();
      toast('Run completed!', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  if (!streams) return html`<div class="container" style="text-align:center;padding:48px"><div class="spinner"></div></div>`;

  const enabled = streams.filter(s => s.enabled);
  const total = streams.length;

  return html`
    <div class="container">
      <div class="page-header">
        <div>
          <h1 class="page-title">Streams</h1>
          <p style="color:var(--text-dim);font-size:13px;margin-top:4px">
            ${total} stream${total !== 1 ? 's' : ''} · ${enabled.length} active
          </p>
        </div>
        <button class="btn btn-primary" onClick=${() => navigate('/streams/new')}>
          + New Stream
        </button>
      </div>

      ${streams.length === 0 ? html`
        <div class="empty-state">
          <div class="empty-state-icon">📡</div>
          <div class="empty-state-text">No streams yet</div>
          <button class="btn btn-primary" onClick=${() => navigate('/streams/new')}>
            Create your first stream
          </button>
        </div>
      ` : html`
        <div class="streams-grid">
          ${streams.map(s => html`
            <${StreamCard}
              key=${s.id}
              stream=${s}
              onToggle=${handleToggle}
              onRun=${handleRun}
            />
          `)}
        </div>
      `}
    </div>
  `;
}
