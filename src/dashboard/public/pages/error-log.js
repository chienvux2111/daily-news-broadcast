/**
 * Error log page — shows failed runs with error details
 */

import { html, api, toast } from '../app.js';
import { useState, useEffect } from 'https://esm.sh/preact@10.25.4/hooks';

function formatTime(ts) {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleString();
}

export default function ErrorLog() {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const data = await api('/runs?status=failed');
      setRuns(data);
    } catch (err) { toast(err.message, 'error'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  if (loading) return html`<div class="container" style="text-align:center;padding:48px"><div class="spinner"></div></div>`;

  return html`
    <div class="container">
      <h2 style="margin-bottom:16px">Error Log</h2>
      ${runs.length === 0 && html`
        <div style="text-align:center;padding:40px;color:var(--text-dim)">No failed runs</div>
      `}
      <div style="display:grid;gap:8px">
        ${runs.map(r => html`
          <div key=${r.id} style="padding:14px 16px;border:1px solid #f5c6cb;border-radius:6px;background:#fff5f5">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <strong style="font-size:14px">${r.stream_name || r.stream_id}</strong>
              <span style="font-size:12px;color:var(--text-dim)">${formatTime(r.ran_at)}</span>
            </div>
            <div style="margin-top:6px;font-size:13px;color:#721c24;font-family:monospace;word-break:break-all">
              ${r.error || 'Unknown error'}
            </div>
          </div>
        `)}
      </div>
    </div>
  `;
}
