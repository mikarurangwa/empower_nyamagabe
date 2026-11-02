// Local leader dashboard, plus family review and submission (also used by the admin)

async function loadQueue() {
  const { data } = await api('/families/queue');
  state.queue = data;
}

function reviewButton(f) {
  return `<button type="button" class="btn btn-outline btn-sm" data-review="${f.id}">${f.verification_status === 'pending' ? 'Review' : 'View'}</button>`;
}

function needCell(f) {
  return `${escapeHtml(NEED_LABELS[f.support_type])}<div class="muted">${money(f.need_amount)}</div>`;
}

async function loadLeader() {
  $('leaderSectorLabel').textContent = state.user.sector ? `${state.user.sector} sector` : 'No sector yet';
  try {
    await loadQueue();
  } catch (err) {
    if (err.status === 401) return expiredSession();
    return toast(err.message, 'error');
  }

  const count = (s) => state.queue.filter((f) => f.verification_status === s).length;
  $('leaderPending').textContent = count('pending');
  $('leaderApproved').textContent = count('approved');
  $('leaderRejected').textContent = count('rejected');

  $('leaderFamilies').innerHTML = state.queue.length
    ? state.queue.map((f) => `
        <tr>
          <td><strong>${escapeHtml(f.family_code)}</strong></td>
          <td>${escapeHtml(f.ubudehe_category)}</td>
          <td>${needCell(f)}</td>
          <td>${escapeHtml(f.submitted_by_name || '')}</td>
          <td>${statusBadge(f.verification_status)}</td>
          <td>${reviewButton(f)}</td>
        </tr>`).join('')
    : '<tr><td colspan="6" class="empty">No families in your sector yet.</td></tr>';
}

function openReview(id) {
  const f = state.queue.find((row) => String(row.id) === String(id));
  if (!f) return;
  state.reviewing = f.id;

  const ownSubmission = roleOf(state.user) === 'leader' && Number(f.submitted_by) === Number(state.user.id);
  const canDecide = f.verification_status === 'pending' && !ownSubmission;
  const row = (label, value) =>
    `<div class="detail-row"><span>${label}</span><strong>${escapeHtml(value || '–')}</strong></div>`;

  $('reviewTitle').textContent = `Family ${f.family_code}`;
  $('reviewDetails').innerHTML = [
    row('Head of household', f.name),
    row('Phone', f.phone),
    row('Sector', f.sector),
    row('Cell', f.cell),
    row('Village', f.village),
    row('Ubudehe category', f.ubudehe_category),
    row('Household size', f.household_size),
    row('Need', NEED_LABELS[f.support_type]),
    row('Amount needed', money(f.need_amount)),
    row('Public description', f.need_description),
    row('Notes for reviewer', f.notes),
    row('Submitted by', f.submitted_by_name),
    row('Status', f.verification_status),
    f.verification_status !== 'pending' ? row('Reviewed by', f.verified_by_name) + row('Review notes', f.verification_notes) : '',
    ownSubmission && f.verification_status === 'pending'
      ? '<p class="alert alert-info" style="margin-top:1rem">You submitted this family, so someone else has to review it.</p>'
      : '',
  ].join('');

  $('reviewActions').classList.toggle('hidden', !canDecide);
  $('reviewNotes').value = '';
  $('reviewModal').classList.add('open');
}

async function decide(decision) {
  const notes = $('reviewNotes').value.trim();
  if (decision === 'reject' && notes.length < 5) return toast('Write a short reason for rejecting.', 'error');

  try {
    const res = await post(`/families/${state.reviewing}/verify`, { decision, notes });
    toast(res.message);
    $('reviewModal').classList.remove('open');
    roleOf(state.user) === 'admin' ? loadAdmin() : loadLeader();
    loadFamilies();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function openFamilyForm() {
  const isAdmin = roleOf(state.user) === 'admin';
  $('familySectorField').classList.toggle('hidden', !isAdmin);
  $('familySector').required = isAdmin;
  $('familyModal').classList.add('open');
}

async function submitFamily(e) {
  e.preventDefault();
  const value = (id) => $(id).value.trim();
  try {
    const res = await post('/families/submit', {
      headName: value('familyHeadName'),
      phone: value('familyPhone'),
      sector: value('familySector'),
      cell: value('familyCell'),
      village: value('familyVillage'),
      ubudeheCategory: value('familyUbudehe'),
      householdSize: value('familyHousehold'),
      needType: value('familyNeedType'),
      needAmount: value('familyNeedAmount'),
      needDescription: value('familyNeedDescription'),
      notes: value('familyNotes'),
    });
    toast(res.message);
    $('familyForm').reset();
    $('familyModal').classList.remove('open');
    roleOf(state.user) === 'admin' ? loadAdmin() : loadLeader();
  } catch (err) {
    toast(err.message, 'error');
  }
}

document.getElementById('familyForm').addEventListener('submit', submitFamily);
