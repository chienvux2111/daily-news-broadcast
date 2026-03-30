/**
 * Stream Detail Page — Config summary + run history
 */

import { useState, useEffect, useCallback } from 'https://esm.sh/preact@10.25.4/hooks';
import { html, api, navigate, useSSE, toast } from '../app.js';

function timeAgo(dateStr) {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr + 'Z').getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr + 'Z').toLocaleString();
}

function StatusBadge({ status }) {
  const map = {
    success: 'badge-success', error: 'badge-error', skipped: 'badge-warning',
    preview: 'badge-info', running: 'badge-running', dry_run: 'badge-info',
  };
  return html`<span class="badge ${map[status] || 'badge-dim'}">${status}</span>`;
}

export default function StreamDetailPage({ id }) {
  const [stream, setStream] = useState(null);
  const [runs, setRuns] = useState(null);
  const [runningAction, setRunningAction] = useState(null);

  const loadStream = useCallback(async () => {
    try {
      const data = await api(`/streams/${id}`);
      setStream(data);
    } catch (err) {
      toast(err.message, 'error');
    }
  }, [id]);

  const loadRuns = useCallback(async () => {
    try {
      const data = await api(`/streams/${id}/runs?limit=50`);
      setRuns(data);
    } catch (err) {
      toast(err.message, 'error');
    }
  }, [id]);

  useEffect(() => {
    loadStream();
    loadRuns();
  }, [id]);

  useSSE((event) => {
    if (event.data?.streamId === id || event.type?.startsWith('stream:')) {
      loadStream();
      loadRuns();
    }
  });

  const handleRun = async () => {
    setRunningAction('run');
    try {
      await api(`/streams/${id}/run`, { method: 'POST' });
      toast('Run completed!', 'success');
      loadRuns();
      loadStream();
    } catch (err) { toast(err.message, 'error'); }
    finally { setRunningAction(null); }
  };

  const handlePreview = async () => {
    setRunningAction('preview');
    try {
      const result = await api(`/streams/${id}/preview`, { method: 'POST' });
      toast('Preview done!', 'success');
      loadRuns();
      if (result.id) navigate(`/runs/${result.id}`);
    } catch (err) { toast(err.message, 'error'); }
    finally { setRunningAction(null); }
  };

  const handleToggle = async () => {
    try {
      await api(`/streams/${id}/toggle`, { method: 'POST' });
      loadStream();
    } catch (err) { toast(err.message, 'error'); }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this stream and all its run history?')) return;
    try {
      await api(`/streams/${id}`, { method: 'DELETE' });
      toast('Stream deleted', 'success');
      navigate('/');
    } catch (err) { toast(err.message, 'error'); }
  };

  if (!stream) return html`<div class="container" style="text-align:center;padding:48px"><div class="spinner"></div></div>`;

  return html`
    <div class="container">
      <div class="breadcrumb">
        <a href="#/">Streams</a> / ${stream.name}
      </div>

      <!-- Header -->
      <div class="page-header">
        <div>
          <h1 class="page-title" style="display:flex;align-items:center;gap:10px">
            ${stream.name}
            <span class="badge ${stream.enabled ? 'badge-success' : 'badge-dim'}">
              ${stream.enabled ? 'Active' : 'Paused'}
            </span>
          </h1>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn" onClick=${handleToggle}>
            ${stream.enabled ? 'Pause' : 'Enable'}
          </button>
          <button class="btn" onClick=${handlePreview} disabled=${!!runningAction}>
            ${runningAction === 'preview' ? html`<span class="spinner"></span>` : 'Preview'}
          </button>
          <button class="btn btn-primary" onClick=${handleRun} disabled=${!!runningAction}>
            ${runningAction === 'run' ? html`<span class="spinner"></span>` : 'Run Now'}
          </button>
          <button class="btn" onClick=${() => navigate(`/streams/${id}/edit`)}>Edit</button>
          <button class="btn btn-danger" onClick=${handleDelete}>Delete</button>
        </div>
      </div>

      <!-- Config Summary -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
        <div class="card">
          <div class="section-title">Schedule</div>
          <div style="font-size:20px;font-weight:600;margin-bottom:4px">🕐 ${stream.cron}</div>
          <div style="font-size:13px;color:var(--text-dim)">Timezone: ${stream.timezone}</div>
        </div>

        <div class="card">
          <div class="section-title">AI Persona</div>
          ${stream.ai ? html`
            <div style="font-size:16px;font-weight:600;margin-bottom:4px">
              🤖 ${stream.ai.provider} ${stream.ai.model ? `(${stream.ai.model})` : ''}
            </div>
            <div style="font-size:13px;color:var(--text-dim)">
              ${stream.ai.language || 'vi'} · ${stream.ai.style || 'digest'}
            </div>
          ` : html`<div style="color:var(--text-dim)">No AI (raw mode)</div>`}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
        <div class="card">
          <div class="section-title">Sources (${stream.sources.length})</div>
          <div class="plugin-list">
            ${stream.sources.map((s, i) => html`
              <span key=${i} class="plugin-tag">
                ${s.type === 'preset' ? `📦 ${s.preset}` : `📡 ${s.type}${s.config?.name ? `: ${s.config.name}` : s.config?.subreddit ? `: r/${s.config.subreddit}` : ''}`}
              </span>
            `)}
          </div>
        </div>

        <div class="card">
          <div class="section-title">Outputs (${stream.outputs.length})</div>
          <div class="plugin-list">
            ${stream.outputs.map((o, i) => html`
              <span key=${i} class="plugin-tag">
                📤 ${o.type}${o.config?.chatId ? `: ${o.config.chatId}` : o.config?.webhookUrl ? ' (webhook)' : ''}
              </span>
            `)}
          </div>
        </div>
      </div>

      <!-- Run History -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">Run History</span>
          <span style="font-size:12px;color:var(--text-dim)">${runs?.total || 0} total</span>
        </div>

        ${!runs ? html`<div style="text-align:center;padding:24px"><div class="spinner"></div></div>` :
          runs.runs.length === 0 ? html`
            <div class="empty-state" style="padding:24px">
              <div style="font-size:14px">No runs yet. Click "Run Now" or "Preview" to test.</div>
            </div>
          ` : html`
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Trigger</th>
                    <th>Articles</th>
                    <th>Duration</th>
                    <th>Started</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${runs.runs.map(r => html`
                    <tr key=${r.id} style="cursor:pointer" onClick=${() => navigate(`/runs/${r.id}`)}>
                      <td><${StatusBadge} status=${r.status} /></td>
                      <td><span class="meta-tag">${r.trigger_type}</span></td>
                      <td>${r.stats?.articles ?? '-'}</td>
                      <td>${r.stats?.durationMs ? `${(r.stats.durationMs / 1000).toFixed(1)}s` : '-'}</td>
                      <td style="font-size:12px">${formatDate(r.started_at)}</td>
                      <td><span style="color:var(--text-dim);font-size:12px">View →</span></td>
                    </tr>
                  `)}
                </tbody>
              </table>
            </div>
          `
        }
      </div>
    </div>
  `;
}
