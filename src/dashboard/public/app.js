/**
 * Dashboard App — Preact SPA via CDN (no build step)
 */

import { h, render } from 'https://esm.sh/preact@10.25.4';
import { useState, useEffect, useCallback, useRef } from 'https://esm.sh/preact@10.25.4/hooks';
import htm from 'https://esm.sh/htm@3.1.1';

export const html = htm.bind(h);

// ============================================
// Router (hash-based, simple)
// ============================================

function useRouter() {
  const [route, setRoute] = useState(parseHash());

  useEffect(() => {
    const handler = () => setRoute(parseHash());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  return route;
}

function parseHash() {
  const hash = location.hash.slice(1) || '/';
  const [path, query] = hash.split('?');
  const parts = path.split('/').filter(Boolean);
  return { path, parts, query };
}

export function navigate(path) {
  location.hash = path;
}

// ============================================
// API helpers
// ============================================

export async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    ...(opts.body && { body: JSON.stringify(opts.body) }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

// ============================================
// SSE
// ============================================

export function useSSE(onEvent) {
  const ref = useRef(onEvent);
  ref.current = onEvent;

  useEffect(() => {
    const es = new EventSource('/api/events');
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        ref.current(data);
      } catch {}
    };
    return () => es.close();
  }, []);
}

// ============================================
// Toast
// ============================================

let toastId = 0;
const toastListeners = new Set();

export function toast(message, type = 'info') {
  const t = { id: ++toastId, message, type };
  toastListeners.forEach(fn => fn(t));
}

function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handler = (t) => {
      setToasts(prev => [...prev, t]);
      setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 3000);
    };
    toastListeners.add(handler);
    return () => toastListeners.delete(handler);
  }, []);

  return html`
    <div class="toast-container">
      ${toasts.map(t => html`
        <div key=${t.id} class="toast toast-${t.type}">${t.message}</div>
      `)}
    </div>
  `;
}

// ============================================
// Lazy page loading
// ============================================

const pageCache = {};

async function loadPage(name) {
  if (!pageCache[name]) {
    pageCache[name] = import(`/pages/${name}.js`);
  }
  return pageCache[name];
}

function LazyPage({ name, ...props }) {
  const [mod, setMod] = useState(null);

  useEffect(() => {
    setMod(null);
    loadPage(name).then(setMod);
  }, [name]);

  if (!mod) return html`<div class="container"><div class="spinner"></div></div>`;
  return h(mod.default, props);
}

// ============================================
// Header
// ============================================

function Header() {
  const route = parseHash();
  return html`
    <header class="header">
      <div class="header-logo" onClick=${() => navigate('/')}>
        <span>📡</span> NewsEngine
      </div>
      <div class="header-nav">
        <button class="btn btn-primary" onClick=${() => navigate('/streams/new')}>
          + New Stream
        </button>
      </div>
    </header>
  `;
}

// ============================================
// App
// ============================================

function App() {
  const route = useRouter();
  const { parts } = route;

  let page;
  if (parts.length === 0 || (parts[0] === '')) {
    page = html`<${LazyPage} name="dashboard" />`;
  } else if (parts[0] === 'streams' && parts[1] === 'new') {
    page = html`<${LazyPage} name="stream-form" />`;
  } else if (parts[0] === 'streams' && parts[2] === 'edit') {
    page = html`<${LazyPage} name="stream-form" id=${parts[1]} />`;
  } else if (parts[0] === 'streams' && parts[1]) {
    page = html`<${LazyPage} name="stream-detail" id=${parts[1]} />`;
  } else if (parts[0] === 'runs' && parts[1]) {
    page = html`<${LazyPage} name="run-detail" id=${parts[1]} />`;
  } else {
    page = html`<div class="container"><h2>404 — Not Found</h2></div>`;
  }

  return html`
    <${Header} />
    ${page}
    <${ToastContainer} />
  `;
}

render(html`<${App} />`, document.getElementById('app'));
