// Donation receipt page

const txRef = new URLSearchParams(window.location.search).get('tx_ref');
const pageAlert = document.getElementById('pageAlert');

function row(label, value) {
  return value ? `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>` : '';
}

function renderReceipt(r) {
  const family = r.family.code ? `${r.family.code}, ${r.family.sector} sector` : '';
  document.getElementById('receiptBody').innerHTML = `
    <div class="receipt-grid">
      <div>
        <div class="muted">Amount</div>
        <div class="receipt-total">${money(r.amount)}</div>
        <dl style="margin-top:1rem">
          ${row('Status', r.status)}
          ${row('Date', formatDate(r.date, true))}
          ${row('Family', family)}
          ${row('Paid for', r.purposeLabel)}
          ${row('Note', r.note)}
        </dl>
      </div>
      <dl>
        ${row('Donor', r.donor.name)}
        ${row('Email', r.donor.email)}
        ${row('Phone', r.donor.phone)}
        ${row('Reference', r.txRef)}
        ${row('Flutterwave ID', r.providerTransactionId)}
      </dl>
    </div>`;
}

async function loadReceipt() {
  if (!txRef) {
    showMessage(pageAlert, 'This link is missing the donation reference. Open the receipt from your donation history.');
    return;
  }
  try {
    const { receipt } = await api(`/donations/receipt/${encodeURIComponent(txRef)}`);
    renderReceipt(receipt);
  } catch (err) {
    showMessage(pageAlert, err.status === 401 ? 'Log in to see this receipt.' : err.message);
  }
}

document.getElementById('printReceipt').addEventListener('click', () => window.print());
document.getElementById('downloadReceipt').addEventListener('click', () => {
  download(`/donations/receipt/${encodeURIComponent(txRef)}/pdf`, `receipt-${txRef}.pdf`)
    .catch((err) => showMessage(pageAlert, err.message));
});

loadReceipt();
