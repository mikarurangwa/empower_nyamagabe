const test = require('node:test');
const assert = require('node:assert/strict');
const { rankFamilies } = require('../../src/utils/ranking');

const fam = (code, overrides = {}) => ({
  familyCode: code, ubudeheCategory: 2, needAmount: 20000, funded: 0, remaining: 20000,
  verifiedAt: '2026-10-01 08:00:00', ...overrides,
});

test('families that still need money come before fully funded ones', () => {
  const ranked = rankFamilies([fam('A', { funded: 20000, remaining: 0, ubudeheCategory: 1 }), fam('B')]);
  assert.deepEqual(ranked.map((f) => f.familyCode), ['B', 'A']);
});

test('poorer Ubudehe categories come first', () => {
  const ranked = rankFamilies([fam('C3', { ubudeheCategory: 3 }), fam('C1', { ubudeheCategory: 1 }), fam('C2')]);
  assert.deepEqual(ranked.map((f) => f.familyCode), ['C1', 'C2', 'C3']);
});

test('within a category, the family with the smallest share funded comes first', () => {
  const ranked = rankFamilies([
    fam('Half', { funded: 10000, remaining: 10000 }),
    fam('None'),
    fam('Most', { funded: 18000, remaining: 2000 }),
  ]);
  assert.deepEqual(ranked.map((f) => f.familyCode), ['None', 'Half', 'Most']);
});

test('if everything else is equal, the family waiting longest comes first', () => {
  const ranked = rankFamilies([fam('New', { verifiedAt: '2026-10-20 08:00:00' }), fam('Old', { verifiedAt: '2026-09-01 08:00:00' })]);
  assert.deepEqual(ranked.map((f) => f.familyCode), ['Old', 'New']);
});

test('does not change the original list', () => {
  const list = [fam('B', { ubudeheCategory: 3 }), fam('A', { ubudeheCategory: 1 })];
  rankFamilies(list);
  assert.equal(list[0].familyCode, 'B');
});

test('ranks 10,000 families quickly', () => {
  const list = Array.from({ length: 10000 }, (_, i) => {
    const needAmount = 1000 + ((i * 7919) % 50000);
    const funded = (i * 104729) % needAmount;
    return fam(`F${i}`, { ubudeheCategory: 1 + (i % 4), needAmount, funded, remaining: needAmount - funded });
  });
  const start = process.hrtime.bigint();
  const ranked = rankFamilies(list);
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  assert.equal(ranked.length, 10000);
  assert.ok(ms < 500, `took ${ms.toFixed(1)} ms`);
  for (let i = 1; i < ranked.length; i++) {
    assert.ok(ranked[i - 1].ubudeheCategory <= ranked[i].ubudeheCategory || ranked[i - 1].remaining > 0);
  }
});
