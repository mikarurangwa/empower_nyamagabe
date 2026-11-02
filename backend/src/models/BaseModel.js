// Shared parent for every model. Each model owns the SQL for one table.
class BaseModel {
  constructor(db, table) {
    if (new.target === BaseModel) throw new TypeError('BaseModel cannot be used directly');
    this.db = db;
    this.table = table;
  }

  findById(id) {
    return this.db.get(`SELECT * FROM ${this.table} WHERE id = ?`, [id]);
  }

  async insert(columns, values) {
    const placeholders = columns.map(() => '?').join(', ');
    const result = await this.db.run(
      `INSERT INTO ${this.table} (${columns.join(', ')}) VALUES (${placeholders})`,
      values
    );
    return result.lastID;
  }
}

module.exports = BaseModel;
