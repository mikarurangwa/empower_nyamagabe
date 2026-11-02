const test = require('node:test');
const assert = require('node:assert/strict');
const { readAmount, readPaymentMethod, checkFamilyCanReceive, paymentMatches } = require('../../src/utils/donationRules');
const { ValidationError } = require('../../src/utils/AppError');

const family = (overrides = {}) => ({ verification_status: 'approved', need_amount: 20000, funded: 5000, ...overrides });

test('reads valid amounts and rounds down', () => {
  assert.equal(readAmount('5,000'), 5000);
  assert.equal(readAmount(100), 100);
  assert.equal(readAmount(1500.9), 1500);
});

test('rejects amounts below 100 RWF, negative or not numbers', () => {
  for (const amount of [99, 0, -5000, 'abc', '']) {
    assert.throws(() => readAmount(amount), ValidationError, String(amount));
  }
});

test('only accepts Mobile Money or card', () => {
  assert.equal(readPaymentMethod('MOBILE_MONEY'), 'mobile_money');
  assert.equal(readPaymentMethod('credit_card'), 'credit_card');
  assert.throws(() => readPaymentMethod('cash'), ValidationError);
});

test('lets a verified family receive up to exactly what it still needs', () => {
  assert.equal(checkFamilyCanReceive(family(), 15000), 15000);
});

test('blocks donations to families that are not approved', () => {
  assert.throws(() => checkFamilyCanReceive(family({ verification_status: 'pending' }), 1000), /not verified/);
  assert.throws(() => checkFamilyCanReceive(null, 1000), /not verified/);
});

test('blocks donations above the remaining need', () => {
  assert.throws(() => checkFamilyCanReceive(family(), 15001), /only needs 15,000 RWF/);
});

test('blocks donations to a fully funded family', () => {
  assert.throws(() => checkFamilyCanReceive(family({ funded: 20000 }), 1000), /fully funded/);
});

test('a payment counts only when status, reference, amount and currency all match', () => {
  const donation = { amount: 5000 };
  const good = { status: 'successful', tx_ref: 'EN-1', amount: 5000, currency: 'RWF' };
  assert.equal(paymentMatches(good, 'EN-1', donation), true);
  assert.equal(paymentMatches({ ...good, currency: 'rwf' }, 'EN-1', donation), true);

  assert.equal(paymentMatches({ ...good, status: 'failed' }, 'EN-1', donation), false);
  assert.equal(paymentMatches({ ...good, tx_ref: 'EN-2' }, 'EN-1', donation), false);
  assert.equal(paymentMatches({ ...good, amount: 100 }, 'EN-1', donation), false);
  assert.equal(paymentMatches({ ...good, currency: 'USD' }, 'EN-1', donation), false);
  assert.equal(paymentMatches(null, 'EN-1', donation), false);
});
