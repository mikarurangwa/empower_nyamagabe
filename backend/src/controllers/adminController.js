const services = require('../services');
const asyncHandler = require('../utils/asyncHandler');

exports.createLeader = asyncHandler(async (req, res) => {
  const leader = await services.auth.createLeader(req.user, req.body);
  res.status(201).json({ success: true, message: 'Leader account created', leader });
});

exports.listLeaders = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await services.auth.listLeaders() });
});

exports.auditLogs = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await services.audit.list(200) });
});

exports.report = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await services.reports.summary() });
});

exports.exportData = asyncHandler(async (req, res) => {
  await services.exports.send(res, req.params.dataset, req.params.format);
});
