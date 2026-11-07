const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..');

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,
  appBaseUrl: process.env.APP_BASE_URL || '',
  dbPath: path.resolve(rootDir, process.env.DB_PATH || 'empower_nyamagabe.db'),
  frontendDir: path.resolve(rootDir, '..', 'frontend'),

  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS) || 10,
  authRateLimit: Number(process.env.AUTH_RATE_LIMIT) || 20,

  admin: {
    email: (process.env.ADMIN_EMAIL || 'admin@empowernyamagabe.org').toLowerCase(),
    password: process.env.ADMIN_PASSWORD || '',
  },

  flutterwave: {
    secretKey: process.env.FLW_SECRET_KEY || '',
    webhookHash: process.env.FLW_WEBHOOK_SECRET_HASH || '',
    baseUrl: 'https://api.flutterwave.com/v3',
  },

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'no-reply@empowernyamagabe.org',
    adminNotifyEmail: process.env.ADMIN_NOTIFY_EMAIL || process.env.ADMIN_EMAIL || '',
  },
};
