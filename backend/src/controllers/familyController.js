const { families } = require('../services');
const asyncHandler = require('../utils/asyncHandler');

exports.listVerified = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await families.listVerified() });
});

exports.submit = asyncHandler(async (req, res) => {
  const family = await families.submit(req.user, req.body);
  res.status(201).json({ success: true, message: `Family ${family.familyCode} sent for review`, family });
});

exports.queue = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await families.listQueue(req.user) });
});

exports.decide = asyncHandler(async (req, res) => {
  const { familyCode, status } = await families.decide(req.user, req.params.id, req.body);
  res.json({ success: true, message: `Family ${familyCode} ${status}`, status });
});
