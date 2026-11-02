const services = require('../services');
const asyncHandler = require('../utils/asyncHandler');
const { ForbiddenError } = require('../utils/AppError');

const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  req.user = await services.auth.userFromToken(token);
  next();
});

const requireAdmin = (req, res, next) => (req.user.is_admin ? next() : next(new ForbiddenError('Admins only')));

const requireLeader = (req, res, next) =>
  req.user.is_admin || req.user.role === 'leader' ? next() : next(new ForbiddenError('Local leaders only'));

module.exports = { authenticate, requireAdmin, requireLeader };
