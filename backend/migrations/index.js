const fs = require('fs');
const path = require('path');
const db = require('../src/config/database');

// Runs every numbered migration file once, in order
async function runMigrations() {
  await db.run(`CREATE TABLE IF NOT EXISTS migrations (
    name TEXT PRIMARY KEY,
    run_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  const done = new Set((await db.all('SELECT name FROM migrations')).map((m) => m.name));
  const files = fs.readdirSync(__dirname).filter((f) => /^\d+_.*\.js$/.test(f)).sort();

  for (const file of files) {
    if (done.has(file)) continue;
    await require(path.join(__dirname, file)).up(db);
    await db.run('INSERT INTO migrations (name) VALUES (?)', [file]);
    if (process.env.NODE_ENV !== 'test') console.log(`Migration ran: ${file}`);
  }
}

module.exports = runMigrations;
