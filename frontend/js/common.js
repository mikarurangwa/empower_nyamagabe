// Shared helpers for every page

// When the page is opened from Live Server or as a file, the API is still on port 3000
const API_BASE = (() => {
  const { protocol, hostname, port } = window.location;
  const local = hostname === 'localhost' || hostname === '127.0.0.1';
  if (protocol === 'file:' || (local && port && port !== '3000')) return 'http://localhost:3000/api';
  return '/api';
})();

const NEED_LABELS = { education: 'School fees', health: 'Mutuelle de Santé' };

const session = {
  get() {
    try {
      return {
        user: JSON.parse(localStorage.getItem('en_user') || 'null'),
        token: localStorage.getItem('en_token'),
      };
    } catch (err) {
      return { user: null, token: null };
    }
  },
  save(user, token) {
    localStorage.setItem('en_user', JSON.stringify(user));
    if (token) localStorage.setItem('en_token', token);
  },
  clear() {
    localStorage.removeItem('en_user');
    localStorage.removeItem('en_token');
  },
};

async function api(path, options = {}) {
  const { token } = session.get();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(API_BASE + path, { ...options, headers });
  } catch (err) {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    const error = new Error(data.message || `Request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return data;
}

const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) });

// Downloads a file (CSV, Excel, PDF) from an endpoint that needs the login token
async function download(path, filename) {
  const { token } = session.get();
  const res = await fetch(API_BASE + path, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || 'Download failed');
  }
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const money = (amount) => 'RWF ' + Number(amount || 0).toLocaleString('en-US');

const formatDate = (value, withTime = false) => {
  const date = new Date(String(value).replace(' ', 'T') + (String(value).includes('Z') ? '' : 'Z'));
  if (Number.isNaN(date.getTime())) return value || '';
  const options = { day: 'numeric', month: 'short', year: 'numeric' };
  if (withTime) Object.assign(options, { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleString('en-GB', options);
};

function showMessage(el, message, type = 'error') {
  if (!el) return;
  el.className = `alert alert-${type}`;
  el.textContent = message;
  el.hidden = false;
}

function hideMessage(el) {
  if (el) el.hidden = true;
}

const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="/icons.svg#${name}"></use></svg>`;

function statusBadge(status) {
  const s = String(status || '').toLowerCase();
  return `<span class="status ${escapeHtml(s)}">${escapeHtml(s)}</span>`;
}

// Show / hide password buttons
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-toggle-password]');
  if (!btn) return;
  const input = btn.parentElement.querySelector('input');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  btn.innerHTML = icon(show ? 'eye-slash' : 'eye');
  btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
});
