// Shared state and helpers for the home page and the three dashboards

const state = {
  user: null,
  families: [],
  landingFilter: 'all',
  dashFilter: 'all',
  queue: [],
  reviewing: null,
};

const $ = (id) => document.getElementById(id);
const DASHBOARDS = { donor: 'donorDash', leader: 'leaderDash', admin: 'adminDash' };

function toast(message, type = 'success') {
  const el = document.createElement('div');
  el.className = `alert alert-${type}`;
  el.textContent = message;
  el.addEventListener('click', () => el.remove());
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 6000);
}

const roleOf = (user) => (user ? user.role || (user.isAdmin ? 'admin' : 'donor') : null);

function updateHeader() {
  const loggedIn = Boolean(state.user);
  document.querySelectorAll('[data-guest]').forEach((el) => el.classList.toggle('hidden', loggedIn));
  document.querySelectorAll('[data-member]').forEach((el) => el.classList.toggle('hidden', !loggedIn));
  document.querySelectorAll('[data-user-name]').forEach((el) => {
    el.textContent = loggedIn ? state.user.name.split(' ')[0] : el.textContent;
  });
}

function logout() {
  session.clear();
  state.user = null;
  updateHeader();
  showWebsite();
  toast('You have logged out.');
}

function showWebsite() {
  document.body.classList.remove('in-dashboard');
  Object.values(DASHBOARDS).forEach((id) => $(id).classList.remove('visible'));
  window.scrollTo(0, 0);
}

function openDashboard() {
  if (!state.user) {
    window.location.href = '/login?next=dashboard';
    return;
  }
  const role = roleOf(state.user);
  document.body.classList.add('in-dashboard');
  Object.entries(DASHBOARDS).forEach(([key, id]) => $(id).classList.toggle('visible', key === role));
  window.scrollTo(0, 0);

  if (role === 'admin') loadAdmin();
  else if (role === 'leader') loadLeader();
  else loadDonor();
}

function showView(dash, viewId) {
  dash.querySelectorAll('.dash-nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === viewId));
  dash.querySelectorAll('.panel-view').forEach((p) => p.classList.toggle('active', p.id === viewId));
}

function expiredSession() {
  session.clear();
  window.location.href = '/login?next=dashboard';
}
