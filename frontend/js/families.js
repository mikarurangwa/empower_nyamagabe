// Verified families: cards on the home page and in the donor dashboard

function familyCard(f) {
  const pct = f.needAmount > 0 ? Math.min(100, Math.round((f.funded / f.needAmount) * 100)) : 0;
  const done = f.remaining <= 0;
  const needIcon = f.needType === 'health' ? 'heart-pulse' : 'book-open';

  return `
    <article class="family-card">
      <div class="family-top">
        <span class="tag ${escapeHtml(f.needType)}">${icon(needIcon)}${escapeHtml(NEED_LABELS[f.needType])}</span>
        <span class="family-code">${escapeHtml(f.familyCode)}</span>
      </div>
      <p class="family-desc">${escapeHtml(f.description)}</p>
      <div class="family-meta">
        <span>${icon('location-dot')}${escapeHtml(f.sector)} sector</span>
        <span>Ubudehe ${escapeHtml(f.ubudeheCategory)}</span>
        <span class="verified">${icon('circle-check')}Verified</span>
      </div>
      <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
      <div class="family-amounts"><strong>${money(f.funded)}</strong> raised of ${money(f.needAmount)}</div>
      ${done
        ? '<button type="button" class="btn btn-outline btn-block" disabled>Fully funded</button>'
        : `<button type="button" class="btn btn-primary btn-block" data-donate="${f.id}">Donate to this family</button>`}
    </article>`;
}

function renderFamilies(mountId, filter) {
  const list = state.families.filter((f) => filter === 'all' || f.needType === filter);
  $(mountId).innerHTML = list.length
    ? list.map(familyCard).join('')
    : '<p class="empty-state">No families to show here yet. They appear once a local leader has verified them.</p>';
}

function renderOverviewFamilies() {
  const open = state.families.filter((f) => f.remaining > 0).slice(0, 4);
  $('overviewFamilies').innerHTML = open.length
    ? open.map((f) => `
        <div class="mini-family">
          <div>
            <strong>${escapeHtml(f.familyCode)}</strong>, ${escapeHtml(NEED_LABELS[f.needType])}
            <div class="muted">${money(f.remaining)} still needed in ${escapeHtml(f.sector)}</div>
          </div>
          <button type="button" class="btn btn-primary btn-sm" data-donate="${f.id}">Donate</button>
        </div>`).join('')
    : '<p class="empty-state">Every listed family is fully funded right now.</p>';
}

async function loadFamilies() {
  try {
    const { data } = await api('/families/verified');
    state.families = data;
  } catch (err) {
    state.families = [];
  }
  renderFamilies('landingFamilies', state.landingFilter);
  renderFamilies('dashFamilies', state.dashFilter);
  renderOverviewFamilies();
}
