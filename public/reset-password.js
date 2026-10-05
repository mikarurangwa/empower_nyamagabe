'use strict';

const API_BASE = (() => {
  const isFile = window.location.protocol === 'file:';
  const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const backendPort = '3000';
  if (isFile) return `http://localhost:${backendPort}/api`;
  if (isLocalhost && window.location.port && window.location.port !== backendPort) {
    return `http://localhost:${backendPort}/api`;
  }
  return '/api';
})();

function setAlert(msg, type = 'error') {
  const el = document.getElementById('resetAlert');
  if (!el) return;
  el.className = `auth-alert ${type} show`;
  el.textContent = msg;
}

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const email = params.get('email');
  const token = params.get('token');

  if (email) document.getElementById('email').value = email;
  if (token) document.getElementById('token').value = token;

  const form = document.getElementById('resetForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const em = document.getElementById('email').value.trim();
    const tk = document.getElementById('token').value.trim();
    const pw = document.getElementById('newPassword').value;
    const pw2 = document.getElementById('confirmPassword').value;

    if (pw !== pw2) {
      setAlert('Passwords do not match.', 'error');
      return;
    }

    const btn = document.getElementById('resetBtn');
    btn.disabled = true;

    try {
      const res = await fetch(`${API_BASE}/auth/password-reset/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: em, token: tk, newPassword: pw })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Reset failed');
      }

      setAlert('Password updated. Redirecting to login…', 'success');
      setTimeout(() => {
        window.location.href = '/login';
      }, 1200);
    } catch (err) {
      setAlert(err.message || 'Reset failed', 'error');
    } finally {
      btn.disabled = false;
    }
  });
});
