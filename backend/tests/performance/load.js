// Load test: fills a temporary database with realistic data, then sends many
// requests at once to the busiest public endpoints and reports speed.
// Usage: npm run test:load  (optional: CONNECTIONS=20 SECONDS=10, NO_INDEXES=1 to compare)
const fs = require('fs');
const os = require('os');
const path = require('path');

const dbFile = path.join(os.tmpdir(), `en-load-${Date.now()}.db`);
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'load-test';
process.env.BCRYPT_ROUNDS = '4';
process.env.DB_PATH = dbFile;

const db = require('../../src/config/database');
const runMigrations = require('../../migrations');
const app = require('../../app');

const FAMILIES = 100;
const DONATIONS = 5000;
const CONNECTIONS = Number(process.env.CONNECTIONS) || 20;
const SECONDS = Number(process.env.SECONDS) || 10;

async function fillDatabase() {
  await db.run('BEGIN');
  await db.run("INSERT INTO users (name, email, password_hash, role) VALUES ('Load Donor', 'load@test.rw', 'x', 'donor')");
  for (let i = 1; i <= FAMILIES; i++) {
    await db.run(
      `INSERT INTO beneficiaries (family_code, name, sector, ubudehe_category, support_type, need_description,
        need_amount, notes, verification_status, verified_at)
       VALUES (?, 'Name', 'Gasaka', ?, ?, 'School fees for this term', ?, 'notes', 'approved', datetime('now', ?))`,
      [`NYA-${String(i).padStart(4, '0')}`, 1 + (i % 4), i % 2 ? 'education' : 'health', 200000 + i * 1000, `-${i} days`]
    );
  }
  for (let i = 0; i < DONATIONS; i++) {
    await db.run(
      "INSERT INTO donations (user_id, beneficiary_id, amount, purpose, status, transaction_id) VALUES (1, ?, ?, 'education', ?, ?)",
      [1 + (i % FAMILIES), 1000 + (i % 7) * 500, i % 5 ? 'completed' : 'failed', `EN-load-${i}`]
    );
  }
  await db.run('COMMIT');
}

async function hammer(url) {
  const times = [];
  let errors = 0;
  const end = Date.now() + SECONDS * 1000;

  async function worker() {
    while (Date.now() < end) {
      const start = process.hrtime.bigint();
      try {
        const res = await fetch(url);
        await res.arrayBuffer();
        if (!res.ok) errors++;
      } catch (err) {
        errors++;
      }
      times.push(Number(process.hrtime.bigint() - start) / 1e6);
    }
  }

  await Promise.all(Array.from({ length: CONNECTIONS }, worker));
  times.sort((a, b) => a - b);
  const pick = (p) => times[Math.min(times.length - 1, Math.floor((p / 100) * times.length))];
  return {
    requests: times.length,
    perSecond: Math.round(times.length / SECONDS),
    p50: pick(50).toFixed(1),
    p95: pick(95).toFixed(1),
    errors,
  };
}

async function main() {
  await db.connect(dbFile);
  await runMigrations();
  if (process.env.NO_INDEXES) {
    for (const name of ['idx_donations_family_status', 'idx_donations_tx_ref', 'idx_donations_user', 'idx_families_status_sector']) {
      await db.run(`DROP INDEX IF EXISTS ${name}`);
    }
  }
  await fillDatabase();

  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;

  console.log(`${process.env.NO_INDEXES ? 'Without' : 'With'} indexes: ${FAMILIES} families, ${DONATIONS} donations, ${CONNECTIONS} connections, ${SECONDS}s per endpoint\n`);
  const rows = [];
  for (const endpoint of ['/families/verified', '/public/impact', '/public/health']) {
    const r = await hammer(base + endpoint);
    rows.push({ endpoint, 'req/s': r.perSecond, 'p50 ms': r.p50, 'p95 ms': r.p95, requests: r.requests, errors: r.errors });
  }
  console.table(rows);
  console.log(`Memory used: ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`);

  server.close();
  await db.close();
  fs.rmSync(dbFile, { force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
