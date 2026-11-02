// Families live in the "beneficiaries" table. Their name, phone, cell and village
// are private; donors only ever see the family code, sector and need.

exports.up = async (db) => {
  await db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    phone TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    role TEXT DEFAULT 'donor',
    sector TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.run(`CREATE TABLE IF NOT EXISTS beneficiaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_code TEXT UNIQUE,
    name TEXT NOT NULL,
    phone TEXT,
    sector TEXT NOT NULL,
    cell TEXT,
    village TEXT,
    ubudehe_category INTEGER,
    household_size INTEGER,
    support_type TEXT NOT NULL,
    need_description TEXT,
    need_amount INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    verification_status TEXT DEFAULT 'pending',
    submitted_by INTEGER REFERENCES users(id),
    verified_by INTEGER REFERENCES users(id),
    verified_at DATETIME,
    verification_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.run(`CREATE TABLE IF NOT EXISTS donations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    beneficiary_id INTEGER REFERENCES beneficiaries(id),
    amount INTEGER NOT NULL,
    purpose TEXT NOT NULL,
    payment_method TEXT,
    status TEXT DEFAULT 'pending',
    transaction_id TEXT,
    provider_transaction_id TEXT,
    note TEXT,
    is_anonymous INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_user_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.run(`CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    token_hash TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    used INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
};
