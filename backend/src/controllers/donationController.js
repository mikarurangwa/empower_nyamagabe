const { donations, receipts } = require('../services');
const asyncHandler = require('../utils/asyncHandler');
const { baseUrl } = require('../utils/helpers');

exports.create = asyncHandler(async (req, res) => {
  const { paymentLink, donation } = await donations.create(req.user, req.body, baseUrl(req));
  res.status(201).json({ success: true, paymentLink, donation });
});

exports.callback = asyncHandler(async (req, res) => {
  res.redirect(await donations.handleCallback(req.query));
});

exports.webhook = asyncHandler(async (req, res) => {
  const status = await donations.handleWebhook(req.headers['verif-hash'], req.body);
  res.sendStatus(status);
});

exports.listMine = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await donations.listForUser(req.user, req.params.userId) });
});

exports.listAll = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await donations.listRecent() });
});

exports.receipt = asyncHandler(async (req, res) => {
  res.json({ success: true, receipt: await donations.getReceipt(req.user, req.params.txRef) });
});

exports.receiptPdf = asyncHandler(async (req, res) => {
  const donation = await donations.findForUser(req.user, req.params.txRef);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="receipt-${donation.transaction_id}.pdf"`);
  receipts.writePdf(donation, res);
});

exports.status = asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await donations.getStatus(req.user, req.params.txRef)) });
});

exports.myTotals = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await donations.userTotals(req.user, req.params.userId) });
});
