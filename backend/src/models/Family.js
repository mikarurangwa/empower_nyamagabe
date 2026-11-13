const BaseModel = require('./BaseModel');

// Total of a family's completed donations
const FUNDED = `COALESCE((SELECT SUM(d.amount) FROM donations d
  WHERE d.beneficiary_id = b.id AND d.status = 'completed'), 0)`;

class Family extends BaseModel {
  constructor(db) {
    super(db, 'beneficiaries');
  }

  findWithFunding(id) {
    return this.db.get(`SELECT b.*, ${FUNDED} AS funded FROM beneficiaries b WHERE b.id = ?`, [id]);
  }

  create(f) {
    return this.insert(
      ['name', 'phone', 'sector', 'cell', 'village', 'ubudehe_category', 'household_size', 'support_type',
        'need_description', 'need_amount', 'notes', 'submitted_by'],
      [f.headName, f.phone, f.sector, f.cell, f.village, f.ubudehe, f.householdSize, f.needType,
        f.needDescription, f.needAmount, f.notes, f.submittedBy]
    );
  }

  // A family already waiting or approved with the same head, sector and need
  findDuplicate(f) {
    return this.db.get(
      `SELECT family_code FROM beneficiaries
       WHERE lower(name) = lower(?) AND lower(sector) = lower(?) AND support_type = ?
         AND verification_status IN ('pending', 'approved')
       LIMIT 1`,
      [f.headName, f.sector, f.needType]
    );
  }

  setCode(id, code) {
    return this.db.run('UPDATE beneficiaries SET family_code = ? WHERE id = ?', [code, id]);
  }

  // sector = null returns every sector (admin view)
  listQueue(sector) {
    return this.db.all(
      `SELECT b.*, ${FUNDED} AS funded, s.name AS submitted_by_name, v.name AS verified_by_name
       FROM beneficiaries b
       LEFT JOIN users s ON s.id = b.submitted_by
       LEFT JOIN users v ON v.id = b.verified_by
       WHERE (? IS NULL OR lower(b.sector) = lower(?))
       ORDER BY CASE b.verification_status WHEN 'pending' THEN 0 ELSE 1 END, b.created_at DESC`,
      [sector, sector]
    );
  }

  // Only safe columns here, this list is public
  listVerified() {
    return this.db.all(`
      SELECT b.id, b.family_code, b.sector, b.ubudehe_category, b.support_type,
             b.need_description, b.need_amount, b.verified_at, ${FUNDED} AS funded
      FROM beneficiaries b
      WHERE b.verification_status = 'approved'`);
  }

  saveDecision({ id, status, verifierId, notes }) {
    return this.db.run(
      `UPDATE beneficiaries
       SET verification_status = ?, verified_by = ?, verified_at = CURRENT_TIMESTAMP,
           verification_notes = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND verification_status = 'pending'`,
      [status, verifierId, notes || null, id]
    );
  }

  listForExport() {
    return this.db.all(`
      SELECT b.id, b.family_code, b.name, b.phone, b.sector, b.cell, b.village, b.ubudehe_category,
             b.household_size, b.support_type AS need_type, b.need_description, b.need_amount,
             ${FUNDED} AS funded, b.verification_status, b.verification_notes, b.verified_at,
             b.notes AS supporting_notes, b.created_at
      FROM beneficiaries b
      ORDER BY b.created_at DESC`);
  }
}

Family.FUNDED = FUNDED;
module.exports = Family;
