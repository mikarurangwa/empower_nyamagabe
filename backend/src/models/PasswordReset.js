const BaseModel = require('./BaseModel');

class PasswordReset extends BaseModel {
  constructor(db) {
    super(db, 'password_resets');
  }

  create(userId, tokenHash, expiresAt) {
    return this.insert(['user_id', 'token_hash', 'expires_at'], [userId, tokenHash, expiresAt.toISOString()]);
  }

  findValid(userId, tokenHash) {
    return this.db.get(
      `SELECT * FROM password_resets
       WHERE user_id = ? AND token_hash = ? AND used = 0 AND expires_at > ?
       ORDER BY created_at DESC`,
      [userId, tokenHash, new Date().toISOString()]
    );
  }

  markUsed(id) {
    return this.db.run('UPDATE password_resets SET used = 1 WHERE id = ?', [id]);
  }
}

module.exports = PasswordReset;
