// Page start-up and the click handling shared by every dashboard

document.addEventListener('click', async (e) => {
  const target = e.target;

  const donate = target.closest('[data-donate]');
  if (donate) return chooseFamily(donate.dataset.donate);

  const review = target.closest('[data-review]');
  if (review) return openReview(review.dataset.review);

  const view = target.closest('[data-view]');
  if (view) return showView(view.closest('.dash'), view.dataset.view);

  const filter = target.closest('[data-filter]');
  if (filter) {
    const group = filter.parentElement;
    group.querySelectorAll('[data-filter]').forEach((b) => b.classList.toggle('active', b === filter));
    if (group.dataset.filterGroup === 'landing') {
      state.landingFilter = filter.dataset.filter;
      renderFamilies('landingFamilies', state.landingFilter);
    } else {
      state.dashFilter = filter.dataset.filter;
      renderFamilies('dashFamilies', state.dashFilter);
    }
    return;
  }

  const decision = target.closest('[data-decision]');
  if (decision) return decide(decision.dataset.decision);

  const exportBtn = target.closest('[data-export]');
  if (exportBtn) {
    const file = exportBtn.dataset.export;
    return download(`/admin/export/${file}`, file).catch((err) => toast(err.message, 'error'));
  }

  const check = target.closest('[data-check-payment]');
  if (check) return checkPayment(check.dataset.checkPayment).catch((err) => toast(err.message, 'error'));

  if (target.closest('[data-close]') || target.classList.contains('modal')) {
    document.querySelectorAll('.modal.open').forEach((m) => m.classList.remove('open'));
    return;
  }

  const action = target.closest('[data-action]');
  if (!action) return;
  switch (action.dataset.action) {
    case 'dashboard': return openDashboard();
    case 'logout': return logout();
    case 'home': return showWebsite();
    case 'submit-family': return openFamilyForm();
    case 'refresh-report': return api('/admin/reports/summary').then((r) => renderReport(r.data));
    case 'refresh-audit': return loadAudit();
    default:
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelectorAll('.modal.open').forEach((m) => m.classList.remove('open'));
});

$('menuToggle').addEventListener('click', () => {
  const open = $('mobileMenu').classList.toggle('open');
  $('menuToggle').setAttribute('aria-expanded', open);
});
$('mobileMenu').addEventListener('click', (e) => {
  if (e.target.closest('a, button')) $('mobileMenu').classList.remove('open');
});

const header = $('siteHeader');
const paintHeader = () => header.classList.toggle('solid', window.scrollY > 40);
window.addEventListener('scroll', paintHeader, { passive: true });

const band = document.querySelector('.cta-band');
const bandWatcher = new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting) {
    band.classList.add('photo');
    bandWatcher.disconnect();
  }
}, { rootMargin: '600px' });
bandWatcher.observe(band);

// Start

state.user = session.get().user;
updateHeader();
paintHeader();
loadFamilies();

const params = new URLSearchParams(window.location.search);
const payment = params.get('payment');
if (params.has('open') || payment) window.history.replaceState({}, '', window.location.pathname);

if (params.get('open') === 'dashboard' || payment === 'success') openDashboard();
if (payment === 'success') toast('Payment confirmed. Thank you!');
if (payment === 'failed') toast('The payment failed or was cancelled.', 'error');
