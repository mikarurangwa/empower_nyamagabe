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
  const el = document.getElementById('impactAlert');
  if (!el) return;
  el.className = `auth-alert ${type} show`;
  el.textContent = msg;
}

function formatCurrency(amount) {
    return 'RWF ' + new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(amount || 0));
}

function formatDateTime(iso) {
  try {
    return new Date(iso).toLocaleString('en-GB', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

async function loadImpact() {
  const res = await fetch(`${API_BASE}/public/impact`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data.message || 'Failed to load impact');
  return data.data;
}

function renderPurposeBreakdown(byPurpose) {
  const mount = document.getElementById('purposeBreakdown');
  if (!mount) return;

  if (!byPurpose || byPurpose.length === 0) {
    mount.textContent = 'No completed donations yet.';
    return;
  }

  const labels = {
    health: 'Health insurance (Mutuelle de Santé)',
    education: 'School fees'
  };

  const total = byPurpose.reduce((acc, r) => acc + Number(r.total || 0), 0) || 1;

  mount.innerHTML = byPurpose
    .slice()
    .sort((a, b) => Number(b.total || 0) - Number(a.total || 0))
    .map((r) => {
      const purpose = String(r.purpose || '').toLowerCase();
      const amt = Number(r.total || 0);
      const pct = Math.round((amt / total) * 100);
      return `
        <div style="margin: 0.75rem 0;">
          <div style="display:flex; justify-content: space-between; gap: 0.75rem;">
            <div><strong>${labels[purpose] || purpose}</strong></div>
            <div>${formatCurrency(amt)} <span class="muted">(${pct}%)</span></div>
          </div>
          <div style="height:10px; background:#eef2f7; border-radius:999px; overflow:hidden; margin-top:0.4rem;">
            <div style="height:10px; width:${Math.max(2, pct)}%; background:#4a7c59;"></div>
          </div>
        </div>
      `;
    })
    .join('');
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const d = await loadImpact();

    const totalRaised = document.getElementById('totalRaised');
    const totalAllocated = document.getElementById('totalAllocated');
    const availableFunds = document.getElementById('availableFunds');
    const donationCount = document.getElementById('donationCount');
    const donorCount = document.getElementById('donorCount');
    const beneficiariesHelped = document.getElementById('beneficiariesHelped');
    const updatedAt = document.getElementById('updatedAt');

    if (totalRaised) totalRaised.textContent = formatCurrency(d.totalRaised);
    if (totalAllocated) totalAllocated.textContent = String(d.verifiedFamilies || 0);
    if (availableFunds) availableFunds.textContent = formatCurrency(d.stillNeeded);

    if (donationCount) donationCount.textContent = `${d.donationCount || 0} completed donations`;
    if (donorCount) donorCount.textContent = `of ${formatCurrency(d.totalNeed)} total verified need · ${d.donorCount || 0} unique donors`;
    if (beneficiariesHelped) beneficiariesHelped.textContent = `${d.familiesHelped || 0} families have received a gift · ${d.fullyFundedFamilies || 0} fully funded`;
    if (updatedAt) updatedAt.textContent = formatDateTime(d.updatedAt);

    renderPurposeBreakdown(d.byPurpose);
  } catch (e) {
    setAlert(e.message || 'Failed to load impact stats', 'error');
  }
});
