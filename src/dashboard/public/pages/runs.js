/**
 * Run history page — table of recent runs across all streams
 */

import { html, api, toast } from '../app.js';
import { useState, useEffect } from 'https://esm.sh/preact@10.25.4/hooks';

function formatTime(ts) {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleString();
}

function StatusBadge({ status }) {
  const colors = { success: '#28a745', failed: '#dc3545', pending: '#ffc107' };
  const bg = { success: '#d4edda', failed: '#f8d7da', pending: '#fff3cd' };
  return html`
    <span style="font-size:12px;padding:2px 8px;border-radius:10px;background:${bg[status] || '#eee'};color:${colors[status] || '#666'}">
      ${status}
    </span>
  `;
}

export default function Runs() {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  async function load() {
    try {
      const query = filter ? `/runs?status=${filter}` : '/runs';
      const data = await api(query);
      setRuns(data);
    } catch (err) { toast(err.message, 'error'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [filter]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [filter]);

  if (loading) return html`<div class="container" style="text-align:center;padding:48px"><div class="spinner"></div></div>`;

  return html`
    <div class="container">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h2>Run History</h2>
        <div style="display:flex;gap:6px">
          ${['', 'success', 'failed'].map(f => html`
            <button onClick=${() => setFilter(f)}
              style="font-size:12px;padding:4px 10px;border:1px solid ${filter === f ? 'var(--primary)' : 'var(--border)'};border-radius:4px;background:${filter === f ? 'var(--primary)' : 'transparent'};color:${filter === f ? '#fff' : 'inherit'};cursor:pointer">
              ${f || 'All'}
            </button>
          `)}
        </div>
      </div>

      ${runs.length === 0 && html`
        <div style="text-align:center;padding:40px;color:var(--text-dim)">No runs yet</div>
      `}

      <div style="display:grid;gap:8px">
        ${runs.map(r => html`
          <div key=${r.id} style="padding:12px 16px;border:1px solid var(--border);border-radius:6px;display:flex;justify-content:space-between;align-items:center">
            <div>
              <strong style="font-size:14px">${r.stream_name || r.stream_id}</strong>
              <div style="font-size:12px;color:var(--text-dim);margin-top:2px">
                ${formatTime(r.ran_at)} · ${r.articles_count} articles
              </div>
              ${r.error && html`<div style="font-size:12px;color:#dc3545;margin-top:4px">${r.error}</div>`}
            </div>
            <${StatusBadge} status=${r.status} />
          </div>
        `)}
      </div>
    </div>
  `;
}
