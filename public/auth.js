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

function setAlert(message, type = 'error') {
  const el = document.getElementById('authAlert');
  if (!el) return;
  el.className = `auth-alert ${type} show`;
  el.textContent = message;
}

function clearAlert() {
  const el = document.getElementById('authAlert');
  if (!el) return;
  el.className = 'auth-alert';
  el.textContent = '';
}

function saveSession(user, token) {
  try {
    localStorage.setItem('en_currentUser', JSON.stringify(user));
    localStorage.setItem('en_role', user.role || (user.isAdmin ? 'admin' : 'donor'));
    if (token) localStorage.setItem('en_token', String(token));
  } catch (_) {}
}

function getNextTarget() {
  const params = new URLSearchParams(window.location.search);
  return params.get('next');
}

function redirectAfterAuth(user) {
  const next = getNextTarget();
  // The home page opens the right dashboard for the account's role (donor, local leader or admin).
  if (next && next.startsWith('/') && !next.startsWith('//')) return (window.location.href = next);
  window.location.href = '/?open=dashboard';
}

async function api(endpoint, body) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || `Request failed (${res.status})`);
  }
  return data;
}

function normalizeRwandaPhone(raw) {
  const phone = String(raw || '').replace(/\s+/g, '');
  if (!phone) return '';
  if (phone.startsWith('+250')) return phone;
  if (phone.startsWith('0')) return '+25' + phone; // 07... -> +2507...
  if (phone.startsWith('7')) return '+250' + phone;
  return phone;
}

function bindPasswordToggles() {
  document.querySelectorAll('[data-toggle-password]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-toggle-password');
      const input = document.getElementById(targetId);
      if (!input) return;
      const isHidden = input.type === 'password';
      input.type = isHidden ? 'text' : 'password';
      btn.setAttribute('aria-pressed', isHidden ? 'true' : 'false');
      btn.innerHTML = isHidden ? '<i class="fas fa-eye-slash"></i>' : '<i class="fas fa-eye"></i>';
    });
  });
}

function bindRoleToggle() {
  const buttons = { donor: document.getElementById('roleDonor'), leader: document.getElementById('roleLeader'), admin: document.getElementById('roleAdmin') };
  const hidden = document.getElementById('loginRole');
  if (!hidden || !buttons.donor || !buttons.leader || !buttons.admin) return;

  const setActive = (which) => {
    Object.keys(buttons).forEach((k) => buttons[k].classList.toggle('active', k === which));
    hidden.value = which;
  };
  Object.keys(buttons).forEach((k) => buttons[k].addEventListener('click', () => setActive(k)));
  setActive('donor');
}

function setLoading(btn, isLoading) {
  if (!btn) return;
  btn.disabled = isLoading;
  btn.dataset.originalText = btn.dataset.originalText || btn.innerHTML;
  btn.innerHTML = isLoading ? 'Please wait…' : btn.dataset.originalText;
}

document.addEventListener('DOMContentLoaded', () => {
  bindPasswordToggles();
  bindRoleToggle();

  const loginForm = document.getElementById('loginPageForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlert();
      const btn = document.getElementById('loginSubmit');
      setLoading(btn, true);
      try {
        const identifier = document.getElementById('loginIdentifier').value.trim();
        const password = document.getElementById('loginPassword').value;
        const role = document.getElementById('loginRole').value;
        const data = await api('/auth/login', { identifier, password, role });
        if (!data.success) throw new Error(data.message || 'Login failed');
        saveSession(data.user, data.token);
        redirectAfterAuth(data.user);
      } catch (err) {
        setAlert(err.message || 'Login failed. Please try again.', 'error');
      } finally {
        setLoading(btn, false);
      }
    });
  }

  // Password reset request (login page)
  const toggleReset = document.getElementById('toggleReset');
  const resetPanel = document.getElementById('resetPanel');
  if (toggleReset && resetPanel) {
    toggleReset.addEventListener('click', () => {
      const show = resetPanel.style.display === 'none';
      resetPanel.style.display = show ? 'block' : 'none';
      if (show) {
        const email = (document.getElementById('loginIdentifier')?.value || '').trim();
        const resetEmail = document.getElementById('resetEmail');
        if (resetEmail && email) resetEmail.value = email;
      }
    });
  }

  const resetBtn = document.getElementById('resetRequestBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      clearAlert();
      setLoading(resetBtn, true);
      try {
        const email = (document.getElementById('resetEmail')?.value || '').trim();
        if (!email) throw new Error('Please enter your email address.');
        const data = await api('/auth/password-reset/request', { email });
        setAlert(data.message || 'If an account exists, we sent a reset link.', 'success');
      } catch (err) {
        setAlert(err.message || 'Failed to request reset link', 'error');
      } finally {
        setLoading(resetBtn, false);
      }
    });
  }

  const signupForm = document.getElementById('signupPageForm');
  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAlert();
      const btn = document.getElementById('signupSubmit');
      setLoading(btn, true);
      try {
        const name = document.getElementById('signupName').value.trim();
        const email = document.getElementById('signupEmail').value.trim();
        const phoneRaw = document.getElementById('signupPhone').value.trim();
        const phone = normalizeRwandaPhone(phoneRaw);
        const password = document.getElementById('signupPassword').value;
        const confirm = document.getElementById('signupConfirmPassword').value;

        if (!name) throw new Error('Please enter your name.');
        if (!email && !phoneRaw) throw new Error('Please enter a phone number or an email address.');
        if (password.length < 6) throw new Error('Password must be at least 6 characters.');
        if (password !== confirm) throw new Error('Passwords do not match.');

        const data = await api('/auth/signup', { name, email, phone, password });
        if (!data.success) throw new Error(data.message || 'Sign up failed');

        saveSession(data.user, data.token);
        redirectAfterAuth(data.user);
      } catch (err) {
        setAlert(err.message || 'Sign up failed. Please try again.', 'error');
      } finally {
        setLoading(btn, false);
      }
    });
  }
});
