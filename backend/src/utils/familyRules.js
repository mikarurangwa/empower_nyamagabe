const { ValidationError, ForbiddenError } = require('./AppError');
const { NEED_TYPES, NEED_AMOUNT } = require('../config/constants');
const { clean, isPhone, normalizePhone, parseAmount } = require('./validators');

function readSubmission(body, user) {
  const b = body || {};
  const f = {
    headName: clean(b.headName, 120),
    phone: clean(b.phone, 30),
    cell: clean(b.cell, 80),
    village: clean(b.village, 80),
    needType: String(b.needType || ''),
    needDescription: clean(b.needDescription, 400),
    notes: clean(b.notes, 1000),
    ubudehe: Number(b.ubudeheCategory),
    householdSize: b.householdSize ? Number(b.householdSize) : null,
    needAmount: Math.floor(parseAmount(b.needAmount)),
  };

  // Leaders can only submit in their own sector
  f.sector = user.is_admin ? clean(b.sector, 80) : user.sector || '';

  if (!f.sector) throw new ValidationError(user.is_admin ? 'Sector is required' : 'Your account has no sector yet. Ask the admin to set one.');
  if (!f.headName) throw new ValidationError('Head of household name is required');
  if (f.phone && !isPhone(f.phone)) throw new ValidationError('Enter a valid phone number');
  if (![1, 2, 3, 4].includes(f.ubudehe)) throw new ValidationError('Choose the Ubudehe category');
  if (!NEED_TYPES.includes(f.needType)) throw new ValidationError('Need must be school fees or health insurance');
  if (!(f.needAmount >= NEED_AMOUNT.min && f.needAmount <= NEED_AMOUNT.max)) {
    throw new ValidationError('Amount needed must be between 1,000 and 5,000,000 RWF');
  }
  if (f.needDescription.length < 10) throw new ValidationError('Public description must be at least 10 characters');
  if (f.notes.length < 10) throw new ValidationError('Add supporting notes for the person reviewing');
  if (f.householdSize !== null && !(Number.isInteger(f.householdSize) && f.householdSize >= 1 && f.householdSize <= 30)) {
    throw new ValidationError('Household size must be between 1 and 30');
  }

  f.phone = normalizePhone(f.phone);
  return f;
}

function readDecision(body) {
  const decision = String((body && body.decision) || '');
  const notes = clean(body && body.notes, 500);
  if (!['approve', 'reject'].includes(decision)) throw new ValidationError('Decision must be approve or reject');
  if (decision === 'reject' && notes.length < 5) throw new ValidationError('Give a reason for rejecting this family');
  return { decision, notes };
}

// A second person always decides: never the leader who submitted the family
function checkCanDecide(family, user) {
  if (family.verification_status !== 'pending') throw new ValidationError(`This family is already ${family.verification_status}`);
  if (user.is_admin) return;
  if (String(family.sector).toLowerCase() !== String(user.sector || '').toLowerCase()) {
    throw new ForbiddenError('You can only review families in your own sector');
  }
  if (Number(family.submitted_by) === Number(user.id)) {
    throw new ForbiddenError('Another leader or the admin has to review a family you submitted');
  }
}

module.exports = { readSubmission, readDecision, checkCanDecide };
