const sqlite3 = require('sqlite3');

// Talks to SQLite. Locally it opens a database file; when the address starts with
// libsql:// (a Turso database) it uses the hosted copy, so data survives restarts.
class Database {
  #conn = null;
  #remote = null;

  connect(target, authToken) {
    if (/^(libsql|https?):\/\//.test(String(target))) {
      const { createClient } = require('@libsql/client');
      this.#remote = createClient({ url: target, authToken });
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      this.#conn = new sqlite3.Database(target, (err) => (err ? reject(err) : resolve()));
    });
  }

  // Turso returns rows as arrays with column names; turn them into plain objects
  async #query(sql, params) {
    const result = await this.#remote.execute({ sql, args: params });
    const rows = result.rows.map((row) => Object.fromEntries(result.columns.map((col, i) => [col, row[i]])));
    return { rows, lastID: Number(result.lastInsertRowid || 0), changes: result.rowsAffected };
  }

  async get(sql, params = []) {
    if (this.#remote) return (await this.#query(sql, params)).rows[0];
    return new Promise((resolve, reject) => {
      this.#conn.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
    });
  }

  async all(sql, params = []) {
    if (this.#remote) return (await this.#query(sql, params)).rows;
    return new Promise((resolve, reject) => {
      this.#conn.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });
  }

  async run(sql, params = []) {
    if (this.#remote) {
      const { lastID, changes } = await this.#query(sql, params);
      return { lastID, changes };
    }
    return new Promise((resolve, reject) => {
      this.#conn.run(sql, params, function onRun(err) {
        if (err) return reject(err);
        resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  close() {
    if (this.#remote) {
      this.#remote.close();
      this.#remote = null;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      if (!this.#conn) return resolve();
      this.#conn.close(() => resolve());
      this.#conn = null;
    });
  }
}

module.exports = new Database();
