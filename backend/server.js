require('dotenv').config();

const env = require('./src/config/env');
const db = require('./src/config/database');
const runMigrations = require('./migrations');
const app = require('./app');

async function start() {
  if (!env.jwtSecret) {
    console.error('JWT_SECRET is missing from .env');
    process.exit(1);
  }

  await db.connect(env.dbPath);
  await runMigrations();

  app.listen(env.port, () => {
    console.log(`Server running on http://localhost:${env.port}`);
  });
}

start().catch((err) => {require('dotenv').config();

const env = require('./src/config/env');
const db = require('./src/config/database');
const runMigrations = require('./migrations');
const services = require('./src/services');
const app = require('./app');

// Settings the server cannot run safely without
function checkSettings() {
  const required = ['JWT_SECRET'];
  if (env.nodeEnv === 'production') required.push('ADMIN_PASSWORD', 'APP_BASE_URL');

  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    console.error(`Missing from .env: ${missing.join(', ')}`);
    process.exit(1);
  }
}

async function start() {
  checkSettings();
  await db.connect(env.dbPath);
  await runMigrations();

  const admin = await services.auth.ensureAdmin();
  if (admin === 'created') console.log(`Admin account created: ${env.admin.email}`);
  if (admin === 'missing-password') console.warn('No admin account yet. Set ADMIN_PASSWORD in .env and restart.');
  if (!env.flutterwave.webhookHash) console.warn('FLW_WEBHOOK_SECRET_HASH is not set, so Flutterwave webhooks are ignored.');

  app.listen(env.port, () => {
    console.log(`Server running on http://localhost:${env.port}`);
  });
}

start().catch((err) => {
  console.error('Could not start the server:', err);
  process.exit(1);
});
  console.error('Could not start the server:', err);
  process.exit(1);
});
