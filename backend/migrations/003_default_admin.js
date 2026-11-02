const bcrypt = require('bcryptjs');
const env = require('../src/config/env');

exports.up = async (db) => {
  const existing = await db.get('SELECT id FROM users WHERE email = ?', [env.admin.email]);
  if (existing) return;

  const hash = await bcrypt.hash(env.admin.password, env.bcryptRounds);
  await db.run(
    "INSERT INTO users (name, email, password_hash, is_admin, role) VALUES (?, ?, ?, 1, 'admin')",
    ['Administrator', env.admin.email, hash]
  );
  if (env.nodeEnv !== 'test') console.log(`Admin account created: ${env.admin.email}`);
};
