const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers/server');

describe('accounts and login', () => {
  let t;
  before(async () => { t = await startServer(); });
  after(() => t.stop());

  test('a donor can sign up with a phone number only', async () => {
    const res = await t.call('POST', '/auth/signup', { body: { name: 'Kalisa', phone: '0782111111', password: 'secret1' } });
    assert.equal(res.status, 201);
    assert.equal(res.body.user.role, 'donor');
    assert.equal(res.body.user.phone, '+250782111111');
    assert.ok(res.body.token);
    assert.equal(res.body.user.password_hash, undefined);
  });

  test('sign-up cannot be used to become a leader or admin', async () => {
    const res = await t.call('POST', '/auth/signup', { body: { name: 'Sneaky', email: 'sneak@test.rw', password: 'secret1', role: 'admin' } });
    assert.equal(res.body.user.role, 'donor');
  });

  test('sign-up rejects bad input with a clear message', async () => {
    const cases = [
      [{ name: 'A', email: 'a@test.rw', password: 'secret1' }, 'Name is required'],
      [{ name: 'Ana', email: 'not-an-email', password: 'secret1' }, 'Enter a valid email address'],
      [{ name: 'Ana', email: 'ana@test.rw', password: '123' }, 'Password must be at least 6 characters'],
      [{ name: 'Ana', password: 'secret1' }, 'Enter a phone number or an email address'],
      [{ name: 'Ana', phone: '12345', password: 'secret1' }, 'Enter a valid Rwandan phone number'],
    ];
    for (const [body, message] of cases) {
      const res = await t.call('POST', '/auth/signup', { body });
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(res.body.message, message);
    }
  });

  test('the same phone cannot register twice, in any format', async () => {
    const res = await t.call('POST', '/auth/signup', { body: { name: 'Copy', phone: '+250 782 111 111', password: 'secret1' } });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /already exists/);
  });

  test('login works with phone or email and fails on a wrong password', async () => {
    assert.ok(await t.login('0782111111', 'secret1'));
    assert.ok(await t.login('ADMIN@test.rw', 'admin123', 'admin'));
    const wrong = await t.call('POST', '/auth/login', { body: { identifier: '0782111111', password: 'nope' } });
    assert.equal(wrong.status, 400);
  });

  test('a donor cannot log in as admin or leader', async () => {
    const asAdmin = await t.call('POST', '/auth/login', { body: { identifier: '0782111111', password: 'secret1', role: 'admin' } });
    const asLeader = await t.call('POST', '/auth/login', { body: { identifier: '0782111111', password: 'secret1', role: 'leader' } });
    assert.equal(asAdmin.status, 403);
    assert.equal(asLeader.status, 403);
  });

  test('protected routes need a valid token', async () => {
    assert.equal((await t.call('GET', '/auth/me')).status, 401);
    assert.equal((await t.call('GET', '/auth/me', { token: 'forged.token' })).status, 401);
    const token = await t.login('0782111111', 'secret1');
    const me = await t.call('GET', '/auth/me', { token });
    assert.equal(me.body.user.name, 'Kalisa');
  });

  test('password reset works once and only with the right token', async () => {
    await t.call('POST', '/auth/signup', { body: { name: 'Reset Me', email: 'reset@test.rw', password: 'oldpass1' } });

    let link = '';
    const original = t.services.auth.email.send;
    t.services.auth.email.send = async ({ text }) => { link = text; return true; };
    const ask = await t.call('POST', '/auth/password-reset/request', { body: { email: 'reset@test.rw' } });
    const unknown = await t.call('POST', '/auth/password-reset/request', { body: { email: 'nobody@test.rw' } });
    t.services.auth.email.send = original;

    assert.equal(ask.status, 200);
    assert.equal(unknown.body.message, ask.body.message, 'same answer for unknown emails');
    const token = new URL(link.split('\n')[1]).searchParams.get('token');

    const bad = await t.call('POST', '/auth/password-reset/confirm', { body: { email: 'reset@test.rw', token: 'x'.repeat(48), newPassword: 'newpass1' } });
    assert.equal(bad.status, 400);

    const good = await t.call('POST', '/auth/password-reset/confirm', { body: { email: 'reset@test.rw', token, newPassword: 'newpass1' } });
    assert.equal(good.status, 200);
    assert.ok(await t.login('reset@test.rw', 'newpass1'));

    const reused = await t.call('POST', '/auth/password-reset/confirm', { body: { email: 'reset@test.rw', token, newPassword: 'again123' } });
    assert.equal(reused.status, 400);
  });
});
