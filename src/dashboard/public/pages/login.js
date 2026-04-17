/**
 * Login page — email+password + Google OAuth
 */

import { html, navigate } from '../app.js';
import { useState } from 'https://esm.sh/preact@10.25.4/hooks';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Invalid credentials');
      }
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleGoogle() {
    window.location.href = '/api/auth/sign-in/social?provider=google';
  }

  return html`
    <div class="container" style="max-width:400px;margin:80px auto;padding:24px">
      <h1 style="text-align:center;margin-bottom:8px">Sign In</h1>
      <p style="text-align:center;color:var(--text-dim);margin-bottom:24px">Welcome back to NewsEngine</p>

      ${error && html`<div class="toast toast-error" style="margin-bottom:16px">${error}</div>`}

      <form onSubmit=${handleSubmit}>
        <label style="display:block;margin-bottom:12px">
          <span style="font-size:13px;color:var(--text-dim)">Email</span>
          <input type="email" value=${email} onInput=${(e) => setEmail(e.target.value)}
            required placeholder="you@example.com"
            style="width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--border);border-radius:6px;background:var(--bg-card)" />
        </label>
        <label style="display:block;margin-bottom:16px">
          <span style="font-size:13px;color:var(--text-dim)">Password</span>
          <input type="password" value=${password} onInput=${(e) => setPassword(e.target.value)}
            required placeholder="********" minlength="8"
            style="width:100%;padding:8px 12px;margin-top:4px;border:1px solid var(--border);border-radius:6px;background:var(--bg-card)" />
        </label>
        <button type="submit" disabled=${loading}
          style="width:100%;padding:10px;border:none;border-radius:6px;background:var(--primary);color:#fff;cursor:pointer;font-weight:600">
          ${loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

      <div style="margin:20px 0;text-align:center;color:var(--text-dim);font-size:13px">or</div>

      <button onClick=${handleGoogle}
        style="width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-card);cursor:pointer;font-weight:500">
        Continue with Google
      </button>

      <p style="text-align:center;margin-top:20px;font-size:13px;color:var(--text-dim)">
        Don't have an account? <a href="#/signup" style="color:var(--primary)">Sign Up</a>
      </p>
    </div>
  `;
}
