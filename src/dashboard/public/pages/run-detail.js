/**
 * Run Detail Page — Full content, stats, output results
 */

import { useState, useEffect } from 'https://esm.sh/preact@10.25.4/hooks';
import { html, api, navigate, toast } from '../app.js';

function StatusBadge({ status }) {
  const map = {
    success: 'badge-success', error: 'badge-error', skipped: 'badge-warning',
    preview: 'badge-info', running: 'badge-running', dry_run: 'badge-info',
  };
  return html`<span class="badge ${map[status] || 'badge-dim'}">${status}</span>`;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr + 'Z').toLocaleString();
}

export default function RunDetailPage({ id }) {
  const [run, setRun] = useState(null);
  const [stream, setStream] = useState(null);

  useEffect(() => {
    api(`/runs/${id}`).then(r => {
      setRun(r);
      if (r.stream_id) api(`/streams/${r.stream_id}`).then(setStream).catch(() => {});
    }).catch(err => toast(err.message, 'error'));
  }, [id]);

  if (!run) return html`<div class="container" style="text-align:center;padding:48px"><div class="spinner"></div></div>`;

  const stats = run.stats || {};
  const aiUsage = run.ai_usage;
  const outputs = run.output_results || [];

  return html`
    <div class="container">
      <div class="breadcrumb">
        <a href="#/">Streams</a>
        ${stream ? html` / <a href="#/streams/${stream.id}">${stream.name}</a>` : null}
        ${' '} / Run #${run.id}
      </div>

      <div class="page-header">
        <div style="display:flex;align-items:center;gap:12px">
          <h1 class="page-title">Run #${run.id}</h1>
          <${StatusBadge} status=${run.status} />
          <span class="meta-tag">${run.trigger_type}</span>
        </div>
      </div>

      <!-- Stats -->
      <div class="stats-row">
        <div class="stat-box">
          <div class="stat-value">${stats.sources ?? '-'}</div>
          <div class="stat-label">Sources</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${stats.articles ?? '-'}</div>
          <div class="stat-label">Articles</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${stats.outputs ?? '-'}</div>
          <div class="stat-label">Outputs</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${stats.durationMs ? `${(stats.durationMs / 1000).toFixed(1)}s` : '-'}</div>
          <div class="stat-label">Duration</div>
        </div>
        ${stats.ai ? html`
          <div class="stat-box">
            <div class="stat-value" style="font-size:16px">${stats.ai}</div>
            <div class="stat-label">AI Model</div>
          </div>
        ` : null}
      </div>

      <!-- Timing -->
      <div class="card" style="margin-bottom:16px">
        <div style="display:flex;gap:24px;font-size:13px">
          <div><span style="color:var(--text-dim)">Started:</span> ${formatDate(run.started_at)}</div>
          <div><span style="color:var(--text-dim)">Finished:</span> ${formatDate(run.finished_at)}</div>
        </div>
      </div>

      <!-- AI Usage -->
      ${aiUsage ? html`
        <div class="card" style="margin-bottom:16px">
          <div class="section-title">AI Usage</div>
          <div style="display:flex;gap:24px;font-size:13px">
            <div><span style="color:var(--text-dim)">Input tokens:</span> ${aiUsage.input ?? '-'}</div>
            <div><span style="color:var(--text-dim)">Output tokens:</span> ${aiUsage.output ?? '-'}</div>
          </div>
        </div>
      ` : null}

      <!-- Output Results -->
      ${outputs.length > 0 ? html`
        <div class="card" style="margin-bottom:16px">
          <div class="section-title">Output Results</div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>Output</th><th>Status</th><th>Message ID</th><th>Error</th></tr>
              </thead>
              <tbody>
                ${outputs.map((o, i) => html`
                  <tr key=${i}>
                    <td>${o.name || o.id}</td>
                    <td>
                      <span class="badge ${o.success ? 'badge-success' : 'badge-error'}">
                        ${o.success ? 'OK' : 'Failed'}
                      </span>
                    </td>
                    <td style="font-size:12px">${o.messageId || '-'}</td>
                    <td style="font-size:12px;color:var(--red)">${o.error || '-'}</td>
                  </tr>
                `)}
              </tbody>
            </table>
          </div>
        </div>
      ` : null}

      <!-- Error -->
      ${run.error ? html`
        <div class="card" style="margin-bottom:16px;border-color:var(--red)">
          <div class="section-title" style="color:var(--red)">Error</div>
          <pre class="content-preview" style="color:var(--red)">${run.error}</pre>
        </div>
      ` : null}

      <!-- Content -->
      ${run.content ? html`
        <div class="card">
          <div class="section-title">Generated Content</div>
          <div class="content-preview">${run.content}</div>
        </div>
      ` : null}
    </div>
  `;
}
