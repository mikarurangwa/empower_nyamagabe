// Builds every model and service once and connects them together
const env = require('../config/env');
const db = require('../config/database');

const User = require('../models/User');
const Family = require('../models/Family');
const Donation = require('../models/Donation');
const AuditLog = require('../models/AuditLog');
const PasswordReset = require('../models/PasswordReset');
const Report = require('../models/Report');

const FlutterwaveGateway = require('./payment/FlutterwaveGateway');
const EmailService = require('./EmailService');
const AuthService = require('./AuthService');
const FamilyService = require('./FamilyService');
const DonationService = require('./DonationService');
const ReportService = require('./ReportService');
const ExportService = require('./ExportService');
const ReceiptService = require('./ReceiptService');

const users = new User(db);
const families = new Family(db);
const donations = new Donation(db);
const audit = new AuditLog(db);
const resets = new PasswordReset(db);

const email = new EmailService(env.smtp, env.appBaseUrl || `http://localhost:${env.port}`);
const gateway = new FlutterwaveGateway(env.flutterwave);

module.exports = {
  audit,
  auth: new AuthService({ users, resets, audit, email, settings: env }),
  families: new FamilyService({ families, audit }),
  donations: new DonationService({
    donations, families, users, audit, gateway, email, webhookHash: env.flutterwave.webhookHash,
  }),
  reports: new ReportService(new Report(db)),
  exports: new ExportService({ donations, families }),
  receipts: new ReceiptService(),
};
