const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, seed, familyInput } = require('../helpers/server');

describe('family submission and verification', () => {
  let t;
  let s;
  before(async () => { t = await startServer(); s = await seed(t); });
  after(() => t.stop());

  test('a new family is pending and hidden from donors', async () => {
    const res = await t.call('POST', '/families/submit', { token: s.leader1, body: familyInput({ needType: 'health' }) });
    assert.equal(res.status, 201);
    assert.equal(res.body.family.status, 'pending');
    assert.match(res.body.family.familyCode, /^NYA-\d{4}$/);

    const list = await t.call('GET', '/families/verified');
    assert.ok(!list.body.data.some((f) => f.id === res.body.family.id));
  });

  test('donors cannot submit or review families', async () => {
    assert.equal((await t.call('POST', '/families/submit', { token: s.donor, body: familyInput() })).status, 403);
    assert.equal((await t.call('GET', '/families/queue', { token: s.donor })).status, 403);
  });

  test('the leader who submitted a family cannot approve it', async () => {
    const res = await t.call('POST', '/families/submit', { token: s.leader1, body: familyInput() });
    const own = await t.call('POST', `/families/${res.body.family.id}/verify`, { token: s.leader1, body: { decision: 'approve' } });
    assert.equal(own.status, 403);
  });

  test('a leader from another sector cannot see or review it', async () => {
    const res = await t.call('POST', '/families/submit', { token: s.leader1, body: familyInput() });
    const queue = await t.call('GET', '/families/queue', { token: s.outsider });
    assert.equal(queue.body.data.length, 0);
    const decide = await t.call('POST', `/families/${res.body.family.id}/verify`, { token: s.outsider, body: { decision: 'approve' } });
    assert.equal(decide.status, 403);
  });

  test('a rejection needs a reason and is final', async () => {
    const res = await t.call('POST', '/families/submit', { token: s.leader1, body: familyInput() });
    const id = res.body.family.id;
    const noReason = await t.call('POST', `/families/${id}/verify`, { token: s.leader2, body: { decision: 'reject' } });
    assert.equal(noReason.status, 400);

    const rejected = await t.call('POST', `/families/${id}/verify`, { token: s.leader2, body: { decision: 'reject', notes: 'Already supported' } });
    assert.equal(rejected.body.status, 'rejected');

    const again = await t.call('POST', `/families/${id}/verify`, { token: s.admin, body: { decision: 'approve' } });
    assert.equal(again.status, 400);
  });

  test('the same family cannot be submitted twice', async () => {
    const body = familyInput();
    const first = await t.call('POST', '/families/submit', { token: s.leader1, body });
    const again = await t.call('POST', '/families/submit', { token: s.leader1, body });
    assert.equal(first.status, 201);
    assert.equal(again.status, 400);
    assert.match(again.body.message, /already been submitted/);
  });

  test('the public list never includes private details', async () => {
    const list = await t.call('GET', '/families/verified');
    assert.ok(list.body.data.length >= 1);
    for (const f of list.body.data) {
      for (const key of ['name', 'phone', 'cell', 'village', 'notes', 'headName']) assert.equal(f[key], undefined, key);
    }
  });

  test('donors see the most urgent families first', async () => {
    const add = async (overrides) => {
      const res = await t.call('POST', '/families/submit', { token: s.leader1, body: familyInput(overrides) });
      await t.call('POST', `/families/${res.body.family.id}/verify`, { token: s.leader2, body: { decision: 'approve' } });
      return res.body.family.familyCode;
    };
    const cat3 = await add({ ubudeheCategory: 3 });
    const cat1 = await add({ ubudeheCategory: 1, needAmount: 50000 });

    const order = (await t.call('GET', '/families/verified')).body.data.map((f) => f.familyCode);
    assert.ok(order.indexOf(cat1) < order.indexOf(cat3));
  });

  test('leaders see every decision in the audit log', async () => {
    const log = await t.call('GET', '/admin/audit-logs', { token: s.admin });
    const actions = log.body.data.map((a) => a.action);
    for (const action of ['family_submitted', 'family_approved', 'family_rejected', 'leader_account_created']) {
      assert.ok(actions.includes(action), action);
    }
  });
});
