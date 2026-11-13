const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const env = require('./src/config/env');
const routes = require('./src/routes');
const { securityHeaders } = require('./src/middlewares/security');
const { notFoundHandler, errorHandler } = require('./src/middlewares/errorHandler');

const app = express();
const pages = ['login', 'signup', 'impact', 'receipt', 'reset-password', 'privacy', 'terms'];

app.set('trust proxy', 1);
app.use(securityHeaders);
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
if (env.nodeEnv !== 'test') app.use(morgan('dev'));

app.use('/api', routes);

// Frontend: serve the static files and allow /login instead of /login.html
app.use(express.static(env.frontendDir));
pages.forEach((page) => {
  app.get(`/${page}`, (req, res) => res.sendFile(path.join(env.frontendDir, `${page}.html`)));
});

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
