const { auth } = require('../services');
const asyncHandler = require('../utils/asyncHandler');
const { publicUser, baseUrl } = require('../utils/helpers');

exports.signup = asyncHandler(async (req, res) => {
  const { user, token } = await auth.signup(req.body);
  res.status(201).json({ success: true, message: 'Account created', user, token });
});

exports.login = asyncHandler(async (req, res) => {
  const { user, token } = await auth.login(req.body);
  res.json({ success: true, message: 'Logged in', user, token });
});

exports.me = (req, res) => {
  res.json({ success: true, user: publicUser(req.user) });
};

exports.requestReset = asyncHandler(async (req, res) => {
  await auth.requestPasswordReset(req.body.email, baseUrl(req));
  res.json({ success: true, message: 'If that email has an account, we sent a reset link to it.' });
});

exports.confirmReset = asyncHandler(async (req, res) => {
  await auth.resetPassword(req.body);
  res.json({ success: true, message: 'Password updated. You can log in now.' });
});
