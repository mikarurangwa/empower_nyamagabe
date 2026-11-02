const { AppError } = require('../utils/AppError');

function notFoundHandler(req, res) {
  res.status(404).json({ success: false, message: 'Route not found' });
}

function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ success: false, message: err.message });
  }

  // Bad JSON and similar request errors from Express
  const status = Number(err.status || err.statusCode);
  if (status >= 400 && status < 500) {
    return res.status(status).json({ success: false, message: 'Bad request' });
  }

  console.error(err);
  res.status(500).json({ success: false, message: 'Something went wrong on our side' });
}

module.exports = { notFoundHandler, errorHandler };
