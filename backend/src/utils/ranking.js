// Decides the order families are shown to donors, so the most urgent cases come first.
// Families are compared on four keys in turn; the first key that differs decides:
//   1. still needs money before fully funded
//   2. lower Ubudehe category first (category 1 is the poorest)
//   3. smaller share already funded first, so no family is left behind
//   4. waiting longest since verification first
// Sorting n families this way takes O(n log n).

const fundedShare = (f) => (f.needAmount > 0 ? f.funded / f.needAmount : 1);
const timeOf = (date) => (date ? Date.parse(String(date).replace(' ', 'T')) || 0 : 0);

function compareFamilies(a, b) {
  const aOpen = a.remaining > 0;
  const bOpen = b.remaining > 0;
  if (aOpen !== bOpen) return aOpen ? -1 : 1;

  if (a.ubudeheCategory !== b.ubudeheCategory) return a.ubudeheCategory - b.ubudeheCategory;

  const shareDiff = fundedShare(a) - fundedShare(b);
  if (Math.abs(shareDiff) > 1e-9) return shareDiff;

  return timeOf(a.verifiedAt) - timeOf(b.verifiedAt);
}

// Returns a new sorted array and leaves the input untouched
const rankFamilies = (families) => [...families].sort(compareFamilies);

module.exports = { rankFamilies, compareFamilies };
