const BaseModel = require('./BaseModel');

class User extends BaseModel {
  constructor(db) {
    super(db, 'users');
  }

  findByEmail(email) {
    return this.db.get('SELECT * FROM users WHERE lower(email) = lower(?)', [email]);
  }

  findByPhone(phone) {
    return this.db.get('SELECT * FROM users WHERE phone = ?', [phone]);
  }

  exists(email, phone) {
    return this.db.get('SELECT id FROM users WHERE email = ? OR phone = ?', [email || null, phone || null]);
  }

  create({ name, email, phone, passwordHash, role = 'donor', sector = null }) {
    return this.insert(
      ['name', 'email', 'phone', 'password_hash', 'role', 'sector'],
      [name, email || null, phone || null, passwordHash, role, sector]
    );
  }

  updatePassword(id, passwordHash) {
    return this.db.run('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [passwordHash, id]);
  }

  listLeaders() {
    return this.db.all(`
      SELECT u.id, u.name, u.email, u.phone, u.sector, u.created_at,
        (SELECT COUNT(*) FROM beneficiaries b WHERE b.submitted_by = u.id) AS submitted,
        (SELECT COUNT(*) FROM beneficiaries b WHERE b.verified_by = u.id) AS decided
      FROM users u
      WHERE u.role = 'leader'
      ORDER BY u.created_at DESC`);
  }
}

module.exports = User;
