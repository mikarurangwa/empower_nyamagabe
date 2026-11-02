const crypto = require('crypto');
const { NEED_LABELS, CURRENCY } = require('../config/constants');
const { readAmount, readPaymentMethod, checkFamilyCanReceive, paymentMatches } = require('../utils/donationRules');
const { clean, isPhone } = require('../utils/validators');
const { AppError, ValidationError, ForbiddenError, NotFoundError } = require('../utils/AppError');

class DonationService {
  constructor({ donations, families, users, audit, gateway, email, webhookHash }) {
    this.donations = donations;
    this.families = families;
    this.users = users;
    this.audit = audit;
    this.gateway = gateway;
    this.email = email;
    this.webhookHash = webhookHash;
  }

  static #checkOwner(ownerId, user) {
    if (Number(ownerId) !== Number(user.id) && !user.is_admin) throw new ForbiddenError();
  }

  #emailLater(donationId) {
    setImmediate(async () => {
      try {
        const details = await this.donations.findDetailsById(donationId);
        if (details) await this.email.donationConfirmed(details);
      } catch (err) {
        console.warn('Donation email failed:', err.message);
      }
    });
  }

  async create(user, body, appUrl) {
    const { familyId, amount, paymentMethod, paymentDetails, note, isAnonymous } = body;
    if (!familyId || !amount || !paymentMethod) throw new ValidationError('Choose a family, an amount and a payment method');

    const method = readPaymentMethod(paymentMethod);
    const safeAmount = readAmount(amount);
    const family = await this.families.findWithFunding(Number(familyId));
    checkFamilyCanReceive(family, safeAmount);

    const donor = await this.users.findById(user.id);
    const phone = (paymentDetails && paymentDetails.phoneNumber) || donor.phone || '';
    if (method === 'mobile_money' && !isPhone(phone)) throw new ValidationError('Enter a valid Mobile Money number');

    // The purpose comes from the family's verified need, not from the request
    const purpose = family.support_type;
    const txRef = `EN-${crypto.randomUUID()}`;
    const donationId = await this.donations.createPending({
      userId: donor.id,
      familyId: family.id,
      amount: safeAmount,
      purpose,
      paymentMethod: method,
      txRef,
      note: clean(note, 280),
      isAnonymous: !!isAnonymous,
    });
    await this.audit.add(donor.id, 'donation_created', 'donations', donationId, {
      amount: safeAmount, purpose, family: family.family_code, paymentMethod: method,
    });

    try {
      const paymentLink = await this.gateway.createPaymentLink({
        amount: safeAmount,
        currency: CURRENCY,
        txRef,
        customer: { email: donor.email || `donor${donor.id}@empowernyamagabe.org`, name: donor.name, phonenumber: phone },
        redirectUrl: `${appUrl}/api/payments/flutterwave/callback`,
        title: 'Empower Nyamagabe',
        description: `${NEED_LABELS[purpose]} for family ${family.family_code}`,
        paymentOptions: method === 'mobile_money' ? 'mobilemoneyrwanda' : 'card',
        meta: { donation_id: String(donationId), family_code: family.family_code, purpose },
      });
      return {
        paymentLink,
        donation: { id: donationId, amount: safeAmount, purpose, familyCode: family.family_code, txRef, status: 'pending' },
      };
    } catch (err) {
      console.error('Payment provider error:', (err.response && err.response.data) || err.message);
      await this.donations.markFailed(txRef);
      throw new AppError('We could not reach the payment provider. Please try again shortly.', 502);
    }
  }

  // Flutterwave sends the donor back here. Returns where to send them next.
  async handleCallback({ status, tx_ref: txRef, transaction_id: providerId }) {
    if (!txRef) return '/?payment=failed';
    const failed = `/?payment=failed&tx_ref=${encodeURIComponent(txRef)}`;

    if (status !== 'successful' || !providerId) {
      await this.donations.markFailed(txRef);
      return failed;
    }

    try {
      const donation = await this.donations.findByTxRef(txRef);
      if (!donation) return failed;
      if (donation.status === 'completed') return `/?payment=success&tx_ref=${encodeURIComponent(txRef)}`;

      const verified = await this.gateway.verifyTransaction(providerId);
      if (!paymentMatches(verified, txRef, donation)) {
        await this.donations.markFailed(txRef, String(providerId));
        return failed;
      }

      await this.donations.markCompleted(donation.id, String(providerId));
      await this.audit.add(null, 'donation_completed', 'donations', donation.id, { tx_ref: txRef });
      this.#emailLater(donation.id);
      return `/?payment=success&tx_ref=${encodeURIComponent(txRef)}`;
    } catch (err) {
      console.error('Payment check failed:', err.message);
      await this.donations.markFailed(txRef);
      return failed;
    }
  }

  // Server-to-server update from Flutterwave. Returns the HTTP status to reply with.
  async handleWebhook(signature, body) {
    if (!this.webhookHash) return 200;
    if (signature !== this.webhookHash) return 401;

    const data = (body && body.data) || {};
    if (!data.tx_ref || !data.id) return 200;

    const donation = await this.donations.findByTxRef(String(data.tx_ref));
    if (!donation) return 200;

    if (data.status === 'successful' && donation.status !== 'completed') {
      const verified = await this.gateway.verifyTransaction(data.id).catch(() => null);
      if (!paymentMatches(verified, data.tx_ref, donation)) return 200;
      await this.donations.markCompleted(donation.id, String(data.id));
      await this.audit.add(null, 'donation_completed_webhook', 'donations', donation.id, { tx_ref: data.tx_ref });
      this.#emailLater(donation.id);
    } else if (data.status === 'failed' || data.status === 'cancelled') {
      await this.donations.markFailed(String(data.tx_ref), String(data.id));
    }
    return 200;
  }

  listForUser(requester, userId) {
    DonationService.#checkOwner(userId, requester);
    return this.donations.listByUser(userId);
  }

  listRecent() {
    return this.donations.listRecent(100);
  }

  async findForUser(requester, txRef) {
    const row = await this.donations.findDetailsByTxRef(String(txRef || '').trim());
    if (!row) throw new NotFoundError('Donation not found');
    DonationService.#checkOwner(row.user_id, requester);
    return row;
  }

  async getReceipt(requester, txRef) {
    const row = await this.findForUser(requester, txRef);
    return {
      txRef: row.transaction_id,
      providerTransactionId: row.provider_transaction_id,
      status: row.status,
      amount: row.amount,
      currency: CURRENCY,
      purpose: row.purpose,
      purposeLabel: NEED_LABELS[row.purpose] || row.purpose,
      paymentMethod: row.payment_method,
      note: row.note,
      date: row.created_at,
      family: { code: row.family_code, sector: row.family_sector, ubudehe: row.ubudehe_category },
      donor: { name: row.donor_name, email: row.donor_email, phone: row.donor_phone },
    };
  }

  async getStatus(requester, txRef) {
    const row = await this.findForUser(requester, txRef);
    return { status: row.status, txRef: row.transaction_id };
  }

  async userTotals(requester, userId) {
    DonationService.#checkOwner(userId, requester);
    const row = await this.donations.totalsForUser(Number(userId));
    return { totalDonated: row.total_donated, donationCount: row.donation_count, familiesHelped: row.families_helped };
  }
}

module.exports = DonationService;
