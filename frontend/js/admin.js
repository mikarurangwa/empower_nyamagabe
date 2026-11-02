// Admin dashboard: families, donations, leaders, reports and audit log

function renderAdminFamilies() {
  $('adminFamilies').innerHTML = state.queue.length
    ? state.queue.map((f) => `
        <tr>
          <td><strong>${escapeHtml(f.family_code)}</strong></td>
          <td>${escapeHtml(f.sector)}</td>
          <td>${escapeHtml(f.ubudehe_category)}</td>
          <td>${needCell(f)}</td>
          <td>${f.verification_status === 'approved' ? money(f.funded) : '–'}</td>
          <td>${statusBadge(f.verification_status)}</td>
          <td>${reviewButton(f)}</td>
        </tr>`).join('')
    : '<tr><td colspan="7" class="empty">No families submitted yet.</td></tr>';

  const pending = state.queue.filter((f) => f.verification_status === 'pending');
  $('adminPendingList').innerHTML = pending.length
    ? pending.map((f) => `<tr><td><strong>${escapeHtml(f.family_code)}</strong></td><td>${escapeHtml(f.sector)}</td><td>${reviewButton(f)}</td></tr>`).join('')
    : '<tr><td colspan="3" class="empty">Nothing to review.</td></tr>';
}

function renderAdminDonations(rows) {
  const html = rows.length
    ? rows.map((d) => `
        <tr>
          <td>${escapeHtml(d.donor_name)}${d.is_anonymous ? ' <span class="muted">(anonymous)</span>' : ''}</td>
          <td>${escapeHtml(d.family_code || '–')}</td>
          <td>${money(d.amount)}</td>
          <td>${escapeHtml(NEED_LABELS[d.purpose] || d.purpose)}</td>
          <td>${formatDate(d.created_at)}</td>
          <td>${statusBadge(d.status)}</td>
        </tr>`).join('')
    : '<tr><td colspan="6" class="empty">No donations yet.</td></tr>';
  document.querySelectorAll('[data-admin-donations]').forEach((el) => { el.innerHTML = html; });
}

function renderLeaders(rows) {
  $('leadersList').innerHTML = rows.length
    ? rows.map((l) => `
        <tr>
          <td>${escapeHtml(l.name)}</td>
          <td>${escapeHtml(l.sector)}</td>
          <td>${escapeHtml(l.phone || l.email || '–')}</td>
          <td>${l.submitted}</td>
          <td>${l.decided}</td>
        </tr>`).join('')
    : '<tr><td colspan="5" class="empty">No leader accounts yet.</td></tr>';
}

function renderReport(r) {
  const stat = (label, value) => `<div class="stat" style="background:var(--mist)"><span>${label}</span><b>${value}</b></div>`;
  const total = r.byPurpose.reduce((sum, p) => sum + p.total, 0) || 1;
  const bars = r.byPurpose.map((p) => {
    const pct = Math.round((p.total / total) * 100);
    return `
      <div class="bar-row">
        <div><strong>${escapeHtml(NEED_LABELS[p.purpose] || p.purpose)}</strong><span>${money(p.total)} (${pct}%)</span></div>
        <div class="progress"><span style="width:${Math.max(2, pct)}%"></span></div>
      </div>`;
  }).join('') || '<p class="muted">No completed donations yet.</p>';

  const statusRows = r.byStatus.map((s) => `<tr><td>${statusBadge(s.status)}</td><td>${s.count}</td><td>${money(s.total)}</td></tr>`).join('')
    || '<tr><td colspan="3" class="empty">No donations yet.</td></tr>';

  $('reportBox').innerHTML = `
    <div class="stats">
      ${stat('Raised', money(r.totalRaised))}
      ${stat('Completed donations', r.donationCount)}
      ${stat('Donors', r.donorCount)}
      ${stat('Verified families', r.verifiedFamilies)}
      ${stat('Fully funded', r.fullyFundedFamilies)}
      ${stat('Still needed', money(r.stillNeeded))}
    </div>
    <h3 style="margin:1.5rem 0 .5rem">By need</h3>${bars}
    <h3 style="margin:1.5rem 0 .75rem">By payment status</h3>
    <div class="table-wrap"><table><thead><tr><th>Status</th><th>Count</th><th>Amount</th></tr></thead><tbody>${statusRows}</tbody></table></div>`;
}

async function loadAudit() {
  const { data } = await api('/admin/audit-logs');
  $('auditList').innerHTML = data.length
    ? data.map((a) => `
        <tr>
          <td>${formatDate(a.created_at, true)}</td>
          <td>${escapeHtml(a.actor_name || 'System')}</td>
          <td>${escapeHtml(a.action.replace(/_/g, ' '))}</td>
          <td>${escapeHtml(a.entity_type || '')} ${escapeHtml(a.entity_id || '')}</td>
          <td style="max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(a.details || '')}</td>
        </tr>`).join('')
    : '<tr><td colspan="5" class="empty">Nothing logged yet.</td></tr>';
}

async function loadAdmin() {
  try {
    const [donations, report, leaders] = await Promise.all([
      api('/donations/all'),
      api('/admin/reports/summary'),
      api('/admin/leaders'),
      loadQueue(),
    ]);
    renderAdminFamilies();
    renderAdminDonations(donations.data);
    renderLeaders(leaders.data);
    renderReport(report.data);

    $('adminTotal').textContent = money(report.data.totalRaised);
    $('adminVerified').textContent = report.data.verifiedFamilies;
    $('adminPending').textContent = report.data.pendingFamilies;
    await loadAudit();
  } catch (err) {
    if (err.status === 401) return expiredSession();
    toast(err.message, 'error');
  }
}

async function createLeader(e) {
  e.preventDefault();
  const value = (id) => $(id).value.trim();
  try {
    const res = await post('/admin/leaders', {
      name: value('leaderName'),
      sector: value('leaderSector'),
      phone: value('leaderPhone'),
      email: value('leaderEmail'),
      password: $('leaderPassword').value,
    });
    toast(res.message);
    $('leaderForm').reset();
    loadAdmin();
  } catch (err) {
    toast(err.message, 'error');
  }
}

document.getElementById('leaderForm').addEventListener('submit', createLeader);
