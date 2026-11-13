// Donor dashboard: choosing a family, donating and donation history

function chooseFamily(id) {
  const family = state.families.find((f) => String(f.id) === String(id));
  if (!family) return;

  if (!state.user) {
    sessionStorage.setItem('en_family', family.id);
    window.location.href = '/login?next=dashboard';
    return;
  }
  if (!$('donorDash').classList.contains('visible')) {
    document.body.classList.add('in-dashboard');
    $('donorDash').classList.add('visible');
    loadDonor();
  }

  $('donationFamilyId').value = family.id;
  const box = $('chosenFamily');
  box.className = 'chosen';
  box.innerHTML = `
    ${icon('people-roof')}
    <div>
      <strong>${escapeHtml(family.familyCode)}, ${escapeHtml(NEED_LABELS[family.needType])}</strong>
      <div class="muted">${escapeHtml(family.description)}</div>
      <div class="muted">${money(family.remaining)} still needed in ${escapeHtml(family.sector)} sector</div>
    </div>`;
  $('donationAmount').max = family.remaining;
  $('donationAmount').value = '';
  document.querySelectorAll('.amount-btn').forEach((btn) => {
    btn.classList.remove('active');
    btn.disabled = Number(btn.dataset.amount) > family.remaining;
  });
  $('amountHint').textContent = `Between 100 and ${family.remaining.toLocaleString('en-US')} RWF.`;
  showView($('donorDash'), 'donor-give');
  window.scrollTo(0, 0);
}

function donationRow(d) {
  const receipt = d.status === 'completed'
    ? `<a class="btn btn-outline btn-sm" href="/receipt?tx_ref=${encodeURIComponent(d.transaction_id)}">Receipt</a>`
    : '';
  return `
    <div class="donation">
      <div>
        <b>${money(d.amount)}</b>
        <div class="muted">${escapeHtml(d.family_code || '')} ${escapeHtml(NEED_LABELS[d.purpose] || d.purpose)}, ${formatDate(d.created_at)}</div>
        ${d.note ? `<div class="muted">"${escapeHtml(d.note)}"</div>` : ''}
        <div class="ref">Ref ${escapeHtml(d.transaction_id)}</div>
      </div>
      <div class="donation-side">${statusBadge(d.status)}${receipt}</div>
    </div>`;
}

async function loadDonor() {
  await loadFamilies();
  try {
    const [history, totals] = await Promise.all([
      api(`/donations/user/${state.user.id}`),
      api(`/donations/totals/${state.user.id}`),
    ]);
    const rows = history.data;
    $('donationHistory').innerHTML = rows.length
      ? rows.map(donationRow).join('')
      : '<p class="empty-state">You haven\'t made a donation yet.</p>';
    $('recentDonations').innerHTML = rows.length
      ? rows.slice(0, 4).map(donationRow).join('')
      : '<p class="empty-state">Your donations will show up here.</p>';

    $('donorTotal').textContent = money(totals.data.totalDonated);
    $('donorCount').textContent = totals.data.donationCount;
    $('donorFamilies').textContent = totals.data.familiesHelped;
  } catch (err) {
    if (err.status === 401) return expiredSession();
    toast(err.message, 'error');
  }

  // A family picked before logging in
  const pending = sessionStorage.getItem('en_family');
  if (pending) {
    sessionStorage.removeItem('en_family');
    chooseFamily(pending);
  }
}

function setPaymentStatus(html, type) {
  const el = $('paymentStatus');
  el.className = type;
  el.innerHTML = html;
}

async function checkPayment(txRef) {
  const { status } = await api(`/donations/status/${encodeURIComponent(txRef)}`);
  if (status === 'completed') setPaymentStatus(`Payment confirmed. Reference ${escapeHtml(txRef)}`, 'success');
  else if (status === 'failed') setPaymentStatus(`The payment failed or was cancelled. Reference ${escapeHtml(txRef)}`, 'error');
  return status;
}

// Keeps checking for up to two minutes while the donor pays in the other tab
function watchPayment(txRef) {
  const started = Date.now();
  const tick = async () => {
    if (Date.now() - started > 120000) return;
    try {
      const status = await checkPayment(txRef);
      if (status !== 'pending') return loadDonor();
    } catch (err) {
      // try again on the next tick
    }
    setTimeout(tick, 4000);
  };
  setTimeout(tick, 4000);
}

async function submitDonation(e) {
  e.preventDefault();
  const familyId = $('donationFamilyId').value;
  const amount = Number($('donationAmount').value);
  const paymentMethod = $('paymentMethod').value;

  if (!familyId) return setPaymentStatus('Choose a family first.', 'error');
  if (!amount || amount < 100) return setPaymentStatus('The minimum donation is 100 RWF.', 'error');
  if (!paymentMethod) return setPaymentStatus('Choose how you want to pay.', 'error');

  const button = $('donateButton');
  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span> Opening checkout…';

  // Open the tab right away so the browser doesn't block it as a popup
  const checkout = window.open('', '_blank');

  try {
    const { paymentLink, donation } = await post('/donations/create', {
      familyId: Number(familyId),
      amount,
      paymentMethod,
      paymentDetails: { phoneNumber: $('momoPhone').value.trim() },
      note: $('donationNote').value.trim(),
      isAnonymous: $('donationAnonymous').checked,
    });

    if (checkout) checkout.location.href = paymentLink;
    setPaymentStatus(`
      <strong>Finish paying in the Flutterwave tab.</strong>
      <div>This page updates once the payment is confirmed. Reference ${escapeHtml(donation.txRef)}</div>
      <div class="btn-row">
        <a class="btn btn-outline btn-sm" href="${escapeHtml(paymentLink)}" target="_blank" rel="noopener">Open checkout again</a>
        <button type="button" class="btn btn-primary btn-sm" data-check-payment="${escapeHtml(donation.txRef)}">Check payment</button>
      </div>`, 'processing');
    watchPayment(donation.txRef);
  } catch (err) {
    if (checkout) checkout.close();
    setPaymentStatus(escapeHtml(err.message), 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Donate';
  }
}

document.getElementById('donationForm').addEventListener('submit', submitDonation);

document.getElementById('paymentMethod').addEventListener('change', (e) => {
  $('momoBox').classList.toggle('hidden', e.target.value !== 'mobile_money');
  $('cardBox').classList.toggle('hidden', e.target.value !== 'credit_card');
});

document.querySelectorAll('.amount-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.amount-btn').forEach((b) => b.classList.toggle('active', b === btn));
    $('donationAmount').value = btn.dataset.amount;
  });
});

document.getElementById('donationAmount').addEventListener('input', () => {
  document.querySelectorAll('.amount-btn').forEach((b) => b.classList.remove('active'));
});
