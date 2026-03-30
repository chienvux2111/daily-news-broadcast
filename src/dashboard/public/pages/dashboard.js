/**
 * Dashboard Page — Stream overview grid (read-only monitor)
 */

import { useState, useEffect, useCallback } from 'https://esm.sh/preact@10.25.4/hooks';
import { html, api, navigate, useSSE, toast } from '../app.js';

function StatusBadge({ status, running }) {
  if (running) return html`<span class="badge badge-running"><span class="spinner"></span> Running</span>`;
  if (!status) return html`<span class="badge badge-dim">No runs</span>`;
  const map = {
    success: 'badge-success', error: 'badge-error', skipped: 'badge-warning',
    preview: 'badge-info', running: 'badge-running',
  };
  return html`<span class="badge ${map[status] || 'badge-dim'}">${status}</span>`;
}

function timeAgo(dateStr) {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function sourceLabel(src) {
  if (src.type === 'preset') return src.preset;
  if (src.type === 'reddit') return `r/${src.config?.subreddit || 'reddit'}`;
  if (src.config?.name) return src.config.name;
  return src.type;
}

function StreamCard({ stream, onRun }) {
  const srcCount = stream.sources.length;
  const outCount = stream.outputs.length;
  const lastStatus = stream.last_run?.status;
  const lastTime = stream.last_run?.started_at;

  return html`
    <div class="stream-card ${!stream.enabled ? 'disabled' : ''}"
      onClick=${() => navigate(`/streams/${stream.id}`)}>
      <div class="stream-card-header">
        <div class="stream-name">${stream.name}</div>
        <${StatusBadge} status=${lastStatus} running=${stream.is_running} />
      </div>

      <div class="stream-meta">
        <span class="meta-tag">🕐 ${stream.cron} (${stream.timezone})</span>
        <span class="meta-tag">📡 ${srcCount} source${srcCount !== 1 ? 's' : ''}</span>
        ${stream.ai ? html`<span class="meta-tag">🤖 ${stream.ai.provider}</span>` : null}
        <span class="meta-tag">📤 ${outCount} output${outCount !== 1 ? 's' : ''}</span>
      </div>

      <div style="margin-bottom:10px">
        <div class="plugin-list">
          ${stream.sources.slice(0, 4).map((s, i) => html`
            <span key=${i} class="plugin-tag" style="font-size:11px">${sourceLabel(s)}</span>
          `)}
          ${stream.sources.length > 4 ? html`<span class="plugin-tag" style="font-size:11px">+${stream.sources.length - 4} more</span>` : null}
        </div>
      </div>

      <div class="stream-card-footer">
        <span style="font-size:12px;color:var(--text-dim)">
          ${stream.enabled
            ? (lastTime ? `Last: ${timeAgo(lastTime)}` : 'Waiting for first run')
            : 'Disabled'}
        </span>
        <div class="stream-actions" onClick=${(e) => e.stopPropagation()}>
          ${!stream.enabled ? html`<span class="badge badge-dim">Paused</span>` : html`
            <button class="btn btn-sm btn-primary" onClick=${() => onRun(stream.id)} disabled=${stream.is_running}>
              ${stream.is_running ? html`<span class="spinner"></span>` : 'Run'}
            </button>
          `}
        </div>
      </div>
    </div>
  `;
}

export default function DashboardPage() {
  const [streams, setStreams] = useState(null);

  const load = useCallback(async () => {
    try { setStreams(await api('/streams')); }
    catch (err) { toast(err.message, 'error'); }
  }, []);

  useEffect(() => { load(); }, []);
  useSSE((event) => {
    if (event.type?.startsWith('run:')) load();
  });

  const handleRun = async (id) => {
    try {
      toast('Triggered...', 'info');
      await api(`/streams/${id}/run`, { method: 'POST' });
      load();
      toast('Done!', 'success');
    } catch (err) { toast(err.message, 'error'); }
  };

  if (!streams) return html`<div class="container" style="text-align:center;padding:48px"><div class="spinner"></div></div>`;

  const enabled = streams.filter(s => s.enabled).length;

  return html`
    <div class="container">
      <div class="page-header">
        <div>
          <h1 class="page-title">Streams</h1>
          <p style="color:var(--text-dim);font-size:13px;margin-top:4px">
            ${streams.length} stream${streams.length !== 1 ? 's' : ''} · ${enabled} active
          </p>
        </div>
      </div>

      ${streams.length === 0 ? html`
        <div class="empty-state">
          <div class="empty-state-icon">📡</div>
          <div class="empty-state-text">No streams configured</div>
          <p style="color:var(--text-dim);font-size:13px">
            Edit <code>streams.config.json</code> to add streams, then restart the server.
          </p>
        </div>
      ` : html`
        <div class="streams-grid">
          ${streams.map(s => html`<${StreamCard} key=${s.id} stream=${s} onRun=${handleRun} />`)}
        </div>
      `}
    </div>
  `;
}
