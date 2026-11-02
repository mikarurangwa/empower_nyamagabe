const sqlite3 = require('sqlite3');

// Wraps the sqlite3 callbacks in promises so the rest of the code can use async/await
class Database {
  #conn = null;

  connect(filename) {
    return new Promise((resolve, reject) => {
      this.#conn = new sqlite3.Database(filename, (err) => (err ? reject(err) : resolve()));
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.#conn.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.#conn.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.#conn.run(sql, params, function onRun(err) {
        if (err) return reject(err);
        resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  close() {
    return new Promise((resolve) => {
      if (!this.#conn) return resolve();
      this.#conn.close(() => resolve());
      this.#conn = null;
    });
  }
}

module.exports = new Database();
