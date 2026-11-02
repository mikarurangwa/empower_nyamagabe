// Starts the real app on a free port with a fresh in-memory database
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.BCRYPT_ROUNDS = '4';
process.env.ADMIN_EMAIL = 'admin@test.rw';
process.env.ADMIN_PASSWORD = 'admin123';
process.env.FLW_WEBHOOK_SECRET_HASH = 'hook-secret';
process.env.AUTH_RATE_LIMIT = process.env.AUTH_RATE_LIMIT || '1000';

const db = require('../../src/config/database');
const runMigrations = require('../../migrations');
const app = require('../../app');
const services = require('../../src/services');
const FakeGateway = require('./FakeGateway');

async function startServer() {
  await db.connect(':memory:');
  await runMigrations();

  const gateway = new FakeGateway();
  services.donations.gateway = gateway;
  services.donations.webhookHash = 'hook-secret';

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;

  async function call(method, path, { body, token, raw } = {}) {
    const res = await fetch(base + path, {
      method,
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    if (raw) return res;
    return { status: res.status, body: await res.json().catch(() => ({})), headers: res.headers };
  }

  async function login(identifier, password, role = 'donor') {
    const res = await call('POST', '/auth/login', { body: { identifier, password, role } });
    return res.body.token;
  }

  async function stop() {
    await new Promise((resolve) => server.close(resolve));
    await db.close();
  }

  return { base, call, login, gateway, services, stop };
}

// Admin, two leaders in one sector, one leader elsewhere, one donor, one approved family
async function seed(t) {
  const admin = await t.login('admin@test.rw', 'admin123', 'admin');
  const leader = (name, sector, phone) =>
    t.call('POST', '/admin/leaders', { token: admin, body: { name, sector, phone, password: 'leader123' } });
  await leader('Jean Habimana', 'Gasaka', '0781000001');
  await leader('Marie Uwase', 'Gasaka', '0781000002');
  await leader('Eric Mugisha', 'Kitabi', '0781000003');

  const leader1 = await t.login('0781000001', 'leader123', 'leader');
  const leader2 = await t.login('0781000002', 'leader123', 'leader');
  const outsider = await t.login('0781000003', 'leader123', 'leader');

  const family = await t.call('POST', '/families/submit', { token: leader1, body: familyInput() });
  await t.call('POST', `/families/${family.body.family.id}/verify`, { token: leader2, body: { decision: 'approve', notes: 'Visited' } });

  const signup = await t.call('POST', '/auth/signup', {
    body: { name: 'Aline Donor', email: 'aline@test.rw', phone: '0782000001', password: 'secret1' },
  });

  return {
    admin, leader1, leader2, outsider,
    donor: signup.body.token,
    donorId: signup.body.user.id,
    familyId: family.body.family.id,
  };
}

function familyInput(overrides = {}) {
  return {
    headName: 'Private Name',
    phone: '0783000001',
    cell: 'Nyabivumu',
    village: 'Kigeme',
    ubudeheCategory: 1,
    householdSize: 5,
    needType: 'education',
    needAmount: 20000,
    needDescription: 'Term 2 school fees for two children',
    notes: 'Known to the village committee for years',
    ...overrides,
  };
}

module.exports = { startServer, seed, familyInput };
