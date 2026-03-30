/**
 * Stream Form — Create or Edit a stream
 */

import { useState, useEffect } from 'https://esm.sh/preact@10.25.4/hooks';
import { html, api, navigate, toast } from '../app.js';

const CRON_PRESETS = [
  { label: 'Every day at 7:00 AM', value: '0 7 * * *' },
  { label: 'Every day at 9:00 AM', value: '0 9 * * *' },
  { label: 'Every day at 2:00 PM', value: '0 14 * * *' },
  { label: 'Every day at 6:00 PM', value: '0 18 * * *' },
  { label: 'Mon-Fri at 8:00 AM', value: '0 8 * * 1-5' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Every 12 hours', value: '0 */12 * * *' },
  { label: 'Every hour', value: '0 * * * *' },
];

function SourceConfigurator({ sources, plugins, onChange }) {
  const [showAdd, setShowAdd] = useState(null);

  const addPreset = (presetId) => {
    onChange([...sources, { type: 'preset', preset: presetId }]);
  };

  const addSource = (type) => {
    const defaults = {};
    const plug = plugins.sources.find(s => s.type === type);
    if (plug) plug.fields.forEach(f => { if (f.default) defaults[f.key] = f.default; });
    onChange([...sources, { type, config: defaults }]);
    setShowAdd(null);
  };

  const updateSource = (idx, config) => {
    const next = [...sources];
    next[idx] = { ...next[idx], config: { ...next[idx].config, ...config } };
    onChange(next);
  };

  const removeSource = (idx) => {
    onChange(sources.filter((_, i) => i !== idx));
  };

  return html`
    <div>
      <div class="section-title">Data Sources</div>

      <!-- Presets -->
      <div style="margin-bottom:16px">
        <label class="form-label">Quick Add — Presets</label>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${plugins.presets.map(p => html`
            <button key=${p.id} class="btn btn-sm" onClick=${() => addPreset(p.id)}
              title=${p.description}>
              ${p.icon} ${p.name}
            </button>
          `)}
        </div>
      </div>

      <!-- Added sources -->
      ${sources.map((src, idx) => html`
        <div key=${idx} class="card" style="margin-bottom:8px;padding:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <strong style="font-size:13px">
              ${src.type === 'preset'
                ? `📦 Preset: ${plugins.presets.find(p => p.id === src.preset)?.name || src.preset}`
                : `${plugins.sources.find(s => s.type === src.type)?.icon || '📡'} ${plugins.sources.find(s => s.type === src.type)?.name || src.type}`
              }
            </strong>
            <button class="btn btn-sm btn-danger" onClick=${() => removeSource(idx)}>Remove</button>
          </div>
          ${src.type !== 'preset' ? html`
            <div class="form-row">
              ${(plugins.sources.find(s => s.type === src.type)?.fields || []).map(f => html`
                <div class="form-group" key=${f.key}>
                  <label class="form-label">${f.label}${f.required ? ' *' : ''}</label>
                  ${f.type === 'select' ? html`
                    <select class="form-select" value=${src.config?.[f.key] || f.default || ''}
                      onChange=${(e) => updateSource(idx, { [f.key]: e.target.value })}>
                      ${f.options.map(o => html`<option key=${o} value=${o}>${o}</option>`)}
                    </select>
                  ` : html`
                    <input class="form-input" type=${f.type === 'number' ? 'number' : 'text'}
                      value=${src.config?.[f.key] || ''}
                      placeholder=${f.default || ''}
                      onChange=${(e) => updateSource(idx, { [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value })} />
                  `}
                </div>
              `)}
            </div>
          ` : null}
        </div>
      `)}

      <!-- Add source button -->
      <div style="margin-top:8px">
        <label class="form-label">Add Individual Source</label>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${plugins.sources.map(s => html`
            <button key=${s.type} class="btn btn-sm" onClick=${() => addSource(s.type)}>
              ${s.icon} ${s.name}
            </button>
          `)}
        </div>
      </div>
    </div>
  `;
}

function AIConfigurator({ ai, plugins, onChange }) {
  const provider = ai?.provider || 'none';
  const providerInfo = plugins.ai.find(a => a.provider === provider);

  const setProvider = (p) => {
    if (p === 'none') { onChange(null); return; }
    onChange({ provider: p, language: ai?.language || 'vi', style: ai?.style || 'digest' });
  };

  const update = (key, value) => {
    onChange({ ...ai, [key]: value });
  };

  return html`
    <div>
      <div class="section-title">AI Persona</div>

      <div class="form-group">
        <label class="form-label">AI Provider</label>
        <select class="form-select" value=${provider} onChange=${(e) => setProvider(e.target.value)}>
          ${plugins.ai.map(a => html`
            <option key=${a.provider} value=${a.provider}>${a.name}</option>
          `)}
        </select>
      </div>

      ${provider !== 'none' && providerInfo ? html`
        <div class="form-row">
          ${providerInfo.fields.map(f => html`
            <div class="form-group" key=${f.key}>
              <label class="form-label">${f.label}${f.required ? ' *' : ''}</label>
              <input class="form-input" type=${f.type === 'password' ? 'password' : 'text'}
                value=${ai?.[f.key] || ''}
                placeholder=${f.default || ''}
                onChange=${(e) => update(f.key, e.target.value)} />
            </div>
          `)}
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Language</label>
            <select class="form-select" value=${ai?.language || 'vi'}
              onChange=${(e) => update('language', e.target.value)}>
              ${plugins.languages.map(l => html`
                <option key=${l.value} value=${l.value}>${l.label}</option>
              `)}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Style</label>
            <select class="form-select" value=${ai?.style || 'digest'}
              onChange=${(e) => update('style', e.target.value)}>
              ${plugins.styles.map(s => html`
                <option key=${s.value} value=${s.value}>${s.label}</option>
              `)}
            </select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Custom System Prompt (optional)</label>
          <textarea class="form-textarea" value=${ai?.systemPrompt || ''}
            placeholder="Override the default system prompt..."
            onInput=${(e) => update('systemPrompt', e.target.value)}></textarea>
        </div>
      ` : null}
    </div>
  `;
}

function OutputConfigurator({ outputs, plugins, onChange }) {
  const addOutput = (type) => {
    const defaults = {};
    const plug = plugins.outputs.find(o => o.type === type);
    if (plug) plug.fields.forEach(f => { if (f.default) defaults[f.key] = f.default; });
    onChange([...outputs, { type, config: defaults }]);
  };

  const updateOutput = (idx, config) => {
    const next = [...outputs];
    next[idx] = { ...next[idx], config: { ...next[idx].config, ...config } };
    onChange(next);
  };

  const removeOutput = (idx) => {
    onChange(outputs.filter((_, i) => i !== idx));
  };

  return html`
    <div>
      <div class="section-title">Output Channels</div>

      ${outputs.map((out, idx) => {
        const plug = plugins.outputs.find(o => o.type === out.type);
        return html`
          <div key=${idx} class="card" style="margin-bottom:8px;padding:12px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <strong style="font-size:13px">${plug?.icon || '📤'} ${plug?.name || out.type}</strong>
              <button class="btn btn-sm btn-danger" onClick=${() => removeOutput(idx)}>Remove</button>
            </div>
            <div class="form-row">
              ${(plug?.fields || []).map(f => html`
                <div class="form-group" key=${f.key}>
                  <label class="form-label">${f.label}${f.required ? ' *' : ''}</label>
                  ${f.type === 'select' ? html`
                    <select class="form-select" value=${out.config?.[f.key] || f.default || ''}
                      onChange=${(e) => updateOutput(idx, { [f.key]: e.target.value })}>
                      ${f.options.map(o => html`<option key=${o} value=${o}>${o}</option>`)}
                    </select>
                  ` : html`
                    <input class="form-input" type=${f.type === 'password' ? 'password' : 'text'}
                      value=${out.config?.[f.key] || ''}
                      placeholder=${f.default || ''}
                      onChange=${(e) => updateOutput(idx, { [f.key]: e.target.value })} />
                  `}
                </div>
              `)}
            </div>
          </div>
        `;
      })}

      <div style="margin-top:8px">
        <label class="form-label">Add Output Channel</label>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${plugins.outputs.map(o => html`
            <button key=${o.type} class="btn btn-sm" onClick=${() => addOutput(o.type)}>
              ${o.icon} ${o.name}
            </button>
          `)}
        </div>
      </div>
    </div>
  `;
}

export default function StreamFormPage({ id }) {
  const isEdit = !!id;
  const [plugins, setPlugins] = useState(null);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: '',
    cron: '0 7 * * *',
    timezone: 'UTC',
    enabled: true,
    sources: [],
    ai: null,
    outputs: [],
    options: { concurrency: 5, maxArticlesPerSource: 5 },
  });

  useEffect(() => {
    api('/plugins').then(setPlugins);
    if (isEdit) {
      api(`/streams/${id}`).then(data => {
        setForm({
          name: data.name,
          cron: data.cron,
          timezone: data.timezone,
          enabled: data.enabled,
          sources: data.sources,
          ai: data.ai,
          outputs: data.outputs,
          options: data.options || { concurrency: 5, maxArticlesPerSource: 5 },
        });
      });
    }
  }, [id]);

  const update = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const save = async () => {
    if (!form.name.trim()) { toast('Name is required', 'error'); return; }
    if (form.sources.length === 0) { toast('Add at least one source', 'error'); return; }
    if (form.outputs.length === 0) { toast('Add at least one output', 'error'); return; }

    setSaving(true);
    try {
      if (isEdit) {
        await api(`/streams/${id}`, { method: 'PUT', body: form });
        toast('Stream updated!', 'success');
      } else {
        const created = await api('/streams', { method: 'POST', body: form });
        toast('Stream created!', 'success');
        navigate(`/streams/${created.id}`);
        return;
      }
      navigate(`/streams/${id}`);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!plugins) return html`<div class="container" style="text-align:center;padding:48px"><div class="spinner"></div></div>`;

  const steps = ['Basic Info', 'Sources', 'AI Persona', 'Outputs'];

  return html`
    <div class="container" style="max-width:800px">
      <div class="breadcrumb">
        <a href="#/">Streams</a> / ${isEdit ? 'Edit' : 'New Stream'}
      </div>
      <h1 class="page-title" style="margin-bottom:20px">${isEdit ? 'Edit Stream' : 'Create Stream'}</h1>

      <!-- Steps -->
      <div class="steps">
        ${steps.map((s, i) => html`
          <div key=${i} class="step ${i === step ? 'active' : i < step ? 'completed' : ''}"
            onClick=${() => setStep(i)}>
            ${s}
          </div>
        `)}
      </div>

      <!-- Step 0: Basic Info -->
      ${step === 0 ? html`
        <div class="card">
          <div class="form-group">
            <label class="form-label">Stream Name *</label>
            <input class="form-input" type="text" value=${form.name}
              placeholder="e.g. AI News Morning Digest"
              onInput=${(e) => update('name', e.target.value)} />
          </div>

          <div class="form-group">
            <label class="form-label">Schedule (Cron Expression)</label>
            <input class="form-input" type="text" value=${form.cron}
              placeholder="0 7 * * *"
              onInput=${(e) => update('cron', e.target.value)} />
            <div class="form-help">
              Quick presets:
              <span style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">
                ${CRON_PRESETS.map(p => html`
                  <button key=${p.value} class="btn btn-sm" style="font-size:11px"
                    onClick=${() => update('cron', p.value)}>
                    ${p.label}
                  </button>
                `)}
              </span>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Timezone</label>
              <input class="form-input" type="text" value=${form.timezone}
                placeholder="UTC" onInput=${(e) => update('timezone', e.target.value)} />
            </div>
            <div class="form-group">
              <label class="form-label">Enabled</label>
              <label class="toggle" style="margin-top:6px">
                <input type="checkbox" checked=${form.enabled}
                  onChange=${(e) => update('enabled', e.target.checked)} />
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Max Articles Per Source</label>
              <input class="form-input" type="number" value=${form.options.maxArticlesPerSource || 5}
                onInput=${(e) => update('options', { ...form.options, maxArticlesPerSource: Number(e.target.value) })} />
            </div>
            <div class="form-group">
              <label class="form-label">Concurrency</label>
              <input class="form-input" type="number" value=${form.options.concurrency || 5}
                onInput=${(e) => update('options', { ...form.options, concurrency: Number(e.target.value) })} />
            </div>
          </div>
        </div>
      ` : null}

      <!-- Step 1: Sources -->
      ${step === 1 ? html`
        <div class="card">
          <${SourceConfigurator} sources=${form.sources} plugins=${plugins}
            onChange=${(s) => update('sources', s)} />
        </div>
      ` : null}

      <!-- Step 2: AI -->
      ${step === 2 ? html`
        <div class="card">
          <${AIConfigurator} ai=${form.ai} plugins=${plugins}
            onChange=${(a) => update('ai', a)} />
        </div>
      ` : null}

      <!-- Step 3: Outputs -->
      ${step === 3 ? html`
        <div class="card">
          <${OutputConfigurator} outputs=${form.outputs} plugins=${plugins}
            onChange=${(o) => update('outputs', o)} />
        </div>
      ` : null}

      <!-- Navigation -->
      <div style="display:flex;justify-content:space-between;margin-top:16px">
        <button class="btn" onClick=${() => step > 0 ? setStep(step - 1) : navigate('/')}
          style="visibility:${step >= 0 ? 'visible' : 'hidden'}">
          ${step === 0 ? 'Cancel' : 'Back'}
        </button>
        <div style="display:flex;gap:8px">
          ${step < 3 ? html`
            <button class="btn btn-primary" onClick=${() => setStep(step + 1)}>Next</button>
          ` : html`
            <button class="btn btn-success" onClick=${save} disabled=${saving}>
              ${saving ? html`<span class="spinner"></span>` : null}
              ${isEdit ? 'Save Changes' : 'Create Stream'}
            </button>
          `}
        </div>
      </div>
    </div>
  `;
}
