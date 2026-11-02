const { ValidationError } = require('./AppError');
const { PAYMENT_METHODS, MIN_DONATION, CURRENCY } = require('../config/constants');
const { parseAmount } = require('./validators');
const { remainingNeed } = require('./helpers');

function readAmount(raw) {
  const amount = Math.floor(parseAmount(raw));
  if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError('Enter a valid amount');
  if (amount < MIN_DONATION) throw new ValidationError('The minimum donation is 100 RWF');
  return amount;
}

function readPaymentMethod(raw) {
  const method = String(raw || '').toLowerCase();
  if (!PAYMENT_METHODS.includes(method)) throw new ValidationError('Choose Mobile Money or card');
  return method;
}

// A family can only receive money once approved, and never more than it still needs
function checkFamilyCanReceive(family, amount) {
  if (!family || family.verification_status !== 'approved') {
    throw new ValidationError('This family is not verified yet');
  }
  const remaining = remainingNeed(family);
  if (remaining <= 0) throw new ValidationError('This family is already fully funded. Please choose another one.');
  if (amount > remaining) {
    throw new ValidationError(`This family only needs ${remaining.toLocaleString('en-US')} RWF more. Please give that amount or less.`);
  }
  return remaining;
}

// We only trust Flutterwave's own record of the payment, not the browser redirect
function paymentMatches(verified, txRef, donation) {
  return Boolean(
    verified &&
      String(verified.status).toLowerCase() === 'successful' &&
      String(verified.tx_ref) === String(txRef) &&
      Number(verified.amount) === Number(donation.amount) &&
      String(verified.currency || '').toUpperCase() === CURRENCY
  );
}

module.exports = { readAmount, readPaymentMethod, checkFamilyCanReceive, paymentMatches };
