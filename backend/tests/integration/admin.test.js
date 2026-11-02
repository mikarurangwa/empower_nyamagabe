const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, seed } = require('../helpers/server');

describe('admin, reports and security', () => {
  let t;
  let s;
  before(async () => {
    t = await startServer();
    s = await seed(t);
    const res = await t.call('POST', '/donations/create', {
      token: s.donor, body: { familyId: s.familyId, amount: 8000, paymentMethod: 'credit_card' },
    });
    const { txRef } = res.body.donation;
    await t.call('GET', `/payments/flutterwave/callback?status=successful&tx_ref=${txRef}&transaction_id=9`, { raw: true });
  });
  after(() => t.stop());

  test('only the admin can create leaders, see reports and export', async () => {
    for (const token of [s.donor, s.leader1]) {
      assert.equal((await t.call('GET', '/admin/reports/summary', { token })).status, 403);
      assert.equal((await t.call('POST', '/admin/leaders', { token, body: {} })).status, 403);
      assert.equal((await t.call('GET', '/admin/export/donations.csv', { token, raw: true })).status, 403);
    }
  });

  test('the report adds up', async () => {
    const r = (await t.call('GET', '/admin/reports/summary', { token: s.admin })).body.data;
    assert.equal(r.totalRaised, 8000);
    assert.equal(r.verifiedFamilies, 1);
    assert.equal(r.totalNeed, 20000);
    assert.equal(r.stillNeeded, 12000);
  });

  test('the public impact page shows totals only', async () => {
    const r = (await t.call('GET', '/public/impact')).body.data;
    assert.equal(r.totalRaised, 8000);
    assert.equal(r.pendingFamilies, undefined);
    assert.equal(r.byStatus, undefined);
  });

  test('donations and families export as CSV and Excel', async () => {
    const csv = await t.call('GET', '/admin/export/donations.csv', { token: s.admin, raw: true });
    const text = await csv.text();
    assert.match(csv.headers.get('content-type'), /text\/csv/);
    assert.equal(text.split('\n')[0].split(',')[0], 'transaction_id');
    assert.equal(text.trim().split('\n').length, 2);

    const xlsx = await t.call('GET', '/admin/export/families.xlsx', { token: s.admin, raw: true });
    assert.match(xlsx.headers.get('content-disposition'), /families\.xlsx/);

    assert.equal((await t.call('GET', '/admin/export/users.csv', { token: s.admin })).status, 404);
  });

  test('leader list shows how much each leader has done', async () => {
    const leaders = (await t.call('GET', '/admin/leaders', { token: s.admin })).body.data;
    const jean = leaders.find((l) => l.name === 'Jean Habimana');
    const marie = leaders.find((l) => l.name === 'Marie Uwase');
    assert.equal(jean.submitted, 1);
    assert.equal(marie.decided, 1);
  });

  test('responses carry security headers', async () => {
    const res = await t.call('GET', '/public/health');
    assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
  });

  test('broken JSON and unknown routes get clean errors', async () => {
    const broken = await t.call('POST', '/auth/login', { body: '{not json' });
    assert.equal(broken.status, 400);
    const missing = await t.call('GET', '/nothing-here');
    assert.equal(missing.status, 404);
    assert.equal(missing.body.success, false);
  });
});
