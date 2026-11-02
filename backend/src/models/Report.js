const BaseModel = require('./BaseModel');
const { FUNDED } = require('./Family');

// Read-only totals for the admin report and the public impact page
class Report extends BaseModel {
  constructor(db) {
    super(db, 'donations');
  }

  donationTotals() {
    return this.db.get(`
      SELECT COALESCE(SUM(amount), 0) AS total_raised, COUNT(*) AS donation_count,
             COUNT(DISTINCT user_id) AS donor_count, COUNT(DISTINCT beneficiary_id) AS families_helped
      FROM donations WHERE status = 'completed'`);
  }

  byPurpose() {
    return this.db.all(`
      SELECT purpose, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
      FROM donations WHERE status = 'completed' GROUP BY purpose`);
  }

  byStatus() {
    return this.db.all('SELECT status, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total FROM donations GROUP BY status');
  }

  familiesByStatus() {
    return this.db.all('SELECT verification_status AS status, COUNT(*) AS count FROM beneficiaries GROUP BY verification_status');
  }

  needVsFunding() {
    return this.db.get(`
      SELECT COALESCE(SUM(b.need_amount), 0) AS total_need,
             COALESCE(SUM(MIN(b.need_amount, ${FUNDED})), 0) AS total_funded,
             COALESCE(SUM(CASE WHEN ${FUNDED} >= b.need_amount THEN 1 ELSE 0 END), 0) AS fully_funded
      FROM beneficiaries b WHERE b.verification_status = 'approved'`);
  }
}

module.exports = Report;
