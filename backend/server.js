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

start().catch((err) => {
  console.error('Could not start the server:', err);
  process.exit(1);
});
