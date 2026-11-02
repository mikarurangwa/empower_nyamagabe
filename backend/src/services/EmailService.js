const nodemailer = require('nodemailer');
const { NEED_LABELS } = require('../config/constants');

// Email is optional. Without SMTP settings, send() quietly returns false.
class EmailService {
  constructor(smtp, appUrl) {
    this.smtp = smtp;
    this.appUrl = appUrl;
  }

  isConfigured() {
    return Boolean(this.smtp.host && this.smtp.user && this.smtp.pass);
  }

  async send({ to, subject, text, html }) {
    if (!this.isConfigured()) return false;
    try {
      const transporter = nodemailer.createTransport({
        host: this.smtp.host,
        port: this.smtp.port,
        secure: this.smtp.secure,
        auth: { user: this.smtp.user, pass: this.smtp.pass },
      });
      await transporter.sendMail({ from: this.smtp.from, to, subject, text, html });
      return true;
    } catch (err) {
      console.warn('Email not sent:', err.message);
      return false;
    }
  }

  static #list(rows) {
    return `<ul>${rows.map(([k, v]) => `<li><strong>${k}:</strong> ${v}</li>`).join('')}</ul>`;
  }

  async donationConfirmed(d) {
    const purpose = NEED_LABELS[d.purpose] || d.purpose;
    const family = d.family_code || 'N/A';
    const details = [['Amount', `${d.amount} RWF`], ['Family', family], ['Purpose', purpose], ['Reference', d.transaction_id]];

    if (d.donor_email) {
      const receiptUrl = `${this.appUrl}/receipt?tx_ref=${encodeURIComponent(d.transaction_id)}`;
      await this.send({
        to: d.donor_email,
        subject: 'Your donation is confirmed',
        text: `Thank you. Your donation of ${d.amount} RWF to family ${family} (${purpose}) went through.\nReceipt: ${receiptUrl}`,
        html: `<p>Thank you. Your donation went through.</p>${EmailService.#list(details)}<p><a href="${receiptUrl}">View your receipt</a></p>`,
      });
    }

    if (this.smtp.adminNotifyEmail) {
      await this.send({
        to: this.smtp.adminNotifyEmail,
        subject: 'New donation received',
        text: `${d.donor_name} gave ${d.amount} RWF to family ${family} (${purpose}). Ref: ${d.transaction_id}`,
        html: EmailService.#list([['Donor', `${d.donor_name} (${d.donor_email || 'no email'})`], ...details]),
      });
    }
  }
}

module.exports = EmailService;
