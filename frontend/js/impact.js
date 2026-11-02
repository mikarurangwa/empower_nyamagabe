// Public impact page

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function renderByNeed(rows) {
  const box = document.getElementById('byNeed');
  if (!rows.length) {
    box.innerHTML = '<p class="muted">No completed donations yet.</p>';
    return;
  }
  const total = rows.reduce((sum, r) => sum + r.total, 0);
  box.innerHTML = rows.map((r) => {
    const pct = Math.round((r.total / total) * 100);
    return `
      <div class="bar-row">
        <div><strong>${escapeHtml(NEED_LABELS[r.purpose] || r.purpose)}</strong><span>${money(r.total)} (${pct}%)</span></div>
        <div class="progress"><span style="width:${Math.max(2, pct)}%"></span></div>
      </div>`;
  }).join('');
}

async function loadImpact() {
  try {
    const { data } = await api('/public/impact');
    const set = (id, text) => { document.getElementById(id).textContent = text; };

    set('totalRaised', money(data.totalRaised));
    set('donationCount', `from ${plural(data.donationCount, 'donation')} by ${plural(data.donorCount, 'donor')}`);
    set('verifiedFamilies', data.verifiedFamilies);
    set('familiesHelped', `${data.familiesHelped} received support, ${data.fullyFundedFamilies} fully funded`);
    set('stillNeeded', money(data.stillNeeded));
    set('totalNeed', `out of ${money(data.totalNeed)} in total`);
    set('updatedAt', `Figures as of ${formatDate(data.updatedAt, true)}`);
    renderByNeed(data.byPurpose);
  } catch (err) {
    showMessage(document.getElementById('pageAlert'), err.message);
  }
}

loadImpact();
