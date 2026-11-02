const BaseModel = require('./BaseModel');

const JOINS = `
  FROM donations d
  JOIN users u ON d.user_id = u.id
  LEFT JOIN beneficiaries b ON d.beneficiary_id = b.id`;

class Donation extends BaseModel {
  constructor(db) {
    super(db, 'donations');
  }

  createPending({ userId, familyId, amount, purpose, paymentMethod, txRef, note, isAnonymous }) {
    return this.insert(
      ['user_id', 'beneficiary_id', 'amount', 'purpose', 'payment_method', 'status', 'transaction_id', 'note', 'is_anonymous'],
      [userId, familyId, amount, purpose, paymentMethod, 'pending', txRef, note, isAnonymous ? 1 : 0]
    );
  }

  findByTxRef(txRef) {
    return this.db.get('SELECT * FROM donations WHERE transaction_id = ?', [txRef]);
  }

  findDetailsByTxRef(txRef) {
    return this.db.get(
      `SELECT d.*, u.name AS donor_name, u.email AS donor_email, u.phone AS donor_phone,
              b.family_code, b.sector AS family_sector, b.ubudehe_category
       ${JOINS} WHERE d.transaction_id = ?`,
      [txRef]
    );
  }

  findDetailsById(id) {
    return this.db.get(`SELECT d.*, u.name AS donor_name, u.email AS donor_email, b.family_code ${JOINS} WHERE d.id = ?`, [id]);
  }

  listByUser(userId) {
    return this.db.all(
      `SELECT d.*, b.family_code, b.sector AS family_sector ${JOINS}
       WHERE d.user_id = ? ORDER BY d.created_at DESC, d.id DESC`,
      [userId]
    );
  }

  listRecent(limit = 100) {
    return this.db.all(`SELECT d.*, u.name AS donor_name, b.family_code ${JOINS} ORDER BY d.created_at DESC, d.id DESC LIMIT ?`, [limit]);
  }

  markCompleted(id, providerId) {
    return this.db.run(
      `UPDATE donations SET status = 'completed', provider_transaction_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [providerId, id]
    );
  }

  markFailed(txRef, providerId = null) {
    return this.db.run(
      `UPDATE donations
       SET status = 'failed', provider_transaction_id = COALESCE(?, provider_transaction_id), updated_at = CURRENT_TIMESTAMP
       WHERE transaction_id = ? AND status = 'pending'`,
      [providerId, txRef]
    );
  }

  totalsForUser(userId) {
    return this.db.get(
      `SELECT COALESCE(SUM(amount), 0) AS total_donated, COUNT(*) AS donation_count,
              COUNT(DISTINCT beneficiary_id) AS families_helped
       FROM donations WHERE user_id = ? AND status = 'completed'`,
      [userId]
    );
  }

  listForExport() {
    return this.db.all(`
      SELECT d.transaction_id, d.provider_transaction_id, d.status, d.amount, d.purpose, b.family_code,
             d.payment_method, d.note, d.is_anonymous, d.created_at,
             u.name AS donor_name, u.email AS donor_email, u.phone AS donor_phone
      ${JOINS} ORDER BY d.created_at DESC`);
  }
}

module.exports = Donation;
