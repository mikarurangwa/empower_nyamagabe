const test = require('node:test');
const assert = require('node:assert/strict');
const { readSubmission, readDecision, checkCanDecide } = require('../../src/utils/familyRules');
const { ValidationError, ForbiddenError } = require('../../src/utils/AppError');

const leader = { id: 7, role: 'leader', sector: 'Gasaka', is_admin: 0 };
const admin = { id: 1, role: 'admin', is_admin: 1 };
const input = (overrides = {}) => ({
  headName: 'Private Name', phone: '0781234567', ubudeheCategory: '2', householdSize: '4',
  needType: 'health', needAmount: '18,000', needDescription: 'Mutuelle for a household of four',
  notes: 'Checked with the cell leader', sector: 'Somewhere else', ...overrides,
});

test('a leader always submits in their own sector', () => {
  const f = readSubmission(input(), leader);
  assert.equal(f.sector, 'Gasaka');
  assert.equal(f.needAmount, 18000);
  assert.equal(f.phone, '+250781234567');
});

test('an admin must name the sector', () => {
  assert.equal(readSubmission(input(), admin).sector, 'Somewhere else');
  assert.throws(() => readSubmission(input({ sector: '' }), admin), /Sector is required/);
});

test('rejects bad submissions with a clear reason', () => {
  const cases = [
    [{ headName: '' }, /Head of household/],
    [{ ubudeheCategory: '5' }, /Ubudehe/],
    [{ needType: 'rent' }, /school fees or health/],
    [{ needAmount: '500' }, /between 1,000 and 5,000,000/],
    [{ needAmount: '6000000' }, /between 1,000 and 5,000,000/],
    [{ needDescription: 'short' }, /at least 10/],
    [{ notes: '' }, /supporting notes/],
    [{ householdSize: '40' }, /between 1 and 30/],
    [{ phone: '12345' }, /valid phone/],
  ];
  for (const [change, message] of cases) {
    assert.throws(() => readSubmission(input(change), leader), message);
  }
});

test('a rejection needs a reason', () => {
  assert.deepEqual(readDecision({ decision: 'approve' }), { decision: 'approve', notes: '' });
  assert.throws(() => readDecision({ decision: 'reject', notes: 'no' }), ValidationError);
  assert.throws(() => readDecision({ decision: 'maybe' }), ValidationError);
});

test('the leader who submitted a family cannot approve it', () => {
  const family = { verification_status: 'pending', sector: 'Gasaka', submitted_by: 7 };
  assert.throws(() => checkCanDecide(family, leader), ForbiddenError);
  assert.doesNotThrow(() => checkCanDecide(family, { ...leader, id: 8 }));
  assert.doesNotThrow(() => checkCanDecide(family, admin));
});

test('leaders cannot review other sectors, and decisions are final', () => {
  const family = { verification_status: 'pending', sector: 'Kitabi', submitted_by: 3 };
  assert.throws(() => checkCanDecide(family, leader), /own sector/);
  assert.throws(() => checkCanDecide({ ...family, verification_status: 'approved' }, admin), /already approved/);
});
