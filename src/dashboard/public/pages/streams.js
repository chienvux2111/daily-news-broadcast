/**
 * Stream list page — cards with toggle, edit, delete actions
 */

import { html, api, navigate, toast } from '../app.js';
import { useState, useEffect } from 'https://esm.sh/preact@10.25.4/hooks';

export default function Streams() {
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const data = await api('/streams');
      setStreams(data);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleToggle(id) {
    try {
      await api(`/streams/${id}/toggle`, { method: 'POST' });
      await load();
    } catch (err) { toast(err.message, 'error'); }
  }

  async function handleDelete(id, name) {
    if (!confirm(`Delete stream "${name}"?`)) return;
    try {
      await api(`/streams/${id}`, { method: 'DELETE' });
      toast('Stream deleted', 'success');
      await load();
    } catch (err) { toast(err.message, 'error'); }
  }

  if (loading) return html`<div class="container" style="text-align:center;padding:48px"><div class="spinner"></div></div>`;

  return html`
    <div class="container">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <h2>Streams</h2>
        <button onClick=${() => navigate('/stream-builder')}
          style="padding:8px 16px;border:none;border-radius:6px;background:var(--primary);color:#fff;cursor:pointer;font-weight:600">
          + New Stream
        </button>
      </div>

      ${streams.length === 0 && html`
        <div style="text-align:center;padding:60px 20px;color:var(--text-dim)">
          <p style="font-size:18px;margin-bottom:8px">No streams yet</p>
          <p>Create your first stream to start receiving curated news.</p>
        </div>
      `}

      <div style="display:grid;gap:12px">
        ${streams.map(s => html`
          <div key=${s.id} class="card" style="padding:16px;border:1px solid var(--border);border-radius:8px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div>
                <strong>${s.name}</strong>
                <span style="margin-left:8px;font-size:12px;padding:2px 8px;border-radius:10px;background:${s.active ? 'var(--success-bg,#d4edda)' : 'var(--dim-bg,#eee)'}">
                  ${s.active ? 'Active' : 'Paused'}
                </span>
              </div>
              <div style="display:flex;gap:8px">
                <button onClick=${() => handleToggle(s.id)}
                  style="font-size:12px;padding:4px 10px;border:1px solid var(--border);border-radius:4px;background:transparent;cursor:pointer">
                  ${s.active ? 'Pause' : 'Resume'}
                </button>
                <button onClick=${() => navigate(`/streams/${s.id}`)}
                  style="font-size:12px;padding:4px 10px;border:1px solid var(--border);border-radius:4px;background:transparent;cursor:pointer">
                  Edit
                </button>
                <button onClick=${() => handleDelete(s.id, s.name)}
                  style="font-size:12px;padding:4px 10px;border:1px solid var(--border);border-radius:4px;background:transparent;color:var(--danger,#dc3545);cursor:pointer">
                  Delete
                </button>
              </div>
            </div>
            <div style="margin-top:8px;font-size:13px;color:var(--text-dim)">
              ${s.config?.sources?.length || 0} sources
              · ${s.config?.outputs?.map(o => o.type).join(', ') || 'none'}
              · ${s.config?.schedule || 'no schedule'}
            </div>
          </div>
        `)}
      </div>
    </div>
  `;
}
