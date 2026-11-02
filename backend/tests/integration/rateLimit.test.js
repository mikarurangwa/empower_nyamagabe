process.env.AUTH_RATE_LIMIT = '5';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers/server');

let t;
after(() => t && t.stop());

test('too many login attempts are slowed down', async () => {
  t = await startServer();
  const codes = [];
  for (let i = 0; i < 7; i++) {
    const res = await t.call('POST', '/auth/login', { body: { identifier: 'admin@test.rw', password: `guess${i}` } });
    codes.push(res.status);
  }
  assert.deepEqual(codes.slice(0, 5), [400, 400, 400, 400, 400]);
  assert.deepEqual(codes.slice(5), [429, 429]);
});
