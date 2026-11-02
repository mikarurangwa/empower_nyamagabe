const test = require('node:test');
const assert = require('node:assert/strict');
const { clean, isEmail, isPhone, normalizePhone, parseAmount } = require('../../src/utils/validators');

test('accepts Rwandan mobile numbers in every common format', () => {
  for (const phone of ['0781234567', '781234567', '+250781234567', '078 123 4567']) {
    assert.equal(isPhone(phone), true, phone);
  }
});

test('rejects numbers that are not Rwandan mobiles', () => {
  for (const phone of ['0681234567', '07812345', '+254781234567', 'abc', '']) {
    assert.equal(isPhone(phone), false, phone);
  }
});

test('stores every phone format the same way', () => {
  assert.equal(normalizePhone('0781234567'), '+250781234567');
  assert.equal(normalizePhone('781234567'), '+250781234567');
  assert.equal(normalizePhone('250781234567'), '+250781234567');
  assert.equal(normalizePhone('+250 781-234-567'), '+250781234567');
  assert.equal(normalizePhone(''), null);
});

test('checks email shape', () => {
  assert.equal(isEmail('aline@example.rw'), true);
  assert.equal(isEmail('aline@example'), false);
  assert.equal(isEmail('aline example.rw'), false);
});

test('reads amounts typed with commas or currency', () => {
  assert.equal(parseAmount('5,000 RWF'), 5000);
  assert.equal(parseAmount(' 12000 '), 12000);
  assert.equal(parseAmount('-1000'), -1000);
  assert.ok(Number.isNaN(parseAmount('abc')) || parseAmount('abc') === 0);
});

test('trims text and cuts it to the allowed length', () => {
  assert.equal(clean('  hello  ', 10), 'hello');
  assert.equal(clean('abcdefgh', 3), 'abc');
  assert.equal(clean(null, 5), '');
});
