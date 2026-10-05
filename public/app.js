// Empower Nyamagabe — front-end logic (kept as an external file to satisfy the Helmet CSP).
'use strict';

// ---- State -------------------------------------------------------------------
let currentUser = null;
let userRole = 'donor';          // 'donor' | 'leader' | 'admin'
let authToken = null;
let appConfig = { testMode: true, paymentsConfigured: false };
let publicFamilies = [];
let landingFilter = 'all';
let dashFilter = 'all';
let queueRows = [];
let reviewingId = null;

const NEED_LABELS = { health: 'Mutuelle de Santé', education: 'School fees' };
const NEED_ICONS = { health: 'fa-shield-heart', education: 'fa-book-open' };

const API_BASE = (() => {
    // If you opened this HTML via file:// or a separate dev server (e.g. VS Code Live Server),
    // API calls will not reach the Node backend. In those cases, default to localhost:3000.
    const isFile = window.location.protocol === 'file:';
    const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const backendPort = '3000';
    if (isFile) return `http://localhost:${backendPort}/api`;
    if (isLocalhost && window.location.port && window.location.port !== backendPort) {
        return `http://localhost:${backendPort}/api`;
    }
    return '/api';
})();

// ---- Session (persists across refresh and payment redirects) ------------------
function saveSession() {
    try {
        if (currentUser) {
            localStorage.setItem('en_currentUser', JSON.stringify(currentUser));
            localStorage.setItem('en_role', userRole);
        }
    } catch (e) { /* ignore */ }
}

function loadSession() {
    try {
        const raw = localStorage.getItem('en_currentUser');
        if (raw) {
            currentUser = JSON.parse(raw);
            userRole = localStorage.getItem('en_role') || currentUser.role || 'donor';
            authToken = localStorage.getItem('en_token') || null;
        }
    } catch (e) {
        currentUser = null; userRole = 'donor'; authToken = null;
    }
}

function clearSession() {
    try {
        ['en_currentUser', 'en_role', 'en_token', 'en_isAdmin'].forEach((k) => localStorage.removeItem(k));
    } catch (e) { /* ignore */ }
}

// ---- Utilities -----------------------------------------------------------------
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function showModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.style.display = 'block';
}

function hideModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.style.display = 'none';
}

function showAlert(message, type = 'success') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;
    const mount = document.getElementById('toastMount') || document.querySelector('.container');
    if (!mount) return;
    mount.appendChild(alertDiv);
    alertDiv.addEventListener('click', () => alertDiv.remove());
    setTimeout(() => { if (alertDiv.parentNode) alertDiv.remove(); }, 6000);
}

function formatCurrency(amount) {
    return 'RWF ' + new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(amount || 0));
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getStatusColors(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'completed' || s === 'approved') return { bg: '#d4edda', color: '#155724' };
    if (s === 'pending') return { bg: '#fff3cd', color: '#856404' };
    if (s === 'failed' || s === 'cancelled' || s === 'rejected') return { bg: '#f8d7da', color: '#721c24' };
    return { bg: '#e2e3e5', color: '#383d41' };
}

function statusPill(status) {
    const c = getStatusColors(status);
    return `<span class="pill" style="background:${c.bg};color:${c.color};">${escapeHtml(status)}</span>`;
}

// Surfaces the server's own message (e.g. "This need only has 5,000 RWF remaining") instead of a generic error.
async function apiCall(endpoint, options = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    Object.assign(headers, options.headers || {});
    let response;
    try {
        response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    } catch (error) {
        showAlert('Could not reach the server. Please check your connection.', 'error');
        throw error;
    }
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
        showAlert('Your session has expired. Please log in again.', 'error');
        logout(false);
        throw new Error('Unauthorized');
    }
    if (!response.ok || data.success === false) {
        const msg = data.message || `Request failed (${response.status})`;
        const err = new Error(msg);
        err.serverMessage = msg;
        throw err;
    }
    return data;
}

async function loadConfig() {
    try {
        const res = await fetch(`${API_BASE}/config`);
        const data = await res.json();
        if (data && data.success) appConfig = data;
    } catch (_) { /* keep defaults */ }
    const show = !!appConfig.testMode;
    document.querySelectorAll('#pilotBanner, [data-pilot-banner]').forEach((el) => { el.hidden = !show; });
}

function logout(announce = true) {
    currentUser = null; userRole = 'donor'; authToken = null;
    clearSession();
    updateUI();
    showMainContent();
    if (announce) showAlert('You have been logged out successfully.');
}

// ---- Which screen is showing ------------------------------------------------------
function updateUI() {
    const authButtons = document.querySelectorAll('#loginBtn, #signupBtn');
    const userButtons = document.querySelectorAll('#dashboardBtn, #logoutBtn');
    authButtons.forEach((b) => b.classList.toggle('hidden', !!currentUser));
    userButtons.forEach((b) => b.classList.toggle('hidden', !currentUser));

    const mobileGuest = document.getElementById('mobileAuthGuest');
    const mobileUser = document.getElementById('mobileAuthUser');
    if (mobileGuest && mobileUser) {
        mobileGuest.classList.toggle('hidden', !!currentUser);
        mobileUser.classList.toggle('hidden', !currentUser);
    }
    const nameEl = document.getElementById('dashUserName');
    if (nameEl) nameEl.textContent = (currentUser && currentUser.name) || 'Donor';
}

const DASHBOARD_IDS = ['userDashboard', 'leaderDashboard', 'adminDashboard'];

function showOnlyDashboard(id) {
    document.body.classList.add('in-dashboard');
    document.getElementById('mainContent').style.display = 'none';
    DASHBOARD_IDS.forEach((d) => document.getElementById(d).classList.toggle('visible', d === id));
}

function showMainContent() {
    document.body.classList.remove('in-dashboard');
    document.getElementById('mainContent').style.display = 'block';
    DASHBOARD_IDS.forEach((d) => document.getElementById(d).classList.remove('visible'));
}

function showUserDashboard() {
    showOnlyDashboard('userDashboard');
    setActiveDashboardTab('user', 'user-overview');
    loadUserData();
}

function showLeaderDashboard() {
    showOnlyDashboard('leaderDashboard');
    setActiveDashboardTab('leader', 'leader-queue');
    const n = document.getElementById('leaderUserName');
    if (n && currentUser) n.textContent = currentUser.name;
    const c = document.getElementById('leaderSectorChip');
    if (c && currentUser) c.textContent = currentUser.sector || 'No sector assigned';
    loadLeaderData();
}

function showAdminDashboard() {
    showOnlyDashboard('adminDashboard');
    setActiveDashboardTab('admin', 'admin-overview');
    loadAdminData();
}

// Opens the right dashboard for whoever is logged in
function openMyDashboard() {
    if (!currentUser) { window.location.href = '/login?next=dashboard'; return; }
    if (userRole === 'admin') showAdminDashboard();
    else if (userRole === 'leader') showLeaderDashboard();
    else showUserDashboard();
}

// ---- Verified families (public list, shown to donors) -----------------------------
async function loadPublicFamilies() {
    try {
        const res = await fetch(`${API_BASE}/families/verified`);
        const data = await res.json();
        publicFamilies = (data && data.data) || [];
    } catch (_) {
        publicFamilies = [];
    }
    renderLandingFamilies();
    renderDashFamilies();
    renderOverviewFamilies();
}

function familyCardHtml(f) {
    const pct = f.needAmount > 0 ? Math.min(100, Math.round((f.funded / f.needAmount) * 100)) : 0;
    const full = f.remaining <= 0;
    const icon = NEED_ICONS[f.needType] || 'fa-hand-holding-heart';
    return `
        <article class="family-card">
            <div class="family-card-top">
                <span class="family-need ${escapeHtml(f.needType)}"><i class="fas ${icon}"></i> ${escapeHtml(NEED_LABELS[f.needType] || f.needType)}</span>
                <span class="family-code">${escapeHtml(f.familyCode)}</span>
            </div>
            <p class="family-desc">${escapeHtml(f.description)}</p>
            <div class="family-meta">
                <span><i class="fas fa-location-dot"></i> ${escapeHtml(f.sector)} Sector</span>
                <span><i class="fas fa-layer-group"></i> Ubudehe category ${escapeHtml(f.ubudeheCategory)}</span>
                <span class="verified-badge"><i class="fas fa-circle-check"></i> Verified by local leaders</span>
            </div>
            <div class="family-progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div class="family-progress-bar" style="width:${pct}%"></div></div>
            <div class="family-amounts"><strong>${escapeHtml(formatCurrency(f.funded))}</strong> of ${escapeHtml(formatCurrency(f.needAmount))} <span class="muted">(${pct}%)</span></div>
            ${full
                ? '<button type="button" class="btn btn-secondary btn-full" disabled><i class="fas fa-circle-check"></i> Fully funded</button>'
                : `<button type="button" class="btn btn-primary btn-full" data-donate-family="${escapeHtml(f.id)}"><i class="fas fa-hand-holding-heart"></i> Support this family</button>`}
        </article>`;
}

function filteredFamilies(filter) {
    return publicFamilies.filter((f) => filter === 'all' || f.needType === filter);
}

function renderLandingFamilies() {
    const mount = document.getElementById('publicFamilyGrid');
    if (!mount) return;
    const list = filteredFamilies(landingFilter);
    mount.innerHTML = list.length
        ? list.map(familyCardHtml).join('')
        : '<div class="empty-state"><i class="fas fa-people-roof"></i><p>No verified families to show yet. Families appear here only after local leaders have verified them.</p></div>';
}

function renderDashFamilies() {
    const mount = document.getElementById('dashFamilyGrid');
    if (!mount) return;
    const list = filteredFamilies(dashFilter);
    mount.innerHTML = list.length
        ? list.map(familyCardHtml).join('')
        : '<div class="empty-state"><i class="fas fa-people-roof"></i><p>No verified families to show yet.</p></div>';
}

function renderOverviewFamilies() {
    const mount = document.getElementById('overviewFamiliesMount');
    if (!mount) return;
    const open = publicFamilies.filter((f) => f.remaining > 0).slice(0, 3);
    if (!open.length) {
        mount.innerHTML = '<div class="empty-state"><i class="fas fa-people-roof"></i><p>No families currently need funding.</p></div>';
        return;
    }
    mount.innerHTML = open.map((f) => `
        <div class="mini-family">
            <div><strong>${escapeHtml(f.familyCode)}</strong> · ${escapeHtml(NEED_LABELS[f.needType])}<div class="muted">${escapeHtml(formatCurrency(f.remaining))} still needed · ${escapeHtml(f.sector)}</div></div>
            <button type="button" class="btn btn-primary" data-donate-family="${escapeHtml(f.id)}">Give</button>
        </div>`).join('') +
        '<button type="button" class="btn btn-secondary btn-full" id="seeAllFamiliesBtn" style="margin-top:.75rem;">See all verified families</button>';
}

// Called when someone chooses "Support this family"
function chooseFamily(id) {
    const f = publicFamilies.find((x) => String(x.id) === String(id));
    if (!f) return;
    if (!currentUser) {
        try { sessionStorage.setItem('en_pending_family', String(f.id)); } catch (_) {}
        window.location.href = '/login?next=dashboard';
        return;
    }
    if (userRole !== 'donor' && userRole !== 'admin' && userRole !== 'leader') return;
    if (!document.getElementById('userDashboard').classList.contains('visible')) {
        showOnlyDashboard('userDashboard');
        loadUserData();
    }
    applySelectedFamily(f);
    setActiveDashboardTab('user', 'user-donate');
}

function applySelectedFamily(f) {
    document.getElementById('donationFamilyId').value = f.id;
    const box = document.getElementById('selectedFamilyBox');
    box.className = 'selected-family';
    box.innerHTML = `
        <i class="fas ${NEED_ICONS[f.needType] || 'fa-people-roof'}"></i>
        <div>
            <strong>${escapeHtml(f.familyCode)} · ${escapeHtml(NEED_LABELS[f.needType])}</strong>
            <div class="muted">${escapeHtml(f.description)}</div>
            <div class="muted">${escapeHtml(f.sector)} Sector · ${escapeHtml(formatCurrency(f.remaining))} still needed</div>
        </div>`;
    const amt = document.getElementById('donationAmount');
    amt.max = f.remaining;
    document.getElementById('amountHelper').textContent = `Minimum 1,000 RWF. Maximum ${new Intl.NumberFormat('en-RW').format(f.remaining)} RWF (what this need still requires).`;
}

// ---- Donor data -------------------------------------------------------------------
async function loadUserData() {
    if (!currentUser) return;
    try {
        await loadPublicFamilies();
        const donations = await apiCall(`/donations/user/${currentUser.id}`);
        const list = donations.data || [];
        displayDonationHistory(list);

        const impact = await apiCall(`/impact/user/${currentUser.id}`);
        const impactData = impact.data || {};
        displayImpactSummary(impactData);
        updateUserStats(impactData, list);

        const nameEl = document.getElementById('dashUserName');
        if (nameEl && currentUser.name) nameEl.textContent = currentUser.name;
        syncDashboardClones();

        // Pick up a family the person chose before they logged in
        let pending = null;
        try { pending = sessionStorage.getItem('en_pending_family'); sessionStorage.removeItem('en_pending_family'); } catch (_) {}
        if (pending) chooseFamily(pending);
    } catch (error) {
        console.error('Failed to load user data:', error);
    }
}

function displayDonationHistory(donations) {
    const historyDiv = document.getElementById('donationHistory');
    if (!historyDiv) return;

    if (!donations || donations.length === 0) {
        historyDiv.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>No donations yet. Choose a verified family to get started.</p></div>';
        syncDashboardClones();
        return;
    }

    historyDiv.innerHTML = donations
        .slice()
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .map((d) => {
            const status = (d.status || 'pending').toLowerCase();
            const statusClass = status.includes('pending') ? 'pending' : (status.includes('fail') ? 'failed' : '');
            const receiptLink = status === 'completed'
                ? `<a class="btn btn-secondary" style="margin-left:0.6rem; padding:0.35rem 0.55rem; font-size:0.85rem;" href="/receipt.html?tx_ref=${encodeURIComponent(d.transaction_id)}"><i class="fas fa-receipt"></i> Receipt</a>`
                : '';
            const chip = Number(d.is_anonymous || 0) === 1 ? '<span class="chip">Anonymous</span>' : '';
            const trace = d.family_code
                ? `Family <strong>${escapeHtml(d.family_code)}</strong> · ${escapeHtml(NEED_LABELS[d.purpose] || d.purpose)}${d.family_sector ? ' · ' + escapeHtml(d.family_sector) + ' Sector' : ''}`
                : escapeHtml(NEED_LABELS[d.purpose] || d.purpose || '');
            return `
                <div class="donation-item">
                    <div class="left">
                        <div class="amount">${escapeHtml(formatCurrency(d.amount))}</div>
                        <div class="meta">${trace} • ${escapeHtml(formatDate(d.created_at))} ${chip}</div>
                        <div class="meta trace-ref">Ref: ${escapeHtml(d.transaction_id || '')}</div>
                        ${d.note ? `<div class="meta" style="margin-top:0.15rem; color:#6b7280;">“${escapeHtml(d.note)}”</div>` : ''}
                    </div>
                    <div style="display:flex; align-items:center; gap:0.5rem; justify-content:flex-end;">
                        <div class="status ${statusClass}">${escapeHtml(status)}</div>
                        ${receiptLink}
                    </div>
                </div>`;
        }).join('');
    syncDashboardClones();
}

function displayImpactSummary(impact) {
    const impactDiv = document.getElementById('impactSummary');
    if (!impactDiv) return;
    if (!impact || !impact.totalDonated) {
        impactDiv.innerHTML = '<div class="empty-state"><i class="fas fa-chart-line"></i><p>Your impact summary will appear here after your first completed donation.</p></div>';
        return;
    }
    impactDiv.innerHTML = `
        <div style="text-align:center;">
            <div style="font-size:2rem;font-weight:900;color:#0f2c1a;margin-bottom:.35rem;">${escapeHtml(formatCurrency(impact.totalDonated))}</div>
            <div style="color:#6b7280;margin-bottom:1.25rem;">Total contributed</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.9rem;">
                <div class="stat-card" style="box-shadow:none;border-radius:18px;"><div class="stat-icon"><i class="fas fa-people-group"></i></div><div class="stat-meta"><div class="stat-label">Families supported</div><div class="stat-value">${escapeHtml(impact.familiesHelped || 0)}</div></div></div>
                <div class="stat-card" style="box-shadow:none;border-radius:18px;"><div class="stat-icon"><i class="fas fa-receipt"></i></div><div class="stat-meta"><div class="stat-label">Donations</div><div class="stat-value">${escapeHtml(impact.donationCount || 0)}</div></div></div>
            </div>
        </div>`;
}

function updateUserStats(impact, donations) {
    const total = document.getElementById('userTotalDonated');
    const count = document.getElementById('userDonationCount');
    const fam = document.getElementById('userLivesImpacted');
    if (total) total.textContent = formatCurrency(impact.totalDonated || 0);
    if (count) count.textContent = impact.donationCount || 0;
    if (fam) fam.textContent = impact.familiesHelped || 0;
}

// ---- Leader & admin: families and verification -------------------------------------
async function loadQueue() {
    const res = await apiCall('/families/queue');
    queueRows = res.data || [];
    return queueRows;
}

function familyRowActions(f, label) {
    return `<button type="button" class="btn btn-outline btn-sm" data-review-family="${escapeHtml(f.id)}">${label}</button>`;
}

function renderLeaderQueue() {
    const tbody = document.getElementById('leaderFamiliesList');
    if (!tbody) return;
    const count = (s) => queueRows.filter((r) => r.verification_status === s).length;
    document.getElementById('leaderPendingCount').textContent = count('pending');
    document.getElementById('leaderApprovedCount').textContent = count('approved');
    document.getElementById('leaderRejectedCount').textContent = count('rejected');

    if (!queueRows.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No families in your sector yet. Use “Submit a Family” to add one.</td></tr>';
        return;
    }
    tbody.innerHTML = queueRows.map((f) => `
        <tr>
            <td><strong>${escapeHtml(f.family_code)}</strong></td>
            <td>${escapeHtml(f.ubudehe_category)}</td>
            <td>${escapeHtml(NEED_LABELS[f.support_type] || f.support_type)}<div class="muted">${escapeHtml(formatCurrency(f.need_amount))}</div></td>
            <td>${escapeHtml(f.submitted_by_name || '—')}</td>
            <td>${statusPill(f.verification_status)}</td>
            <td>${familyRowActions(f, f.verification_status === 'pending' ? 'Review' : 'View')}</td>
        </tr>`).join('');
}

function renderAdminFamilies() {
    const tbody = document.getElementById('adminFamiliesList');
    if (tbody) {
        tbody.innerHTML = queueRows.length ? queueRows.map((f) => `
            <tr>
                <td><strong>${escapeHtml(f.family_code)}</strong></td>
                <td>${escapeHtml(f.sector)}</td>
                <td>${escapeHtml(f.ubudehe_category)}</td>
                <td>${escapeHtml(NEED_LABELS[f.support_type] || f.support_type)}<div class="muted">${escapeHtml(formatCurrency(f.need_amount))}</div></td>
                <td>${f.verification_status === 'approved' ? escapeHtml(formatCurrency(f.funded)) : '—'}</td>
                <td>${statusPill(f.verification_status)}</td>
                <td>${familyRowActions(f, f.verification_status === 'pending' ? 'Review' : 'View')}</td>
            </tr>`).join('')
            : '<tr><td colspan="7" class="table-empty">No families submitted yet</td></tr>';
    }
    const pend = document.getElementById('adminPendingList');
    if (pend) {
        const rows = queueRows.filter((f) => f.verification_status === 'pending');
        pend.innerHTML = rows.length ? rows.map((f) => `
            <tr><td><strong>${escapeHtml(f.family_code)}</strong></td><td>${escapeHtml(f.sector)}</td><td>${escapeHtml(NEED_LABELS[f.support_type] || f.support_type)}</td><td>${familyRowActions(f, 'Review')}</td></tr>`).join('')
            : '<tr><td colspan="4" class="table-empty">Nothing waiting</td></tr>';
    }
}

async function loadLeaderData() {
    try {
        await loadQueue();
        renderLeaderQueue();
    } catch (e) {
        showAlert(e.serverMessage || 'Could not load families', 'error');
    }
}

function openReview(id) {
    const f = queueRows.find((r) => String(r.id) === String(id));
    if (!f) return;
    reviewingId = f.id;
    const mine = currentUser && Number(f.submitted_by) === Number(currentUser.id);
    const canDecide = f.verification_status === 'pending' && !(userRole === 'leader' && mine);
    const row = (k, v) => `<div class="verify-row"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v || '—')}</strong></div>`;
    document.getElementById('verifyModalTitle').textContent = `Review ${f.family_code}`;
    document.getElementById('verifyDetails').innerHTML =
        '<p class="muted" style="margin-top:0;">Private details. Do not share outside the verification process.</p>' +
        row('Head of household', f.name) + row('Phone', f.phone) + row('Sector', f.sector) + row('Cell', f.cell) + row('Village', f.village) +
        row('Ubudehe category', f.ubudehe_category) + row('Household size', f.household_size) +
        row('Need', NEED_LABELS[f.support_type] || f.support_type) + row('Amount needed', formatCurrency(f.need_amount)) +
        row('Public description', f.need_description) + row('Supporting notes', f.notes) +
        row('Submitted by', f.submitted_by_name) + row('Status', f.verification_status) +
        (f.verification_status !== 'pending'
            ? row('Decided by', f.verified_by_name) + row('Decision notes', f.verification_notes) + row('Decided on', f.verified_at ? formatDate(f.verified_at) : '')
            : '') +
        (f.verification_status === 'pending' && userRole === 'leader' && mine
            ? '<div class="callout" style="margin-top:1rem;"><i class="fas fa-circle-info"></i><div>You submitted this family, so another leader or the admin must verify it.</div></div>'
            : '');
    document.getElementById('verifyActions').style.display = canDecide ? 'block' : 'none';
    document.getElementById('verifyNotes').value = '';
    showModal('verifyModal');
}

async function decideFamily(decision) {
    if (!reviewingId) return;
    const notes = document.getElementById('verifyNotes').value.trim();
    if (decision === 'reject' && notes.length < 5) {
        showAlert('Please write a reason for rejecting this family.', 'error');
        return;
    }
    try {
        const res = await apiCall(`/families/${reviewingId}/verify`, { method: 'POST', body: JSON.stringify({ decision, notes }) });
        showAlert(res.message || 'Decision saved');
        hideModal('verifyModal');
        reviewingId = null;
        if (userRole === 'admin') loadAdminData(); else loadLeaderData();
        loadPublicFamilies();
    } catch (e) {
        showAlert(e.serverMessage || 'Could not save the decision', 'error');
    }
}

function openFamilyModal() {
    // Leaders submit for their own sector; the admin chooses
    const sectorGroup = document.getElementById('familySectorGroup');
    const sectorInput = document.getElementById('familySector');
    if (userRole === 'admin') {
        sectorGroup.style.display = '';
        sectorInput.required = true;
    } else {
        sectorGroup.style.display = 'none';
        sectorInput.required = false;
    }
    showModal('familyModal');
}

async function submitFamily(e) {
    e.preventDefault();
    const val = (id) => document.getElementById(id).value.trim();
    const payload = {
        headName: val('familyHeadName'),
        phone: val('familyPhone'),
        sector: val('familySector'),
        cell: val('familyCell'),
        village: val('familyVillage'),
        ubudeheCategory: val('familyUbudehe'),
        householdSize: val('familyHousehold'),
        needType: val('familyNeedType'),
        needAmount: val('familyNeedAmount'),
        needDescription: val('familyNeedDescription'),
        notes: val('familyNotes'),
    };
    try {
        const res = await apiCall('/families/submit', { method: 'POST', body: JSON.stringify(payload) });
        showAlert(res.message || 'Family submitted');
        document.getElementById('familyForm').reset();
        hideModal('familyModal');
        if (userRole === 'admin') loadAdminData(); else loadLeaderData();
    } catch (err) {
        showAlert(err.serverMessage || 'Could not submit the family', 'error');
    }
}

// ---- Admin -------------------------------------------------------------------------
async function loadAdminData() {
    if (!currentUser) return;
    try {
        const [donations, , summary, leaders] = await Promise.all([
            apiCall('/donations/all'),
            loadQueue(),
            apiCall('/admin/reports/summary'),
            apiCall('/admin/leaders'),
        ]);
        displayAdminDonations(donations.data || []);
        renderAdminFamilies();
        renderLeaders(leaders.data || []);
        const s = summary.data || {};
        renderReport(s);
        document.getElementById('adminTotalDonated').textContent = formatCurrency(s.totalRaised || 0);
        document.getElementById('adminVerifiedCount').textContent = s.verifiedFamilies || 0;
        document.getElementById('adminPendingCount').textContent = s.pendingFamilies || 0;
        await loadAuditLogs();
        syncDashboardClones();
    } catch (error) {
        console.error('Failed to load admin data:', error);
    }
}

function displayAdminDonations(donations) {
    const tbody = document.getElementById('adminDonationsList');
    if (!tbody) return;
    if (!donations.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No donations yet</td></tr>';
        syncDashboardClones();
        return;
    }
    tbody.innerHTML = donations.map((d) => `
        <tr>
            <td>${escapeHtml(d.donor_name)} ${Number(d.is_anonymous || 0) === 1 ? '<span class="chip" style="margin-left:.4rem;">Anonymous</span>' : ''}</td>
            <td>${escapeHtml(d.family_code || '—')}</td>
            <td>${escapeHtml(formatCurrency(d.amount))}</td>
            <td>${escapeHtml(NEED_LABELS[d.purpose] || d.purpose)}</td>
            <td>${escapeHtml(formatDate(d.created_at))}</td>
            <td>${statusPill(d.status)}</td>
        </tr>`).join('');
    syncDashboardClones();
}

function renderLeaders(rows) {
    const tbody = document.getElementById('leadersList');
    if (!tbody) return;
    tbody.innerHTML = rows.length ? rows.map((l) => `
        <tr><td>${escapeHtml(l.name)}</td><td>${escapeHtml(l.sector)}</td><td>${escapeHtml(l.phone || l.email || '—')}</td><td>${escapeHtml(l.submitted)}</td><td>${escapeHtml(l.decided)}</td></tr>`).join('')
        : '<tr><td colspan="5" class="table-empty">No local leader accounts yet</td></tr>';
}

function renderReport(s) {
    const mount = document.getElementById('reportMount');
    if (!mount) return;
    const stat = (label, value) => `<div class="stat-card" style="box-shadow:none;"><div class="stat-meta"><div class="stat-label">${escapeHtml(label)}</div><div class="stat-value">${escapeHtml(value)}</div></div></div>`;
    const total = (s.byPurpose || []).reduce((a, r) => a + Number(r.total || 0), 0) || 1;
    const bars = (s.byPurpose || []).map((r) => {
        const pct = Math.round((Number(r.total) / total) * 100);
        return `<div style="margin:.6rem 0;"><div style="display:flex;justify-content:space-between;"><strong>${escapeHtml(NEED_LABELS[r.purpose] || r.purpose)}</strong><span>${escapeHtml(formatCurrency(r.total))} <span class="muted">(${pct}%)</span></span></div><div class="family-progress"><div class="family-progress-bar" style="width:${Math.max(2, pct)}%"></div></div></div>`;
    }).join('') || '<p class="muted">No completed donations yet.</p>';
    const statusRows = (s.byStatus || []).map((r) => `<tr><td>${statusPill(r.status)}</td><td>${escapeHtml(r.count)}</td><td>${escapeHtml(formatCurrency(r.total))}</td></tr>`).join('') || '<tr><td colspan="3" class="table-empty">No donations yet</td></tr>';
    mount.innerHTML = `
        <div class="stat-grid">
            ${stat('Total raised (completed)', formatCurrency(s.totalRaised))}
            ${stat('Completed donations', s.donationCount)}
            ${stat('Donors', s.donorCount)}
            ${stat('Verified families', s.verifiedFamilies)}
            ${stat('Awaiting verification', s.pendingFamilies)}
            ${stat('Rejected', s.rejectedFamilies)}
            ${stat('Families fully funded', s.fullyFundedFamilies)}
            ${stat('Total need (verified)', formatCurrency(s.totalNeed))}
            ${stat('Still needed', formatCurrency(s.stillNeeded))}
        </div>
        <h4 style="margin:1.25rem 0 .5rem;">Donations by need</h4>${bars}
        <h4 style="margin:1.25rem 0 .5rem;">Donations by payment status</h4>
        <div class="table-wrap"><table class="data-table"><thead><tr><th>Status</th><th>Count</th><th>Amount</th></tr></thead><tbody>${statusRows}</tbody></table></div>`;
}

async function loadAuditLogs() {
    if (!currentUser) return;
    try {
        const logs = await apiCall('/admin/audit-logs');
        renderAuditLogs(logs.data || []);
    } catch (e) {
        renderAuditLogs([]);
    }
}

function renderAuditLogs(rows) {
    const tbody = document.getElementById('auditLogsList');
    if (!tbody) return;
    if (!rows || rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No logs yet</td></tr>';
        return;
    }
    const fmt = (iso) => {
        try { return new Date(iso).toLocaleString('en-GB', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
        catch { return iso; }
    };
    tbody.innerHTML = rows.map((r) => {
        const actor = r.actor_name ? `${escapeHtml(r.actor_name)}${r.actor_email ? ' <span class="muted">(' + escapeHtml(r.actor_email) + ')</span>' : ''}` : '<span class="muted">System</span>';
        const entity = r.entity_type ? `${escapeHtml(r.entity_type)}${r.entity_id ? ' #' + escapeHtml(r.entity_id) : ''}` : '<span class="muted">—</span>';
        return `<tr><td>${escapeHtml(fmt(r.created_at))}</td><td>${actor}</td><td>${escapeHtml(r.action || '')}</td><td>${entity}</td><td style="max-width:340px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${r.details ? escapeHtml(r.details) : '<span class="muted">—</span>'}</td></tr>`;
    }).join('');
}

// ---- Payment status ------------------------------------------------------------------
function showPaymentStatus(message, type, options = {}) {
    const el = document.getElementById('paymentStatus');
    if (!el) return;
    if (options && options.html) el.innerHTML = options.html; else el.textContent = message;
    el.className = type;
    el.classList.remove('hidden');
    if (type !== 'processing') {
        setTimeout(() => { el.classList.add('hidden'); el.className = 'hidden'; }, 5000);
    }
}

function showCheckoutOpenedStatus({ paymentLink, txRef, blocked }) {
    const html = `
        <div style="font-weight:800;margin-bottom:.25rem;">Secure checkout ${blocked ? 'link ready' : 'opened in a new tab'}</div>
        <div class="muted">Complete your payment in the checkout tab. This page will update when your payment is confirmed.</div>
        <div style="margin-top:.75rem;display:flex;gap:.6rem;flex-wrap:wrap;justify-content:center;">
          <a class="btn btn-secondary" target="_blank" rel="noopener" href="${escapeHtml(paymentLink || '')}"><i class="fas fa-arrow-up-right-from-square"></i> Open checkout</a>
          <button type="button" class="btn btn-primary" id="refreshDonationStatusBtn"><i class="fas fa-rotate"></i> Refresh status</button>
        </div>
        <div class="muted" style="margin-top:.6rem;font-size:.9rem;">Reference: <strong>${escapeHtml(txRef || '')}</strong></div>`;
    showPaymentStatus('', 'processing', { html });
}

async function fetchDonationStatus(txRef) {
    return apiCall(`/donations/status/${encodeURIComponent(txRef)}`);
}

function startDonationStatusPolling(txRef, opts = {}) {
    const maxMs = Number(opts.maxMs || 120000);
    const intervalMs = Number(opts.intervalMs || 3500);
    const started = Date.now();
    const tick = async () => {
        if (!txRef || Date.now() - started > maxMs) return;
        try {
            const st = await fetchDonationStatus(txRef);
            const status = String(st.status || '').toLowerCase();
            if (status === 'completed') {
                showPaymentStatus(`✅ Payment confirmed! Reference: ${txRef}`, 'success');
                loadUserData();
                return;
            }
            if (status === 'failed' || status === 'cancelled') {
                showPaymentStatus(`❌ Payment failed or was cancelled. Reference: ${txRef}`, 'error');
                loadUserData();
                return;
            }
        } catch (_) { /* transient */ }
        setTimeout(tick, intervalMs);
    };
    setTimeout(tick, intervalMs);
}

async function downloadCsv(endpoint, filename) {
    try {
        const headers = {};
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
        const res = await fetch(`${API_BASE}${endpoint}`, { headers });
        if (!res.ok) throw new Error('Export failed');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
        showAlert('Export downloaded.');
    } catch (e) {
        showAlert(e.message || 'Export failed', 'error');
    }
}

// ---- Dashboard navigation ---------------------------------------------------------------
const DASH_ROOTS = { user: 'userDashboard', leader: 'leaderDashboard', admin: 'adminDashboard' };

function setActiveDashboardTab(scope, panelId) {
    const root = document.getElementById(DASH_ROOTS[scope]);
    if (!root) return;
    root.querySelectorAll('.dash-nav-item').forEach((btn) => btn.classList.toggle('active', btn.getAttribute('data-tab-target') === panelId));
    root.querySelectorAll('.dash-panel').forEach((panel) => panel.classList.toggle('active', panel.id === panelId));
}

function syncDashboardClones() {
    const history = document.getElementById('donationHistory');
    const historyClone = document.getElementById('donationHistoryCloneMount');
    if (history && historyClone) historyClone.innerHTML = history.innerHTML;
    const rows = document.getElementById('adminDonationsList');
    const clone = document.getElementById('adminDonationsListCloneMount');
    if (rows && clone) clone.innerHTML = rows.innerHTML;
}

function initDashboardNavigation() {
    Object.entries(DASH_ROOTS).forEach(([scope, id]) => {
        const root = document.getElementById(id);
        if (!root) return;
        root.addEventListener('click', (e) => {
            const btn = e.target.closest('.dash-nav-item');
            if (!btn) return;
            const target = btn.getAttribute('data-tab-target');
            if (target) setActiveDashboardTab(scope, target);
        });
    });
    ['backToSiteBtn', 'backToSiteBtnLeader', 'backToSiteBtnAdmin'].forEach((id) => {
        const b = document.getElementById(id);
        if (b) b.addEventListener('click', () => { showMainContent(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    });
}

// ---- Event wiring --------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', function () {
    const safeAdd = (id, evt, handler) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(evt, handler);
    };

    loadSession();
    initDashboardNavigation();
    loadConfig();
    loadPublicFamilies();

    // Mobile menu
    const hamburger = document.getElementById('hamburger');
    const mobileMenu = document.getElementById('mobileMenu');
    if (hamburger && mobileMenu) {
        hamburger.addEventListener('click', () => {
            mobileMenu.classList.toggle('active');
            hamburger.classList.toggle('open');
        });
    }

    safeAdd('dashboardBtn', 'click', (e) => { e.preventDefault(); openMyDashboard(); });
    safeAdd('logoutBtn', 'click', (e) => { e.preventDefault(); logout(); });
    safeAdd('mobileDashboardBtn', 'click', (e) => { e.preventDefault(); mobileMenu.classList.remove('active'); openMyDashboard(); });
    safeAdd('mobileLogoutBtn', 'click', (e) => { e.preventDefault(); mobileMenu.classList.remove('active'); logout(); });

    document.querySelectorAll('#joinUsBtn, #footerDonateBtn').forEach((btn) => {
        btn.addEventListener('click', (e) => { e.preventDefault(); openMyDashboard(); });
    });

    // One delegated click handler for the dynamic parts of the page
    document.addEventListener('click', (e) => {
        const donate = e.target.closest('[data-donate-family]');
        if (donate) { e.preventDefault(); chooseFamily(donate.getAttribute('data-donate-family')); return; }

        const review = e.target.closest('[data-review-family]');
        if (review) { openReview(review.getAttribute('data-review-family')); return; }

        const lf = e.target.closest('[data-family-filter]');
        if (lf) {
            landingFilter = lf.getAttribute('data-family-filter');
            document.querySelectorAll('[data-family-filter]').forEach((b) => b.classList.toggle('active', b === lf));
            renderLandingFamilies();
            return;
        }
        const df = e.target.closest('[data-dash-family-filter]');
        if (df) {
            dashFilter = df.getAttribute('data-dash-family-filter');
            document.querySelectorAll('[data-dash-family-filter]').forEach((b) => b.classList.toggle('active', b === df));
            renderDashFamilies();
            return;
        }
        if (e.target.closest('#seeAllFamiliesBtn') || e.target.closest('#quickDonateBtn') || e.target.closest('#goToFamiliesLink')) {
            e.preventDefault();
            setActiveDashboardTab('user', 'user-families');
        }
    });

    // Family submission / review modals
    safeAdd('submitFamilyBtnLeader', 'click', openFamilyModal);
    safeAdd('submitFamilyBtnAdmin', 'click', openFamilyModal);
    safeAdd('closeFamilyModal', 'click', () => hideModal('familyModal'));
    safeAdd('closeVerifyModal', 'click', () => hideModal('verifyModal'));
    safeAdd('familyForm', 'submit', submitFamily);
    safeAdd('approveFamilyBtn', 'click', () => decideFamily('approve'));
    safeAdd('rejectFamilyBtn', 'click', () => decideFamily('reject'));

    // Admin buttons
    safeAdd('exportDonationsBtn', 'click', () => downloadCsv('/admin/export/donations.csv', 'donations.csv'));
    safeAdd('exportDonationsXlsxBtn', 'click', () => downloadCsv('/admin/export/donations.xlsx', 'donations.xlsx'));
    safeAdd('exportFamiliesBtn', 'click', () => downloadCsv('/admin/export/families.csv', 'families.csv'));
    safeAdd('exportFamiliesXlsxBtn', 'click', () => downloadCsv('/admin/export/families.xlsx', 'families.xlsx'));
    safeAdd('refreshAuditBtn', 'click', () => loadAuditLogs());
    safeAdd('refreshReportBtn', 'click', async () => {
        try { renderReport((await apiCall('/admin/reports/summary')).data || {}); } catch (_) {}
    });
    safeAdd('leaderForm', 'submit', async (e) => {
        e.preventDefault();
        const v = (id) => document.getElementById(id).value.trim();
        try {
            const res = await apiCall('/admin/leaders', {
                method: 'POST',
                body: JSON.stringify({ name: v('leaderName'), sector: v('leaderSector'), phone: v('leaderPhone'), email: v('leaderEmail'), password: document.getElementById('leaderPassword').value }),
            });
            showAlert(res.message || 'Leader account created');
            document.getElementById('leaderForm').reset();
            loadAdminData();
        } catch (err) {
            showAlert(err.serverMessage || 'Could not create leader account', 'error');
        }
    });

    // Payment method reveal
    safeAdd('paymentMethod', 'change', function () {
        const momo = document.getElementById('momoDetails');
        const card = document.getElementById('cardDetails');
        momo.classList.toggle('hidden', this.value !== 'mobile_money');
        card.classList.toggle('hidden', this.value !== 'credit_card');
    });

    safeAdd('momoPhone', 'input', function (e) {
        let value = e.target.value.replace(/[^0-9+]/g, '');
        if (!value.startsWith('+') && value.startsWith('0') && value.length >= 10) value = '+250' + value.slice(1);
        if (!value.startsWith('+') && value.startsWith('7') && value.length >= 9) value = '+250' + value;
        e.target.value = value;
    });

    // Donation form
    safeAdd('donationForm', 'submit', async (e) => {
        e.preventDefault();
        const donateButton = document.getElementById('donateButton');
        const donateButtonText = document.getElementById('donateButtonText');

        if (!currentUser) { showPaymentStatus('Please log in first.', 'error'); return; }
        const familyId = document.getElementById('donationFamilyId').value;
        if (!familyId) { showPaymentStatus('Please choose a verified family first.', 'error'); return; }

        const paymentMethod = document.getElementById('paymentMethod').value;
        const amount = parseInt(document.getElementById('donationAmount').value, 10);
        const note = (document.getElementById('donationNote').value || '').trim();
        const isAnonymous = document.getElementById('donationAnonymous').checked;

        const paymentDetails = {};
        if (paymentMethod === 'mobile_money') {
            const phoneNumber = document.getElementById('momoPhone').value;
            if (phoneNumber && phoneNumber.length >= 10) paymentDetails.phoneNumber = phoneNumber;
        }

        donateButton.disabled = true;
        donateButton.classList.add('processing');
        donateButtonText.innerHTML = '<div class="spinner"></div>Processing Payment...';
        showPaymentStatus('Preparing your secure checkout, please wait...', 'processing');

        // Open the checkout tab synchronously so popup blockers allow it
        let checkoutWindow = null;
        try { checkoutWindow = window.open('about:blank', '_blank'); } catch (_) { checkoutWindow = null; }

        try {
            const response = await apiCall('/donations/create', {
                method: 'POST',
                body: JSON.stringify({ familyId: Number(familyId), amount, paymentMethod, paymentDetails, note, isAnonymous }),
            });
            const txRef = response?.donation?.txRef;
            saveSession();
            if (response.paymentLink && checkoutWindow && !checkoutWindow.closed) {
                checkoutWindow.location.href = response.paymentLink;
            }
            showCheckoutOpenedStatus({ paymentLink: response.paymentLink, txRef, blocked: !(checkoutWindow && !checkoutWindow.closed) });

            const refreshBtn = document.getElementById('refreshDonationStatusBtn');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', async () => {
                    try {
                        const st = await fetchDonationStatus(txRef);
                        const s = String(st.status || '').toLowerCase();
                        if (s === 'completed') showPaymentStatus(`✅ Payment confirmed! Reference: ${txRef}`, 'success');
                        else if (s === 'failed' || s === 'cancelled') showPaymentStatus(`❌ Payment failed or was cancelled. Reference: ${txRef}`, 'error');
                        else showPaymentStatus(`⏳ Still waiting for confirmation… Reference: ${txRef}`, 'processing');
                        loadUserData();
                    } catch (_) {
                        showPaymentStatus('Could not refresh status. Please try again.', 'error');
                    }
                });
            }
            if (txRef) startDonationStatusPolling(txRef, { maxMs: 120000 });
            setTimeout(() => loadUserData(), 800);
        } catch (error) {
            if (checkoutWindow && !checkoutWindow.closed) checkoutWindow.close();
            showPaymentStatus(`❌ ${error.serverMessage || 'Payment could not be started. Please try again.'}`, 'error');
        } finally {
            donateButton.disabled = false;
            donateButton.classList.remove('processing');
            donateButtonText.innerHTML = 'Donate Now';
        }
    });

    // Amount buttons
    const amountButtons = document.querySelectorAll('.amount-btn');
    amountButtons.forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            amountButtons.forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('donationAmount').value = btn.dataset.amount;
        });
    });
    safeAdd('donationAmount', 'input', () => amountButtons.forEach((b) => b.classList.remove('active')));

    // Smooth scrolling for in-page links
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (!href || href === '#') { e.preventDefault(); return; }
            try {
                const target = document.querySelector(href);
                if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
            } catch (err) { /* invalid selector */ }
        });
    });

    // Close modals when clicking the backdrop
    window.addEventListener('click', (e) => {
        if (e.target.classList && e.target.classList.contains('modal')) e.target.style.display = 'none';
    });

    updateUI();

    // Open a dashboard after login (?open=dashboard) — routed by role
    const params = new URLSearchParams(window.location.search);
    const open = params.get('open');
    if (open === 'dashboard' || open === 'admin' || open === 'leader') {
        window.history.replaceState({}, document.title, window.location.pathname);
        if (!currentUser) { window.location.href = '/login?next=dashboard'; return; }
        openMyDashboard();
    }

    // Returning from payment
    const payment = params.get('payment');
    const txRef = params.get('tx_ref');
    if (payment === 'success') {
        showAlert(`✅ Payment successful! Reference: ${txRef || 'N/A'}`);
        if (currentUser) showUserDashboard();
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (payment === 'failed') {
        showAlert(`❌ Payment failed or was cancelled. Reference: ${txRef || 'N/A'}`, 'error');
        window.history.replaceState({}, document.title, window.location.pathname);
    }
});

// Initialize
showMainContent();
