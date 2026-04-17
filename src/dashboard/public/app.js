/**
 * Dashboard App — Preact SPA via CDN (no build step)
 * Auth-aware: redirects to login if no session
 */

import { h, render } from 'https://esm.sh/preact@10.25.4';
import { useState, useEffect, useCallback, useRef } from 'https://esm.sh/preact@10.25.4/hooks';
import htm from 'https://esm.sh/htm@3.1.1';

export const html = htm.bind(h);

// ============================================
// Router (hash-based)
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
  const parts = hash.split('/').filter(Boolean);
  return { path: hash, parts };
}

export function navigate(path) { location.hash = path; }

// ============================================
// API helpers
// ============================================

export async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
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
// Auth state
// ============================================

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/get-session', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => setUser(data?.user || null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' });
    setUser(null);
    navigate('/login');
  }, []);

  return { user, loading, logout };
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
      try { ref.current(JSON.parse(e.data)); } catch {}
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
      ${toasts.map(t => html`<div key=${t.id} class="toast toast-${t.type}">${t.message}</div>`)}
    </div>
  `;
}

// ============================================
// Lazy page loading
// ============================================

const pageCache = {};
async function loadPage(name) {
  if (!pageCache[name]) pageCache[name] = import(`/pages/${name}.js`);
  return pageCache[name];
}

function LazyPage({ name, ...props }) {
  const [mod, setMod] = useState(null);
  useEffect(() => { setMod(null); loadPage(name).then(setMod); }, [name]);
  if (!mod) return html`<div class="container" style="text-align:center;padding:48px"><div class="spinner"></div></div>`;
  return h(mod.default, props);
}

// ============================================
// Header
// ============================================

function Header({ user, onLogout }) {
  return html`
    <header class="header">
      <div class="header-logo" onClick=${() => navigate('/')}>
        <span>📡</span> NewsEngine
      </div>
      <div style="display:flex;align-items:center;gap:12px">
        ${user && html`
          <span style="font-size:12px;color:var(--text-dim)">${user.name || user.email}</span>
          <button onClick=${onLogout}
            style="font-size:12px;padding:4px 10px;border:1px solid var(--border);border-radius:4px;background:transparent;color:var(--text-dim);cursor:pointer">
            Logout
          </button>
        `}
      </div>
    </header>
  `;
}

// ============================================
// App
// ============================================

function App() {
  const { parts } = useRouter();
  const { user, loading, logout } = useAuth();

  // Public routes (no auth required)
  const publicRoutes = ['login', 'signup'];
  const isPublic = publicRoutes.includes(parts[0]);

  // Show loading spinner while checking auth
  if (loading) {
    return html`<div class="container" style="text-align:center;padding:80px"><div class="spinner"></div></div>`;
  }

  // Redirect to login if not authenticated and not on public route
  if (!user && !isPublic) {
    navigate('/login');
    return null;
  }

  // Redirect to dashboard if authenticated and on login/signup
  if (user && isPublic) {
    navigate('/');
    return null;
  }

  // Public pages
  if (isPublic) {
    return html`<${LazyPage} name=${parts[0]} /><${ToastContainer} />`;
  }

  // Authenticated pages
  let page;
  if (parts.length === 0 || parts[0] === '') {
    page = html`<${LazyPage} name="dashboard" />`;
  } else if (parts[0] === 'streams' && !parts[1]) {
    page = html`<${LazyPage} name="streams" />`;
  } else if (parts[0] === 'streams' && parts[1]) {
    page = html`<${LazyPage} name="stream-detail" id=${parts[1]} />`;
  } else if (parts[0] === 'stream-builder') {
    page = html`<${LazyPage} name="stream-builder" />`;
  } else if (parts[0] === 'runs' && !parts[1]) {
    page = html`<${LazyPage} name="runs" />`;
  } else if (parts[0] === 'runs' && parts[1]) {
    page = html`<${LazyPage} name="run-detail" id=${parts[1]} />`;
  } else if (parts[0] === 'billing') {
    page = html`<${LazyPage} name="billing" />`;
  } else if (parts[0] === 'errors') {
    page = html`<${LazyPage} name="error-log" />`;
  } else if (parts[0] === 'onboarding') {
    page = html`<${LazyPage} name="onboarding" />`;
  } else {
    page = html`<div class="container"><h2>404</h2></div>`;
  }

  return html`<${Header} user=${user} onLogout=${logout} />${page}<${ToastContainer} />`;
}

render(html`<${App} />`, document.getElementById('app'));
