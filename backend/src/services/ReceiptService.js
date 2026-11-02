const PDFDocument = require('pdfkit');
const { NEED_LABELS } = require('../config/constants');

const GREEN = '#1d5a3a';

class ReceiptService {
  writePdf(d, stream) {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    doc.pipe(stream);

    const line = (color, width) => doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(color).lineWidth(width).stroke();
    const field = (label, value) => {
      doc.fontSize(11).fillColor('#555').text(label, { continued: true }).fillColor('#000').text(` ${value}`);
    };

    doc.fontSize(22).fillColor(GREEN).text('Empower Nyamagabe');
    doc.fontSize(12).fillColor('#444').text('Donation receipt');
    doc.moveDown(0.5);
    line(GREEN, 2);
    doc.moveDown(1);

    field('Reference:', d.transaction_id);
    field('Status:', String(d.status || '').toUpperCase());
    field('Date:', String(d.created_at || ''));
    field('Amount:', `${Number(d.amount).toLocaleString('en-US')} RWF`);
    field('Family:', d.family_code ? `${d.family_code} (${d.family_sector || 'Nyamagabe'} sector)` : 'N/A');
    field('Paid for:', NEED_LABELS[d.purpose] || d.purpose);
    if (d.note) field('Note:', d.note);
    if (d.provider_transaction_id) field('Flutterwave ID:', d.provider_transaction_id);

    doc.moveDown(1);
    line('#dddddd', 1);
    doc.moveDown(1);

    doc.fontSize(13).fillColor('#000').text('Donor');
    doc.moveDown(0.4);
    field('Name:', d.donor_name);
    if (d.donor_email) field('Email:', d.donor_email);
    if (d.donor_phone) field('Phone:', d.donor_phone);

    doc.moveDown(2);
    doc.fontSize(10).fillColor('#666').text(
      'Thank you for supporting a family in Nyamagabe District. Only the family code is shown to protect their privacy. ' +
        'Payments are handled by Flutterwave; we never store Mobile Money PINs or card numbers.'
    );
    doc.end();
  }
}

module.exports = ReceiptService;
