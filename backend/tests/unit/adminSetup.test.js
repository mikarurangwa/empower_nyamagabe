const test = require('node:test');
const assert = require('node:assert/strict');
const AuthService = require('../../src/services/AuthService');

function makeService({ adminExists = false, password = '' } = {}) {
  const created = [];
  const users = {
    findAdmin: async () => (adminExists ? { id: 1 } : undefined),
    createAdmin: async (email, hash) => { created.push({ email, hash }); return 1; },
  };
  const audit = { add: async () => {} };
  const settings = { admin: { email: 'admin@test.rw', password }, bcryptRounds: 4 };
  return { service: new AuthService({ users, audit, settings }), created };
}

test('no admin is created when ADMIN_PASSWORD is empty', async () => {
  const { service, created } = makeService();
  assert.equal(await service.ensureAdmin(), 'missing-password');
  assert.equal(created.length, 0);
});

test('the first admin is created from the settings, with a hashed password', async () => {
  const { service, created } = makeService({ password: 'Strong-pass-1' });
  assert.equal(await service.ensureAdmin(), 'created');
  assert.equal(created[0].email, 'admin@test.rw');
  assert.notEqual(created[0].hash, 'Strong-pass-1');
});

test('an existing admin is left alone', async () => {
  const { service, created } = makeService({ adminExists: true, password: 'x' });
  assert.equal(await service.ensureAdmin(), 'exists');
  assert.equal(created.length, 0);
});
