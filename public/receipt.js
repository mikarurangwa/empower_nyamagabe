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
  const el = document.getElementById('receiptAlert');
  if (!el) return;
  el.className = `auth-alert ${type} show`;
  el.textContent = msg;
}

function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatCurrency(amount) {
    return 'RWF ' + new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(amount || 0));
}

async function fetchReceipt(txRef) {
  const token = localStorage.getItem('en_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/donations/receipt/${encodeURIComponent(txRef)}`, { headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Failed to load receipt');
  return data.receipt;
}

async function downloadReceiptPdf(txRef) {
  const token = localStorage.getItem('en_token');
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/donations/receipt/${encodeURIComponent(txRef)}.pdf`, { headers });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || 'Failed to download PDF');
  }
  const blob = await res.blob();

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Empower-Nyamagabe-Receipt-${txRef}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function renderReceipt(r) {
  const mount = document.getElementById('receiptBody');
  if (!mount) return;

  const left = `
    <div class="stat-card" style="padding:1rem;">
      <div class="stat-title">Receipt</div>
      <div style="margin-top:0.5rem; display:grid; gap:0.4rem;">
        <div><strong>Reference:</strong> ${escapeHtml(r.txRef)}</div>
        <div><strong>Status:</strong> ${escapeHtml(String(r.status || '').toUpperCase())}</div>
        <div><strong>Date:</strong> ${escapeHtml(r.date || '')}</div>
        <div><strong>Beneficiary family:</strong> ${escapeHtml(r.family?.code || 'N/A')}${r.family?.sector ? ' (' + escapeHtml(r.family.sector) + ' Sector)' : ''}</div>
        <div><strong>Funds:</strong> ${escapeHtml(r.purposeLabel || String(r.purpose || '').replace('_', ' '))}</div>
        ${r.note ? `<div><strong>Note:</strong> “${escapeHtml(r.note)}”</div>` : ''}
      </div>
    </div>
  `;

  const right = `
    <div class="stat-card" style="padding:1rem;">
      <div class="stat-title">Donor</div>
      <div style="margin-top:0.5rem; display:grid; gap:0.4rem;">
        <div><strong>Name:</strong> ${escapeHtml(r.donor?.name || '')}</div>
        <div><strong>Email:</strong> ${escapeHtml(r.donor?.email || '')}</div>
        ${r.donor?.phone ? `<div><strong>Phone:</strong> ${escapeHtml(r.donor.phone)}</div>` : ''}
        <div style="margin-top:0.6rem; font-size: 1.2rem;"><strong>Amount:</strong> ${escapeHtml(formatCurrency(r.amount))}</div>
      </div>
      ${r.providerTransactionId ? `<div class="muted" style="margin-top:0.75rem; font-size:0.85rem;">Flutterwave Tx ID: ${escapeHtml(r.providerTransactionId)}</div>` : ''}
    </div>
  `;

  mount.innerHTML = left + right;
}

document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const txRef = params.get('tx_ref');
  if (!txRef) {
    setAlert('Missing receipt reference. Open a receipt from your donation history.', 'error');
    return;
  }

  try {
    const receipt = await fetchReceipt(txRef);
    renderReceipt(receipt);
  } catch (e) {
    setAlert(e.message || 'Could not load receipt. Please login and try again.', 'error');
  }

  const btn = document.getElementById('printReceipt');
  if (btn) btn.addEventListener('click', () => window.print());

  const pdfBtn = document.getElementById('downloadPdf');
  if (pdfBtn) {
    pdfBtn.addEventListener('click', async () => {
      try {
        await downloadReceiptPdf(txRef);
      } catch (e) {
        setAlert(e.message || 'Could not download PDF. Please login and try again.', 'error');
      }
    });
  }
});
