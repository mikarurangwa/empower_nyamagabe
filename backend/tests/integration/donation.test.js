const { describe, test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, seed, familyInput } = require('../helpers/server');

describe('donations and payments', () => {
  let t;
  let s;
  before(async () => { t = await startServer(); s = await seed(t); });
  after(() => t.stop());
  beforeEach(() => { t.gateway.override = null; t.gateway.down = false; });

  const donate = (body, token = s.donor) => t.call('POST', '/donations/create', {
    token, body: { familyId: s.familyId, paymentMethod: 'mobile_money', paymentDetails: { phoneNumber: '0782000001' }, ...body },
  });
  const callback = (query) => t.call('GET', `/payments/flutterwave/callback?${new URLSearchParams(query)}`, { raw: true });
  const statusOf = async (txRef) => (await t.call('GET', `/donations/status/${txRef}`, { token: s.donor })).body.status;

  test('rejects amounts that are too small or more than the family needs', async () => {
    assert.match((await donate({ amount: 50 })).body.message, /minimum donation is 100 RWF/);
    assert.match((await donate({ amount: 25000 })).body.message, /only needs 20,000 RWF/);
    assert.match((await donate({ amount: 5000, paymentMethod: 'cash' })).body.message, /Mobile Money or card/);
    assert.match((await donate({ amount: 5000, paymentDetails: { phoneNumber: '123' } })).body.message, /Mobile Money number/);
  });

  test('a donation goes from pending to completed after Flutterwave confirms it', async () => {
    const res = await donate({ amount: 5000, note: 'For term 2' });
    assert.equal(res.status, 201);
    const { txRef } = res.body.donation;
    assert.equal(res.body.paymentLink, `https://checkout.test/pay/${txRef}`);
    assert.equal(await statusOf(txRef), 'pending');

    const back = await callback({ status: 'successful', tx_ref: txRef, transaction_id: '111' });
    assert.equal(back.status, 302);
    assert.match(back.headers.get('location'), /payment=success/);
    assert.equal(await statusOf(txRef), 'completed');

    const family = (await t.call('GET', '/families/verified')).body.data.find((f) => f.id === s.familyId);
    assert.equal(family.remaining, 15000);
  });

  test('the purpose comes from the family, not from the request', async () => {
    const res = await donate({ amount: 1000, purpose: 'health' });
    assert.equal(res.body.donation.purpose, 'education');
  });

  test('a payment with a changed amount is not accepted', async () => {
    const { txRef } = (await donate({ amount: 2000 })).body.donation;
    t.gateway.override = { amount: 100 };
    const back = await callback({ status: 'successful', tx_ref: txRef, transaction_id: '222' });
    assert.match(back.headers.get('location'), /payment=failed/);
    assert.equal(await statusOf(txRef), 'failed');
  });

  test('a payment in the wrong currency is not accepted', async () => {
    const { txRef } = (await donate({ amount: 2000 })).body.donation;
    t.gateway.override = { currency: 'USD' };
    await callback({ status: 'successful', tx_ref: txRef, transaction_id: '333' });
    assert.equal(await statusOf(txRef), 'failed');
  });

  test('a cancelled checkout is marked failed', async () => {
    const { txRef } = (await donate({ amount: 2000 })).body.donation;
    await callback({ status: 'cancelled', tx_ref: txRef });
    assert.equal(await statusOf(txRef), 'failed');
  });

  test('a completed donation cannot be turned into a failed one later', async () => {
    const { txRef } = (await donate({ amount: 1000 })).body.donation;
    await callback({ status: 'successful', tx_ref: txRef, transaction_id: '444' });
    await callback({ status: 'cancelled', tx_ref: txRef });
    assert.equal(await statusOf(txRef), 'completed');
  });

  test('if Flutterwave is down the donor gets a clear error', async () => {
    t.gateway.down = true;
    const res = await donate({ amount: 1000 });
    assert.equal(res.status, 502);
    assert.match(res.body.message, /payment provider/);
  });

  test('the webhook needs the secret hash', async () => {
    const { txRef } = (await donate({ amount: 1000 })).body.donation;
    const body = { data: { tx_ref: txRef, id: 555, status: 'successful' } };
    const res = await t.call('POST', '/payments/flutterwave/webhook', { body, raw: true });
    assert.equal(res.status, 401);
    assert.equal(await statusOf(txRef), 'pending');

    const signed = await fetch(`${t.base}/payments/flutterwave/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'verif-hash': 'hook-secret' },
      body: JSON.stringify(body),
    });
    assert.equal(signed.status, 200);
    assert.equal(await statusOf(txRef), 'completed');
  });

  test('cannot give to a family that is not verified', async () => {
    const pending = await t.call('POST', '/families/submit', { token: s.leader1, body: familyInput() });
    const res = await donate({ familyId: pending.body.family.id, amount: 1000 });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /not verified/);
  });

  test('donors only see their own history and receipts', async () => {
    const history = await t.call('GET', `/donations/user/${s.donorId}`, { token: s.donor });
    assert.ok(history.body.data.length >= 5);
    const completed = history.body.data.find((d) => d.status === 'completed');

    const receipt = await t.call('GET', `/donations/receipt/${completed.transaction_id}`, { token: s.donor });
    assert.equal(receipt.body.receipt.family.code, 'NYA-0001');

    const other = await t.call('POST', '/auth/signup', { body: { name: 'Other', email: 'other@test.rw', password: 'secret1' } });
    const peek = await t.call('GET', `/donations/receipt/${completed.transaction_id}`, { token: other.body.token });
    assert.equal(peek.status, 403);
    assert.equal((await t.call('GET', `/donations/user/${s.donorId}`, { token: other.body.token })).status, 403);
  });

  test('the receipt downloads as a PDF', async () => {
    const history = await t.call('GET', `/donations/user/${s.donorId}`, { token: s.donor });
    const { transaction_id: txRef } = history.body.data.find((d) => d.status === 'completed');
    const res = await t.call('GET', `/donations/receipt/${txRef}/pdf`, { token: s.donor, raw: true });
    assert.equal(res.headers.get('content-type'), 'application/pdf');
    assert.ok((await res.text()).startsWith('%PDF'));
  });

  test('totals only count completed donations', async () => {
    const totals = await t.call('GET', `/donations/totals/${s.donorId}`, { token: s.donor });
    const history = (await t.call('GET', `/donations/user/${s.donorId}`, { token: s.donor })).body.data;
    const expected = history.filter((d) => d.status === 'completed').reduce((sum, d) => sum + d.amount, 0);
    assert.equal(totals.body.data.totalDonated, expected);
    assert.equal(totals.body.data.familiesHelped, 1);
  });
});
