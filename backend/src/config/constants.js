const NEED_TYPES = ['health', 'education'];

const NEED_LABELS = {
  health: 'Health insurance (Mutuelle de Santé)',
  education: 'School fees',
};

const ROLES = { DONOR: 'donor', LEADER: 'leader', ADMIN: 'admin' };

const PAYMENT_METHODS = ['mobile_money', 'credit_card'];
const MIN_DONATION = 100;
const NEED_AMOUNT = { min: 1000, max: 5000000 };
const CURRENCY = 'RWF';

module.exports = { NEED_TYPES, NEED_LABELS, ROLES, PAYMENT_METHODS, MIN_DONATION, NEED_AMOUNT, CURRENCY };
