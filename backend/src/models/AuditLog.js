const BaseModel = require('./BaseModel');

class AuditLog extends BaseModel {
  constructor(db) {
    super(db, 'audit_logs');
  }

  // A failed log write should never break the request itself
  async add(actorId, action, entityType, entityId, details) {
    try {
      await this.insert(
        ['actor_user_id', 'action', 'entity_type', 'entity_id', 'details'],
        [actorId || null, action, entityType || null, entityId != null ? String(entityId) : null,
          details ? JSON.stringify(details).slice(0, 5000) : null]
      );
    } catch (err) {
      console.warn('Could not write audit log:', err.message);
    }
  }

  list(limit = 200) {
    return this.db.all(
      `SELECT a.*, u.name AS actor_name, u.email AS actor_email
       FROM audit_logs a LEFT JOIN users u ON a.actor_user_id = u.id
       ORDER BY a.created_at DESC, a.id DESC LIMIT ?`,
      [limit]
    );
  }
}

module.exports = AuditLog;
