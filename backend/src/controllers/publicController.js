const { reports } = require('../services');
const asyncHandler = require('../utils/asyncHandler');

exports.impact = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await reports.publicImpact() });
});

exports.health = (req, res) => {
  res.json({ success: true, message: 'API is running', time: new Date().toISOString() });
};
