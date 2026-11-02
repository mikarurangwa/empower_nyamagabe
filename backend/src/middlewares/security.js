const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const env = require('../config/env');

const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'script-src': ["'self'"],
      'style-src': ["'self'", 'https:', "'unsafe-inline'"],
      'font-src': ["'self'", 'https:', 'data:'],
      'img-src': ["'self'", 'data:', 'https:'],
      'connect-src': ["'self'", 'https:'],
    },
  },
  crossOriginEmbedderPolicy: false,
});

// Slows down password guessing on login, sign-up and reset
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.authRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Please wait a few minutes and try again.' },
});

module.exports = { securityHeaders, authLimiter };
