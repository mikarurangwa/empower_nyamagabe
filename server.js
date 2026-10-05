// server.js - Main backend server file
// NOTE: This project is intended for educational use.
// Payment integration uses a hosted checkout flow (Flutterwave) so this app NEVER handles raw card data.

require('dotenv').config();

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const axios = require('axios');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

// Optional dependencies (enabled when installed)
let nodemailer = null;
let PDFDocument = null;
let ExcelJS = null;
let rateLimit = null;
let ev = null;
let nodeCron = null;

try { nodemailer = require('nodemailer'); } catch (_) {}
try { PDFDocument = require('pdfkit'); } catch (_) {}
try { ExcelJS = require('exceljs'); } catch (_) {}
try { rateLimit = require('express-rate-limit'); } catch (_) {}
try { ev = require('express-validator'); } catch (_) {}
try { nodeCron = require('node-cron'); } catch (_) {}

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const JWT_SECRET = process.env.JWT_SECRET || '';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Middleware
app.use(helmet({
    contentSecurityPolicy: {
        useDefaults: true,
        directives: {
            // No inline scripts. All JS must be served from /public (self).
            "script-src": ["'self'"],
            // Allow self + https styles (FontAwesome) and inline styles for existing HTML attributes.
            "style-src": ["'self'", "https:", "'unsafe-inline'"],
            "font-src": ["'self'", "https:", "data:"],
            "img-src": ["'self'", "data:", "https:"],
            "connect-src": ["'self'", "https:"],
        }
    },
    // Avoid blocking some third‑party resources in development.
    crossOriginEmbedderPolicy: false,
}));
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Rate limiting (optional; requires express-rate-limit)
const authLimiter = rateLimit
    ? rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 20,
        standardHeaders: true,
        legacyHeaders: false,
    })
    : (req, res, next) => next();

// Validation helpers (optional; requires express-validator)
const validate = (checks) => {
    if (!ev || !Array.isArray(checks) || checks.length === 0) return [ (req, res, next) => next() ];
    const { validationResult } = ev;
    return [
        ...checks,
        (req, res, next) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ success: false, message: 'Validation error', errors: errors.array() });
            }
            next();
        }
    ];
};

const vBody = ev ? ev.body : () => (req, res, next) => next();

// Friendly page routes (so you can use /login instead of /login.html)
const PUBLIC_DIR = path.join(__dirname, 'public');
app.get('/login', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'login.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'signup.html')));
app.get('/privacy', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'privacy.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'terms.html')));
app.get('/impact', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'impact.html')));
app.get('/reset-password', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'reset-password.html')));


// Logging
try {
    const logsDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    const accessLogStream = fs.createWriteStream(path.join(logsDir, 'access.log'), { flags: 'a' });
    app.use(morgan('combined', { stream: accessLogStream }));
} catch (e) {
    // If the filesystem is read-only, skip file logging.
    app.use(morgan('dev'));
}

// Database initialization
const dbPath = process.env.DB_PATH
    ? path.resolve(__dirname, process.env.DB_PATH)
    : path.join(__dirname, 'empower_nyamagabe.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Failed to open database:', err);
    }
});

// Payment (Flutterwave) configuration
const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY || '';
const FLW_WEBHOOK_SECRET_HASH = process.env.FLW_WEBHOOK_SECRET_HASH || '';
const FLW_BASE_URL = 'https://api.flutterwave.com/v3';

// Email (SMTP) configuration (optional)
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_SECURE = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || 'no-reply@empowernyamagabe.org';
const ADMIN_NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || process.env.ADMIN_EMAIL || '';

// If deployed behind a reverse proxy (Render, Nginx, etc.), trust X-Forwarded-* headers
// so req.protocol becomes https when appropriate.
app.set('trust proxy', 1);

function getAppBaseUrl(req) {
    // If deployed behind a proxy, set APP_BASE_URL in .env (e.g., https://yourdomain.com)
    return process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
}

// Initialize database tables
function safeAddColumn(table, columnDef) {
    db.run(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`, (err) => {
        if (err && !String(err.message || '').includes('duplicate column')) {
            console.warn(`⚠️  Could not add column on ${table}: ${columnDef}.`, err.message);
        }
    });
}

function initDatabase() {
    // Statements run in order so later ALTERs always see the tables created above them.
    db.serialize(() => {
        // Users: donors, local leaders (Umudugudu / Ubudehe committee members) and admins.
        // Either an email or a phone number is enough to hold an account (FR1).
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT UNIQUE,
                phone TEXT UNIQUE,
                password_hash TEXT NOT NULL,
                is_admin BOOLEAN DEFAULT 0,
                role TEXT DEFAULT 'donor',
                sector TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Families (table keeps the name "beneficiaries").
        // The family's identity (name, phone, village) stays private; donors only ever see
        // the anonymous family_code, sector, Ubudehe category and the written need.
        db.run(`
            CREATE TABLE IF NOT EXISTS beneficiaries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                family_code TEXT UNIQUE,
                name TEXT NOT NULL,
                phone TEXT,
                sector TEXT NOT NULL,
                cell TEXT,
                village TEXT,
                ubudehe_category INTEGER,
                household_size INTEGER,
                support_type TEXT NOT NULL,
                need_description TEXT,
                need_amount INTEGER NOT NULL DEFAULT 0,
                notes TEXT,
                verification_status TEXT DEFAULT 'pending',
                status TEXT DEFAULT 'pending',
                submitted_by INTEGER,
                verified_by INTEGER,
                verified_at DATETIME,
                verification_notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (submitted_by) REFERENCES users(id),
                FOREIGN KEY (verified_by) REFERENCES users(id)
            )
        `);

        // Donations. Each row is the "Donation Trace Record":
        // donor (user_id) -> family (beneficiary_id) -> purpose -> Flutterwave reference + status.
        db.run(`
            CREATE TABLE IF NOT EXISTS donations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                beneficiary_id INTEGER,
                amount INTEGER NOT NULL,
                purpose TEXT NOT NULL,
                payment_method TEXT,
                status TEXT DEFAULT 'pending',
                transaction_id TEXT,
                provider_transaction_id TEXT,
                note TEXT,
                is_anonymous INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (beneficiary_id) REFERENCES beneficiaries(id)
            )
        `);

        // Backwards-compatible migrations for DB files created by earlier versions
        safeAddColumn('users', "role TEXT DEFAULT 'donor'");
        safeAddColumn('users', 'sector TEXT');
        safeAddColumn('donations', 'beneficiary_id INTEGER');
        safeAddColumn('donations', 'provider_transaction_id TEXT');
        safeAddColumn('donations', 'note TEXT');
        safeAddColumn('donations', 'is_anonymous INTEGER DEFAULT 0');
        ['family_code TEXT', 'sector TEXT', 'cell TEXT', 'village TEXT', 'ubudehe_category INTEGER',
         'household_size INTEGER', 'need_description TEXT', 'need_amount INTEGER DEFAULT 0',
         "verification_status TEXT DEFAULT 'pending'", 'submitted_by INTEGER', 'verified_by INTEGER',
         'verified_at DATETIME', 'verification_notes TEXT'
        ].forEach((col) => safeAddColumn('beneficiaries', col));
        db.run("UPDATE users SET role = 'admin' WHERE is_admin = 1 AND (role IS NULL OR role = 'donor')");

        // Audit logs (verification decisions, account creation, donations)
        db.run(`
            CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                actor_user_id INTEGER,
                action TEXT NOT NULL,
                entity_type TEXT,
                entity_id TEXT,
                details TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (actor_user_id) REFERENCES users(id)
            )
        `);

        // Password reset tokens
        db.run(`
            CREATE TABLE IF NOT EXISTS password_resets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token_hash TEXT NOT NULL,
                expires_at DATETIME NOT NULL,
                used INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);
    });

    // Create default admin user if it doesn't exist
    const adminEmail = (process.env.ADMIN_EMAIL || 'admin@empowernyamagabe.org').toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123'; // Change this in production!

    db.get('SELECT id FROM users WHERE email = ? AND is_admin = 1', [adminEmail], (err, row) => {
        if (err) {
            console.error('Error checking for admin user:', err);
            return;
        }
        if (!row) {
            bcrypt.hash(adminPassword, 10, (hErr, hash) => {
                if (hErr) {
                    console.error('Error hashing admin password:', hErr);
                    return;
                }
                db.run(
                    `INSERT INTO users (name, email, password_hash, is_admin, role) VALUES (?, ?, ?, 1, 'admin')`,
                    ['System Admin', adminEmail, hash],
                    (iErr) => {
                        if (iErr) {
                            console.error('Error creating admin user:', iErr);
                        } else {
                            console.log('Default admin user created:', adminEmail);
                            console.log('Please change the admin password after first login!');
                        }
                    }
                );
            });
        }
    });

    console.log('✅ Database initialized successfully');
}

// Email helpers (optional)
function getMailer() {
    if (!nodemailer) return null;
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
    try {
        return nodemailer.createTransport({
            host: SMTP_HOST,
            port: SMTP_PORT,
            secure: SMTP_SECURE,
            auth: { user: SMTP_USER, pass: SMTP_PASS },
        });
    } catch (_) {
        return null;
    }
}

async function sendEmail({ to, subject, html, text }) {
    const mailer = getMailer();
    if (!mailer) return { ok: false, reason: 'mailer_not_configured' };
    try {
        await mailer.sendMail({
            from: SMTP_FROM,
            to,
            subject,
            text: text || undefined,
            html: html || undefined,
        });
        return { ok: true };
    } catch (e) {
        console.warn('⚠️  Email send failed:', e?.message || e);
        return { ok: false, reason: 'send_failed' };
    }
}

function logAudit(actorUserId, action, entityType, entityId, detailsObj) {
    const details = detailsObj ? JSON.stringify(detailsObj).slice(0, 5000) : null;
    db.run(
        `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details)
         VALUES (?, ?, ?, ?, ?)`,
        [actorUserId || null, String(action || ''), entityType || null, entityId != null ? String(entityId) : null, details],
        () => {}
    );
}

function getBaseUrlForJobs() {
    // Cron jobs do not have req; use APP_BASE_URL (recommended).
    return process.env.APP_BASE_URL || `http://localhost:${PORT}`;
}

async function notifyDonationCompleted(donationId) {
    db.get(
        `SELECT d.*, u.name as donor_name, u.email as donor_email, b.family_code
         FROM donations d
         JOIN users u ON d.user_id = u.id
         LEFT JOIN beneficiaries b ON d.beneficiary_id = b.id
         WHERE d.id = ?`,
        [donationId],
        async (err, row) => {
            if (err || !row) return;

            // Donor email
            if (row.donor_email) {
                const receiptUrl = `${getBaseUrlForJobs()}/receipt.html?tx_ref=${encodeURIComponent(row.transaction_id || '')}`;
                const subject = 'Donation confirmed • Empower Nyamagabe';
                const text = `Thank you for your donation!\n\nAmount: ${row.amount} RWF\nFamily: ${row.family_code || 'N/A'}\nPurpose: ${NEED_LABELS[row.purpose] || row.purpose}\nReference: ${row.transaction_id}\n\nReceipt: ${receiptUrl}`;
                const html = `
                    <div style="font-family:Arial,sans-serif; line-height:1.5;">
                        <h2 style="margin:0 0 10px;">Thank you for your donation</h2>
                        <p>Your donation has been <strong>successfully processed</strong>.</p>
                        <ul>
                            <li><strong>Amount:</strong> ${row.amount} RWF</li>
                            <li><strong>Family:</strong> ${row.family_code || 'N/A'}</li>
                            <li><strong>Purpose:</strong> ${NEED_LABELS[row.purpose] || row.purpose}</li>
                            <li><strong>Reference:</strong> ${row.transaction_id}</li>
                        </ul>
                        <p><a href="${receiptUrl}">View your receipt</a></p>
                        <p style="color:#6b7280; font-size:12px;">Empower Nyamagabe • Transparent community support</p>
                    </div>
                `;
                await sendEmail({ to: row.donor_email, subject, html, text });
            }

            // Admin notification
            if (ADMIN_NOTIFY_EMAIL) {
                const subject = 'New donation received • Empower Nyamagabe';
                const text = `A new donation was received.\n\nDonor: ${row.donor_name} (${row.donor_email})\nAmount: ${row.amount} RWF\nFamily: ${row.family_code || 'N/A'}\nPurpose: ${NEED_LABELS[row.purpose] || row.purpose}\nReference: ${row.transaction_id}`;
                const html = `
                    <div style="font-family:Arial,sans-serif; line-height:1.5;">
                        <h2 style="margin:0 0 10px;">New donation received</h2>
                        <ul>
                            <li><strong>Donor:</strong> ${row.donor_name} (${row.donor_email})</li>
                            <li><strong>Amount:</strong> ${row.amount} RWF</li>
                            <li><strong>Family:</strong> ${row.family_code || 'N/A'}</li>
                            <li><strong>Purpose:</strong> ${NEED_LABELS[row.purpose] || row.purpose}</li>
                            <li><strong>Reference:</strong> ${row.transaction_id}</li>
                        </ul>
                    </div>
                `;
                await sendEmail({ to: ADMIN_NOTIFY_EMAIL, subject, html, text });
            }
        }
    );
}

// Helper functions
function generateTransactionId() {
    return 'TXN' + Date.now() + Math.random().toString(36).substr(2, 9);
}

function generateTxRef() {
    // A stable reference you control (stored in donations.transaction_id)
    return `EK-${uuidv4()}`;
}

function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function validatePhone(phone) {
    const phoneRegex = /^(\+250|0)?[7][0-9]{8}$/;
    return phoneRegex.test(phone.replace(/\s/g, ''));
}

// ---- Nyamagabe domain helpers -------------------------------------------------
// The platform supports exactly the two needs named in the project scope.
const NEED_TYPES = ['health', 'education'];
const NEED_LABELS = { health: 'Health insurance (Mutuelle de Santé)', education: 'School fees' };

const clean = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

function normalizePhone(raw) {
    const p = String(raw || '').replace(/[\s-]/g, '');
    if (!p) return null;
    if (p.startsWith('+250')) return p;
    if (p.startsWith('250')) return '+' + p;
    if (p.startsWith('0')) return '+250' + p.slice(1);
    if (p.startsWith('7')) return '+250' + p;
    return p;
}

function userRole(u) {
    return u && u.is_admin ? 'admin' : (u && u.role) || 'donor';
}

function publicUser(u) {
    return {
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        isAdmin: !!u.is_admin,
        role: userRole(u),
        sector: u.sector || null,
    };
}

function signToken(u) {
    if (!JWT_SECRET) return null;
    return jwt.sign({ uid: u.id, role: userRole(u) }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// Promise wrappers so the newer routes read top-to-bottom
const dbGet = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (e, r) => (e ? reject(e) : resolve(r))));
const dbAll = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (e, r) => (e ? reject(e) : resolve(r))));
const dbRun = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function (e) { return e ? reject(e) : resolve(this); }));

// Amount already received by a family = completed donations linked to it
const FUNDED_SQL = `COALESCE((SELECT SUM(d.amount) FROM donations d WHERE d.beneficiary_id = b.id AND d.status = 'completed'), 0)`;

// Authentication middleware
function authenticateUser(req, res, next) {
    // Preferred: JWT Bearer token
    const authHeader = req.headers['authorization'] || '';
    const maybeBearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    let userId = null;
    if (maybeBearer) {
        if (!JWT_SECRET) {
            return res.status(500).json({ success: false, message: 'Server auth is not configured (missing JWT_SECRET)' });
        }
        try {
            const payload = jwt.verify(maybeBearer, JWT_SECRET);
            userId = payload?.uid;
        } catch (e) {
            return res.status(401).json({ success: false, message: 'Invalid or expired session. Please login again.' });
        }
    }

    if (!userId) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
        if (err || !user) {
            return res.status(401).json({ success: false, message: 'Invalid user' });
        }
        req.user = user;
        next();
    });
}

function requireAdmin(req, res, next) {
    if (!req.user || !req.user.is_admin) {
        return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    next();
}

async function createFlutterwavePaymentLink({ amount, currency, txRef, customer, redirectUrl, title, description, paymentOptions, meta }) {
    if (!FLW_SECRET_KEY) {
        throw new Error('Flutterwave keys are not configured. Set FLW_SECRET_KEY in .env');
    }

    const payload = {
        tx_ref: txRef,
        amount: String(amount),
        currency: currency,
        redirect_url: redirectUrl,
        customer,
        ...(paymentOptions ? { payment_options: paymentOptions } : {}),
        ...(meta ? { meta } : {}),
        customizations: {
            title,
            description,
        },
    };

    const response = await axios.post(`${FLW_BASE_URL}/payments`, payload, {
        headers: {
            Authorization: `Bearer ${FLW_SECRET_KEY}`,
            'Content-Type': 'application/json',
        },
        timeout: 15000,
    });

    const link = response?.data?.data?.link;
    if (!link) {
        throw new Error('Flutterwave did not return a payment link');
    }

    return link;
}

async function verifyFlutterwaveTransaction(transactionId) {
    if (!FLW_SECRET_KEY) {
        throw new Error('Flutterwave keys are not configured. Set FLW_SECRET_KEY in .env');
    }

    const response = await axios.get(`${FLW_BASE_URL}/transactions/${transactionId}/verify`, {
        headers: {
            Authorization: `Bearer ${FLW_SECRET_KEY}`,
        },
        timeout: 15000,
    });
    return response?.data?.data;
}

// Routes

// Authentication routes
app.post(
    '/api/auth/signup',
    authLimiter,
    ...validate([
        vBody('name').trim().isLength({ min: 2 }).withMessage('Name is required'),
        vBody('email').optional({ checkFalsy: true }).trim().isEmail().withMessage('Valid email is required'),
        vBody('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    ]),
    async (req, res) => {
    try {
        const name = clean(req.body.name, 120);
        const email = clean(req.body.email, 200).toLowerCase();
        const phoneRaw = clean(req.body.phone, 30);
        const password = String(req.body.password || '');

        if (!name || !password) {
            return res.status(400).json({ success: false, message: 'Name and password are required' });
        }
        // FR1: an account needs a phone number OR an email address
        if (!email && !phoneRaw) {
            return res.status(400).json({ success: false, message: 'Please provide a phone number or an email address' });
        }
        if (email && !validateEmail(email)) {
            return res.status(400).json({ success: false, message: 'Please provide a valid email address' });
        }
        if (phoneRaw && !validatePhone(phoneRaw)) {
            return res.status(400).json({ success: false, message: 'Please provide a valid Rwandan phone number' });
        }
        if (password.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long' });
        }

        const phone = normalizePhone(phoneRaw);
        const existing = await dbGet('SELECT id FROM users WHERE email = ? OR phone = ?', [email || null, phone || null]);
        if (existing) {
            return res.status(400).json({ success: false, message: 'An account with this email or phone number already exists' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        // Public sign-up always creates a donor. Local leader and admin accounts are created by an admin.
        const result = await dbRun(
            `INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, 'donor')`,
            [name, email || null, phone, passwordHash]
        );
        const user = await dbGet('SELECT * FROM users WHERE id = ?', [result.lastID]);
        res.json({ success: true, message: 'Account created successfully', user: publicUser(user), token: signToken(user) });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

app.post(
    '/api/auth/login',
    authLimiter,
    ...validate([
        vBody('password').isLength({ min: 1 }).withMessage('Password is required'),
    ]),
    async (req, res) => {
    try {
        // Accepts a phone number or an email address (FR1). "email" is still accepted for older clients.
        const identifier = clean(req.body.identifier || req.body.email, 200);
        const password = String(req.body.password || '');
        const requestedRole = req.body.role || (req.body.isAdmin ? 'admin' : 'donor');

        if (!identifier || !password) {
            return res.status(400).json({ success: false, message: 'Phone or email, and password are required' });
        }

        const user = identifier.includes('@')
            ? await dbGet('SELECT * FROM users WHERE lower(email) = lower(?)', [identifier])
            : await dbGet('SELECT * FROM users WHERE phone = ?', [normalizePhone(identifier)]);

        const passwordMatch = user ? await bcrypt.compare(password, user.password_hash) : false;
        if (!user || !passwordMatch) {
            return res.status(400).json({ success: false, message: 'Invalid phone/email or password' });
        }

        const role = userRole(user);
        if (requestedRole === 'admin' && role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }
        if (requestedRole === 'leader' && role !== 'leader' && role !== 'admin') {
            return res.status(403).json({ success: false, message: 'This account is not a local leader account' });
        }

        res.json({ success: true, message: 'Login successful', user: publicUser(user), token: signToken(user) });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Return current session user (useful for production deployments)
app.get('/api/auth/me', authenticateUser, (req, res) => {
    res.json({ success: true, user: publicUser(req.user) });
});

// Tells the front end whether payments run in Flutterwave test mode (the pilot setup)
app.get('/api/config', (req, res) => {
    res.json({
        success: true,
        paymentsConfigured: !!FLW_SECRET_KEY,
        testMode: !FLW_SECRET_KEY || FLW_SECRET_KEY.startsWith('FLWSECK_TEST'),
        needTypes: NEED_TYPES,
    });
});

// Password reset (email-based) — optional but strongly recommended
app.post(
    '/api/auth/password-reset/request',
    authLimiter,
    ...validate([
        vBody('email').trim().isEmail().withMessage('Valid email is required'),
    ]),
    async (req, res) => {
        const email = String(req.body.email || '').trim().toLowerCase();
        const baseUrl = getAppBaseUrl(req);

        db.get('SELECT * FROM users WHERE lower(email) = ?', [email], async (err, user) => {
            // Always return success to avoid user enumeration
            if (err || !user) {
                return res.json({ success: true, message: 'If an account exists, we sent a reset link to that email.' });
            }

            const rawToken = crypto.randomBytes(24).toString('hex');
            const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
            const expires = new Date(Date.now() + 60 * 60 * 1000); // 60 minutes

            db.run(
                `INSERT INTO password_resets (user_id, token_hash, expires_at, used)
                 VALUES (?, ?, ?, 0)`,
                [user.id, tokenHash, expires.toISOString()],
                async () => {
                    const resetUrl = `${baseUrl}/reset-password?email=${encodeURIComponent(user.email)}&token=${encodeURIComponent(rawToken)}`;

                    // Send email if configured
                    const subject = 'Reset your password • Empower Nyamagabe';
                    const text = `Use this link to reset your password (valid for 60 minutes):\n${resetUrl}`;
                    const html = `
                        <div style="font-family:Arial,sans-serif; line-height:1.5;">
                            <h2 style="margin:0 0 10px;">Reset your password</h2>
                            <p>Click the link below to set a new password. This link expires in 60 minutes.</p>
                            <p><a href="${resetUrl}">Reset Password</a></p>
                            <p style="color:#6b7280; font-size:12px;">If you did not request this, you can ignore this email.</p>
                        </div>
                    `;

                    const sent = await sendEmail({ to: user.email, subject, html, text });
                    if (!sent.ok) {
                        // Dev-friendly fallback
                        console.log('🔑 Password reset link (email not configured):', resetUrl);
                    }
                    logAudit(user.id, 'password_reset_requested', 'users', user.id, { via: sent.ok ? 'email' : 'console' });
                    return res.json({ success: true, message: 'If an account exists, we sent a reset link to that email.' });
                }
            );
        });
    }
);

app.post(
    '/api/auth/password-reset/confirm',
    authLimiter,
    ...validate([
        vBody('email').trim().isEmail().withMessage('Valid email is required'),
        vBody('token').isLength({ min: 10 }).withMessage('Token is required'),
        vBody('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    ]),
    async (req, res) => {
        const email = String(req.body.email || '').trim().toLowerCase();
        const token = String(req.body.token || '').trim();
        const newPassword = String(req.body.newPassword || '');

        db.get('SELECT * FROM users WHERE lower(email) = ?', [email], async (uErr, user) => {
            if (uErr || !user) {
                return res.status(400).json({ success: false, message: 'Invalid reset link.' });
            }

            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            db.get(
                `SELECT * FROM password_resets
                 WHERE user_id = ? AND token_hash = ? AND used = 0 AND expires_at > ?
                 ORDER BY created_at DESC`,
                [user.id, tokenHash, new Date().toISOString()],
                async (tErr, row) => {
                    if (tErr || !row) {
                        return res.status(400).json({ success: false, message: 'Reset link is invalid or has expired.' });
                    }

                    const passwordHash = await bcrypt.hash(newPassword, 10);
                    db.serialize(() => {
                        db.run('BEGIN TRANSACTION');
                        db.run(
                            `UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                            [passwordHash, user.id]
                        );
                        db.run(
                            `UPDATE password_resets SET used = 1 WHERE id = ?`,
                            [row.id]
                        );
                        db.run('COMMIT', async () => {
                            logAudit(user.id, 'password_reset_completed', 'users', user.id, {});
                            await sendEmail({
                                to: user.email,
                                subject: 'Password updated • Empower Nyamagabe',
                                text: 'Your password has been updated successfully.',
                                html: '<p>Your password has been updated successfully.</p>',
                            });
                            return res.json({ success: true, message: 'Password updated. You can now login.' });
                        });
                    });
                }
            );
        });
    }
);

// Donation creation: a donation always goes to ONE verified family and ONE need (FR3, FR4, NFR6).
// The donor completes Mobile Money / card on Flutterwave's hosted page; this server never sees payment details.
app.post('/api/donations/create', authenticateUser, async (req, res) => {
    try {
        const { familyId, amount, paymentMethod, paymentDetails, note, isAnonymous } = req.body;
        const userId = req.user.id;

        if (!familyId || !amount || !paymentMethod) {
            return res.status(400).json({ success: false, message: 'Family, amount and payment method are required' });
        }

        const pm = String(paymentMethod).toLowerCase();
        if (!['mobile_money', 'credit_card'].includes(pm)) {
            return res.status(400).json({ success: false, message: 'Please choose Mobile Money or card' });
        }

        const parsedAmount = Number(String(amount).replace(/[^0-9.]/g, ''));
        if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
            return res.status(400).json({ success: false, message: 'Please enter a valid donation amount' });
        }
        const safeAmount = Math.floor(parsedAmount);
        if (safeAmount < 1000) {
            return res.status(400).json({ success: false, message: 'Minimum donation amount is 1,000 RWF' });
        }

        // Business rule: only a VERIFIED family can receive a donation
        const family = await dbGet(
            `SELECT b.*, ${FUNDED_SQL} AS funded FROM beneficiaries b WHERE b.id = ?`,
            [Number(familyId)]
        );
        if (!family || family.verification_status !== 'approved') {
            return res.status(400).json({ success: false, message: 'This family is not verified and cannot receive donations' });
        }
        const remaining = Math.max(0, Number(family.need_amount) - Number(family.funded));
        if (remaining <= 0) {
            return res.status(400).json({ success: false, message: 'This need has already been fully funded. Please choose another family.' });
        }
        if (safeAmount > remaining) {
            return res.status(400).json({ success: false, message: `This need only has ${remaining.toLocaleString()} RWF remaining. Please give ${remaining.toLocaleString()} RWF or less.` });
        }

        const user = await dbGet('SELECT * FROM users WHERE id = ?', [userId]);
        if (!user) return res.status(400).json({ success: false, message: 'Invalid user' });

        const purpose = family.support_type; // 'health' or 'education', taken from the family's verified need
        const cleanNote = clean(note, 280);
        const anonFlag = isAnonymous ? 1 : 0;
        const txRef = generateTxRef();
        const redirectUrl = `${getAppBaseUrl(req)}/api/payments/flutterwave/callback`;
        const paymentOptions = pm === 'mobile_money' ? 'mobilemoneyrwanda' : 'card';

        // For Mobile Money a valid number greatly improves the success rate
        const phonenumber = (paymentDetails && paymentDetails.phoneNumber) ? String(paymentDetails.phoneNumber) : (user.phone || '');
        if (pm === 'mobile_money' && (!phonenumber || !validatePhone(phonenumber))) {
            return res.status(400).json({ success: false, message: 'A valid Rwanda Mobile Money number is required for Mobile Money payments.' });
        }

        // Create the trace record first (pending until Flutterwave confirms)
        const ins = await dbRun(
            `INSERT INTO donations (user_id, beneficiary_id, amount, purpose, payment_method, status, transaction_id, note, is_anonymous)
             VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
            [userId, family.id, safeAmount, purpose, pm, txRef, cleanNote, anonFlag]
        );
        logAudit(userId, 'donation_created', 'donations', ins.lastID, { amount: safeAmount, purpose, family: family.family_code, paymentMethod: pm });

        try {
            const link = await createFlutterwavePaymentLink({
                amount: safeAmount,
                currency: 'RWF',
                txRef,
                customer: { email: user.email || `donor${user.id}@example.com`, name: user.name, phonenumber },
                redirectUrl,
                title: 'Empower Nyamagabe Donation',
                description: `${NEED_LABELS[purpose]} for family ${family.family_code}`,
                paymentOptions,
                meta: { donation_id: String(ins.lastID), user_id: String(userId), family_code: String(family.family_code), purpose },
            });

            return res.json({
                success: true,
                message: 'Payment link created. Redirecting to secure checkout…',
                paymentLink: link,
                donation: { id: ins.lastID, amount: safeAmount, purpose, familyCode: family.family_code, txRef, status: 'pending' },
            });
        } catch (e) {
            console.error('Flutterwave initiate error:', e?.response?.data || e);
            await dbRun(`UPDATE donations SET status='failed', updated_at=CURRENT_TIMESTAMP WHERE id=?`, [ins.lastID]).catch(() => {});
            return res.status(500).json({
                success: false,
                message: 'Payment gateway is not configured or is unavailable. Please confirm FLW_SECRET_KEY (test key during the pilot) and try again.',
            });
        }
    } catch (error) {
        console.error('Donation creation error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Flutterwave redirect callback
app.get('/api/payments/flutterwave/callback', async (req, res) => {
    const status = req.query.status;
    const txRef = req.query.tx_ref;
    const flwTransactionId = req.query.transaction_id;

    if (!txRef) {
        return res.redirect('/?payment=failed&reason=missing_tx_ref');
    }

    // If user cancels or payment fails, mark donation failed.
    if (status !== 'successful' || !flwTransactionId) {
        db.run(`UPDATE donations SET status='failed', updated_at=CURRENT_TIMESTAMP WHERE transaction_id=?`, [txRef], () => {});
        return res.redirect(`/?payment=failed&tx_ref=${encodeURIComponent(txRef)}`);
    }

    try {
        // Load expected donation from DB
        db.get('SELECT * FROM donations WHERE transaction_id = ?', [txRef], async (err, donation) => {
            if (err || !donation) {
                return res.redirect(`/?payment=failed&tx_ref=${encodeURIComponent(txRef)}&reason=donation_not_found`);
            }

            const verified = await verifyFlutterwaveTransaction(flwTransactionId);

            const ok =
                verified &&
                String(verified.status).toLowerCase() === 'successful' &&
                String(verified.tx_ref) === String(txRef) &&
                Number(verified.amount) === Number(donation.amount) &&
                String(verified.currency || '').trim().toUpperCase() === 'RWF';

            if (!ok) {
                db.run(`UPDATE donations SET status='failed', provider_transaction_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
                    [String(flwTransactionId), donation.id],
                    () => {}
                );
                return res.redirect(`/?payment=failed&tx_ref=${encodeURIComponent(txRef)}`);
            }

            db.run(
                `UPDATE donations SET status='completed', provider_transaction_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
                [String(flwTransactionId), donation.id],
                () => {
                    logAudit(null, 'donation_completed', 'donations', donation.id, { tx_ref: txRef, provider_transaction_id: String(flwTransactionId) });
                    setImmediate(() => notifyDonationCompleted(donation.id).catch(() => {}));
                }
            );

            return res.redirect(`/?payment=success&tx_ref=${encodeURIComponent(txRef)}`);
        });
    } catch (e) {
        console.error('Flutterwave callback verify error:', e?.response?.data || e);
        db.run(`UPDATE donations SET status='failed', updated_at=CURRENT_TIMESTAMP WHERE transaction_id=?`, [txRef], () => {});
        return res.redirect(`/?payment=failed&tx_ref=${encodeURIComponent(txRef)}`);
    }
});

// Flutterwave webhook (optional for production)
app.post('/api/payments/flutterwave/webhook', (req, res) => {
    // Only verify if a webhook secret is configured.
    if (!FLW_WEBHOOK_SECRET_HASH) {
        return res.status(200).send('ok');
    }

    const signature = req.headers['verif-hash'];
    if (!signature || signature !== FLW_WEBHOOK_SECRET_HASH) {
        return res.status(401).send('unauthorized');
    }

    // A minimal webhook handler; for local dev you can rely on redirect verification.
    // Flutterwave sends event data with tx_ref and transaction_id.
    try {
        const data = req.body?.data;
        const txRef = data?.tx_ref;
        const txId = data?.id;
        const st = data?.status;
        if (!txRef || !txId) return res.status(200).send('ok');

        if (st === 'successful') {
            db.get(`SELECT * FROM donations WHERE transaction_id=?`, [String(txRef)], (gErr, donation) => {
                if (gErr || !donation) return;
                const wasCompleted = String(donation.status || '').toLowerCase() === 'completed';
                db.run(`UPDATE donations SET status='completed', provider_transaction_id=?, updated_at=CURRENT_TIMESTAMP WHERE transaction_id=?`,
                    [String(txId), String(txRef)],
                    () => {
                        if (!wasCompleted) {
                            logAudit(null, 'donation_completed_webhook', 'donations', donation.id, { tx_ref: txRef, provider_transaction_id: String(txId) });
                            setImmediate(() => notifyDonationCompleted(donation.id).catch(() => {}));
                        }
                    }
                );
            });
        } else if (st === 'failed' || st === 'cancelled') {
            db.run(`UPDATE donations SET status='failed', provider_transaction_id=?, updated_at=CURRENT_TIMESTAMP WHERE transaction_id=?`,
                [String(txId), String(txRef)],
                () => {}
            );
        }
    } catch (e) {
        console.error('Webhook handler error:', e);
    }

    return res.status(200).send('ok');
});

app.get('/api/donations/user/:userId', authenticateUser, (req, res) => {
    const userId = req.params.userId;

    if (Number(userId) !== Number(req.user.id) && !req.user.is_admin) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    // FR7: the donor's full history, each row traced to a family code and need (never a family name)
    db.all(`
        SELECT d.*, u.name as donor_name, b.family_code, b.sector as family_sector
        FROM donations d
        JOIN users u ON d.user_id = u.id
        LEFT JOIN beneficiaries b ON d.beneficiary_id = b.id
        WHERE d.user_id = ?
        ORDER BY d.created_at DESC
    `, [userId], (err, donations) => {
        if (err) {
            console.error('Error fetching user donations:', err);
            return res.status(500).json({ success: false, message: 'Failed to fetch donations' });
        }
        res.json({ success: true, data: donations });
    });
});

// Generate a simple receipt payload (client can render/print)
app.get('/api/donations/receipt/:txRef', authenticateUser, (req, res) => {
    const txRef = String(req.params.txRef || '').trim();
    if (!txRef) return res.status(400).json({ success: false, message: 'Missing transaction reference' });

    db.get(
        `SELECT d.*, u.name as donor_name, u.email as donor_email, u.phone as donor_phone,
                b.family_code, b.sector as family_sector, b.ubudehe_category
         FROM donations d
         JOIN users u ON d.user_id = u.id
         LEFT JOIN beneficiaries b ON d.beneficiary_id = b.id
         WHERE d.transaction_id = ?`,
        [txRef],
        (err, row) => {
            if (err || !row) return res.status(404).json({ success: false, message: 'Receipt not found' });
            if (Number(row.user_id) !== Number(req.user.id) && !req.user.is_admin) {
                return res.status(403).json({ success: false, message: 'Not allowed' });
            }
            return res.json({
                success: true,
                receipt: {
                    txRef: row.transaction_id,
                    providerTransactionId: row.provider_transaction_id,
                    status: row.status,
                    amount: row.amount,
                    currency: 'RWF',
                    purpose: row.purpose,
                    purposeLabel: NEED_LABELS[row.purpose] || row.purpose,
                    paymentMethod: row.payment_method,
                    note: row.note,
                    date: row.created_at,
                    family: { code: row.family_code, sector: row.family_sector, ubudehe: row.ubudehe_category },
                    donor: { name: row.donor_name, email: row.donor_email, phone: row.donor_phone },
                }
            });
        }
    );
});

// Donation status (useful when checkout opens in a separate tab)
app.get('/api/donations/status/:txRef', authenticateUser, (req, res) => {
    const txRef = String(req.params.txRef || '').trim();
    if (!txRef) return res.status(400).json({ success: false, message: 'Missing transaction reference' });

    db.get(
        `SELECT d.*, u.name as donor_name
         FROM donations d
         JOIN users u ON d.user_id = u.id
         WHERE d.transaction_id = ?`,
        [txRef],
        (err, row) => {
            if (err || !row) return res.status(404).json({ success: false, message: 'Donation not found' });
            if (Number(row.user_id) !== Number(req.user.id) && !req.user.is_admin) {
                return res.status(403).json({ success: false, message: 'Not allowed' });
            }
            return res.json({
                success: true,
                status: row.status,
                txRef: row.transaction_id,
                donationId: row.id,
                providerTransactionId: row.provider_transaction_id,
            });
        }
    );
});

// PDF receipt (requires pdfkit)
async function serveReceiptPdf(req, res) {
    if (!PDFDocument) {
        return res.status(501).json({ success: false, message: 'PDF feature is not installed. Run: npm i pdfkit' });
    }

    const txRef = String(req.params.txRef || '').trim();
    if (!txRef) return res.status(400).json({ success: false, message: 'Missing transaction reference' });

    db.get(
        `SELECT d.*, u.name as donor_name, u.email as donor_email, u.phone as donor_phone,
                b.family_code, b.sector as family_sector
         FROM donations d
         JOIN users u ON d.user_id = u.id
         LEFT JOIN beneficiaries b ON d.beneficiary_id = b.id
         WHERE d.transaction_id = ?`,
        [txRef],
        (err, row) => {
            if (err || !row) return res.status(404).json({ success: false, message: 'Receipt not found' });
            if (Number(row.user_id) !== Number(req.user.id) && !req.user.is_admin) {
                return res.status(403).json({ success: false, message: 'Not allowed' });
            }

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="Empower-Nyamagabe-Receipt-${encodeURIComponent(txRef)}.pdf"`);

            const doc = new PDFDocument({ size: 'A4', margin: 50 });
            doc.pipe(res);

            doc.fontSize(22).text('Empower Nyamagabe', { align: 'left' });
            doc.fontSize(12).fillColor('#444').text('Donation Receipt / Trace Record', { align: 'left' });
            doc.moveDown(0.5);
            doc.fillColor('#000');
            doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#4a7c59').lineWidth(2).stroke();
            doc.moveDown(1);

            const label = (k) => doc.fontSize(11).fillColor('#555').text(k, { continued: true }).fillColor('#000');
            const value = (v) => doc.fontSize(11).text(` ${v}`);

            label('Reference:'); value(row.transaction_id);
            label('Status:'); value(String(row.status || '').toUpperCase());
            label('Date:'); value(String(row.created_at || ''));
            label('Amount:'); value(`${row.amount} RWF`);
            label('Beneficiary family:'); value(row.family_code ? `${row.family_code} (${row.family_sector || 'Nyamagabe District'})` : 'N/A');
            label('Funds:'); value(NEED_LABELS[row.purpose] || String(row.purpose || ''));
            if (row.note) { label('Note:'); value(row.note); }
            if (row.provider_transaction_id) { label('Flutterwave Tx ID:'); value(String(row.provider_transaction_id)); }
            if (Number(row.is_anonymous || 0) === 1) { label('Public display:'); value('Anonymous'); }

            doc.moveDown(1);
            doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ddd').lineWidth(1).stroke();
            doc.moveDown(1);

            doc.fontSize(13).text('Donor details', { underline: true });
            doc.moveDown(0.5);
            label('Name:'); value(row.donor_name);
            if (row.donor_email) { label('Email:'); value(row.donor_email); }
            if (row.donor_phone) { label('Phone:'); value(row.donor_phone); }

            doc.moveDown(2);
            doc.fontSize(11).fillColor('#444').text(
                'Thank you for supporting a verified family in Nyamagabe District. To protect the family\'s dignity, only an anonymous family code is shown.',
                { align: 'left' }
            );
            doc.fillColor('#000');

            doc.moveDown(2);
            doc.fontSize(10).fillColor('#6b7280').text(
                'Payments are processed on Flutterwave\'s hosted checkout. Empower Nyamagabe does not store Mobile Money numbers, PINs or card details. During the pilot, payments run in Flutterwave test mode and no real money moves.',
                { align: 'left' }
            );

            doc.end();
        }
    );
}

app.get('/api/donations/receipt/:txRef/pdf', authenticateUser, serveReceiptPdf);
app.get('/api/donations/receipt/:txRef.pdf', authenticateUser, serveReceiptPdf);

app.get('/api/donations/all', authenticateUser, requireAdmin, (req, res) => {
    db.all(`
        SELECT d.*, u.name as donor_name, b.family_code
        FROM donations d
        JOIN users u ON d.user_id = u.id
        LEFT JOIN beneficiaries b ON d.beneficiary_id = b.id
        ORDER BY d.created_at DESC
        LIMIT 100
    `, [], (err, donations) => {
        if (err) {
            console.error('Error fetching all donations:', err);
            return res.status(500).json({ success: false, message: 'Failed to fetch donations' });
        }
        res.json({ success: true, data: donations });
    });
});

// ---- Admin exports (CSV / XLSX) -------------------------------------------------
const csvEscape = (v) => {
    const s = String(v ?? '');
    if (s.includes('"') || s.includes(',') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
    return s;
};

const DONATION_EXPORT_SQL = `
    SELECT d.transaction_id, d.provider_transaction_id, d.status, d.amount, d.purpose, b.family_code,
           d.payment_method, d.note, d.is_anonymous, d.created_at,
           u.name as donor_name, u.email as donor_email, u.phone as donor_phone
    FROM donations d
    JOIN users u ON d.user_id = u.id
    LEFT JOIN beneficiaries b ON d.beneficiary_id = b.id
    ORDER BY d.created_at DESC`;
const DONATION_EXPORT_COLS = ['transaction_id','provider_transaction_id','status','amount','purpose','family_code','payment_method','note','is_anonymous','created_at','donor_name','donor_email','donor_phone'];

const FAMILY_EXPORT_SQL = `
    SELECT b.id, b.family_code, b.name, b.phone, b.sector, b.cell, b.village, b.ubudehe_category, b.household_size,
           b.support_type as need_type, b.need_description, b.need_amount, ${FUNDED_SQL} as funded,
           b.verification_status, b.verification_notes, b.verified_at, b.notes as supporting_notes, b.created_at
    FROM beneficiaries b ORDER BY b.created_at DESC`;
const FAMILY_EXPORT_COLS = ['id','family_code','name','phone','sector','cell','village','ubudehe_category','household_size','need_type','need_description','need_amount','funded','verification_status','verification_notes','verified_at','supporting_notes','created_at'];

function sendCsv(res, filename, header, rows) {
    const lines = [header.join(',')].concat(rows.map(r => header.map(k => csvEscape(r[k])).join(',')));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(lines.join('\n'));
}

app.get('/api/admin/export/donations.csv', authenticateUser, requireAdmin, (req, res) => {
    db.all(DONATION_EXPORT_SQL, [], (err, rows) => {
        if (err) return res.status(500).send('Failed to export');
        sendCsv(res, 'donations.csv', DONATION_EXPORT_COLS, rows);
    });
});

app.get('/api/admin/export/families.csv', authenticateUser, requireAdmin, (req, res) => {
    db.all(FAMILY_EXPORT_SQL, [], (err, rows) => {
        if (err) return res.status(500).send('Failed to export');
        sendCsv(res, 'families.csv', FAMILY_EXPORT_COLS, rows);
    });
});

async function exportXlsx(res, filename, header, rows) {
    if (!ExcelJS) {
        res.status(501).send('Excel export is not installed. Run: npm i exceljs');
        return;
    }
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Export');
    ws.columns = header.map((h) => ({ header: h, key: h, width: Math.max(12, Math.min(40, h.length + 4)) }));
    rows.forEach((r) => ws.addRow(r));
    ws.getRow(1).font = { bold: true };
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await wb.xlsx.write(res);
    res.end();
}

app.get('/api/admin/export/donations.xlsx', authenticateUser, requireAdmin, (req, res) => {
    db.all(DONATION_EXPORT_SQL, [], async (err, rows) => {
        if (err) return res.status(500).send('Failed to export');
        await exportXlsx(res, 'donations.xlsx', DONATION_EXPORT_COLS, rows);
    });
});

app.get('/api/admin/export/families.xlsx', authenticateUser, requireAdmin, (req, res) => {
    db.all(FAMILY_EXPORT_SQL, [], async (err, rows) => {
        if (err) return res.status(500).send('Failed to export');
        await exportXlsx(res, 'families.xlsx', FAMILY_EXPORT_COLS, rows);
    });
});

// Audit logs — admin-only
app.get('/api/admin/audit-logs', authenticateUser, requireAdmin, (req, res) => {
    db.all(
        `SELECT al.*, u.name as actor_name, u.email as actor_email
         FROM audit_logs al
         LEFT JOIN users u ON al.actor_user_id = u.id
         ORDER BY al.created_at DESC
         LIMIT 200`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: 'Failed to fetch audit logs' });
            res.json({ success: true, data: rows });
        }
    );
});

// ---- Local leader accounts (admin creates these; nobody can self-register as a leader) ----
app.post('/api/admin/leaders', authenticateUser, requireAdmin, async (req, res) => {
    try {
        const name = clean(req.body.name, 120);
        const email = clean(req.body.email, 200).toLowerCase();
        const phoneRaw = clean(req.body.phone, 30);
        const sector = clean(req.body.sector, 80);
        const password = String(req.body.password || '');

        if (name.length < 2 || !sector) {
            return res.status(400).json({ success: false, message: 'Name and sector are required' });
        }
        if (!email && !phoneRaw) {
            return res.status(400).json({ success: false, message: 'Provide an email address or a phone number' });
        }
        if (email && !validateEmail(email)) return res.status(400).json({ success: false, message: 'Invalid email address' });
        if (phoneRaw && !validatePhone(phoneRaw)) return res.status(400).json({ success: false, message: 'Invalid Rwandan phone number' });
        if (password.length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });

        const phone = normalizePhone(phoneRaw);
        const existing = await dbGet('SELECT id FROM users WHERE email = ? OR phone = ?', [email || null, phone || null]);
        if (existing) return res.status(400).json({ success: false, message: 'An account with this email or phone already exists' });

        const hash = await bcrypt.hash(password, 10);
        const r = await dbRun(
            `INSERT INTO users (name, email, phone, password_hash, is_admin, role, sector) VALUES (?, ?, ?, ?, 0, 'leader', ?)`,
            [name, email || null, phone, hash, sector]
        );
        logAudit(req.user.id, 'leader_account_created', 'users', r.lastID, { name, sector });
        res.json({ success: true, message: 'Local leader account created', leader: { id: r.lastID, name, sector } });
    } catch (e) {
        console.error('Create leader error:', e);
        res.status(500).json({ success: false, message: 'Failed to create leader account' });
    }
});

app.get('/api/admin/leaders', authenticateUser, requireAdmin, async (req, res) => {
    try {
        const rows = await dbAll(
            `SELECT u.id, u.name, u.email, u.phone, u.sector, u.created_at,
                    (SELECT COUNT(*) FROM beneficiaries b WHERE b.submitted_by = u.id) AS submitted,
                    (SELECT COUNT(*) FROM beneficiaries b WHERE b.verified_by = u.id) AS decided
             FROM users u WHERE u.role = 'leader' ORDER BY u.created_at DESC`
        );
        res.json({ success: true, data: rows });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Failed to load leaders' });
    }
});

// ---- Families: submission and verification (FR5, FR6) ----------------------------
function requireLeader(req, res, next) {
    if (!req.user || !(req.user.is_admin || req.user.role === 'leader')) {
        return res.status(403).json({ success: false, message: 'Local leader access required' });
    }
    next();
}

// A local leader (or admin) submits a family for verification, with supporting notes.
app.post('/api/families/submit', authenticateUser, requireLeader, async (req, res) => {
    try {
        const b = req.body || {};
        const headName = clean(b.headName, 120);
        const phoneRaw = clean(b.phone, 30);
        const cell = clean(b.cell, 80);
        const village = clean(b.village, 80);
        const needType = String(b.needType || '');
        const needDescription = clean(b.needDescription, 400);
        const notes = clean(b.notes, 1000);
        const ubudehe = Number(b.ubudeheCategory);
        const householdSize = b.householdSize ? Number(b.householdSize) : null;
        const needAmount = Math.floor(Number(String(b.needAmount || '').replace(/[^0-9.]/g, '')));

        // Leaders can only submit for their own sector; admins choose.
        let sector = req.user.is_admin ? clean(b.sector, 80) : (req.user.sector || '');
        if (!sector) {
            return res.status(400).json({ success: false, message: req.user.is_admin ? 'Sector is required' : 'Your account has no sector assigned. Please contact the admin.' });
        }

        if (!headName) return res.status(400).json({ success: false, message: 'Head of household name is required (kept private)' });
        if (phoneRaw && !validatePhone(phoneRaw)) return res.status(400).json({ success: false, message: 'Please provide a valid phone number' });
        if (![1, 2, 3, 4].includes(ubudehe)) return res.status(400).json({ success: false, message: 'Select the household\'s Ubudehe category' });
        if (!NEED_TYPES.includes(needType)) return res.status(400).json({ success: false, message: 'Need must be school fees or health insurance' });
        if (!Number.isFinite(needAmount) || needAmount < 1000 || needAmount > 5000000) {
            return res.status(400).json({ success: false, message: 'Enter the amount needed (between 1,000 and 5,000,000 RWF)' });
        }
        if (needDescription.length < 10) return res.status(400).json({ success: false, message: 'Write a short public description of the need (at least 10 characters)' });
        if (notes.length < 10) return res.status(400).json({ success: false, message: 'Supporting notes are required so the verifier can confirm the need' });
        if (householdSize !== null && (!Number.isInteger(householdSize) || householdSize < 1 || householdSize > 30)) {
            return res.status(400).json({ success: false, message: 'Household size must be between 1 and 30' });
        }

        const r = await dbRun(
            `INSERT INTO beneficiaries
               (name, phone, sector, cell, village, ubudehe_category, household_size, support_type,
                need_description, need_amount, notes, verification_status, status, submitted_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', ?)`,
            [headName, normalizePhone(phoneRaw), sector, cell, village, ubudehe, householdSize, needType,
             needDescription, needAmount, notes, req.user.id]
        );
        const code = 'NYA-' + String(r.lastID).padStart(4, '0');
        await dbRun('UPDATE beneficiaries SET family_code = ? WHERE id = ?', [code, r.lastID]);
        logAudit(req.user.id, 'family_submitted', 'beneficiaries', r.lastID, { code, sector, needType, needAmount });

        res.json({ success: true, message: `Family ${code} submitted for verification`, family: { id: r.lastID, familyCode: code, status: 'pending' } });
    } catch (e) {
        console.error('Family submit error:', e);
        res.status(500).json({ success: false, message: 'Failed to submit family' });
    }
});

// Verification queue / family list for leaders (own sector) and admin (all sectors)
app.get('/api/families/queue', authenticateUser, requireLeader, async (req, res) => {
    try {
        const sector = req.user.is_admin ? null : (req.user.sector || '__none__');
        const rows = await dbAll(
            `SELECT b.*, ${FUNDED_SQL} AS funded, s.name AS submitted_by_name, v.name AS verified_by_name
             FROM beneficiaries b
             LEFT JOIN users s ON s.id = b.submitted_by
             LEFT JOIN users v ON v.id = b.verified_by
             WHERE (? IS NULL OR lower(b.sector) = lower(?))
             ORDER BY CASE b.verification_status WHEN 'pending' THEN 0 ELSE 1 END, b.created_at DESC`,
            [sector, sector]
        );
        res.json({ success: true, data: rows });
    } catch (e) {
        console.error('Queue error:', e);
        res.status(500).json({ success: false, message: 'Failed to load families' });
    }
});

// Approve or reject. A leader may decide on families in their own sector, but not on one they submitted
// themselves (a second pair of eyes). The admin may decide on any family.
app.post('/api/families/:id/verify', authenticateUser, requireLeader, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const decision = String(req.body.decision || '');
        const notes = clean(req.body.notes, 500);
        if (!['approve', 'reject'].includes(decision)) {
            return res.status(400).json({ success: false, message: 'Decision must be approve or reject' });
        }
        if (decision === 'reject' && notes.length < 5) {
            return res.status(400).json({ success: false, message: 'Please give a reason when rejecting a family' });
        }

        const fam = await dbGet('SELECT * FROM beneficiaries WHERE id = ?', [id]);
        if (!fam) return res.status(404).json({ success: false, message: 'Family not found' });
        if (fam.verification_status !== 'pending') {
            return res.status(400).json({ success: false, message: `This family has already been ${fam.verification_status}` });
        }
        if (!req.user.is_admin) {
            if (String(fam.sector || '').toLowerCase() !== String(req.user.sector || '').toLowerCase()) {
                return res.status(403).json({ success: false, message: 'You can only verify families in your own sector' });
            }
            if (Number(fam.submitted_by) === Number(req.user.id)) {
                return res.status(403).json({ success: false, message: 'A different leader (or the admin) must verify a family you submitted' });
            }
        }

        const newStatus = decision === 'approve' ? 'approved' : 'rejected';
        await dbRun(
            `UPDATE beneficiaries
             SET verification_status = ?, status = ?, verified_by = ?, verified_at = CURRENT_TIMESTAMP,
                 verification_notes = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND verification_status = 'pending'`,
            [newStatus, decision === 'approve' ? 'active' : 'rejected', req.user.id, notes || null, id]
        );
        logAudit(req.user.id, `family_${newStatus}`, 'beneficiaries', id, { code: fam.family_code, notes });
        res.json({ success: true, message: `Family ${fam.family_code} ${newStatus}`, status: newStatus });
    } catch (e) {
        console.error('Verify error:', e);
        res.status(500).json({ success: false, message: 'Failed to record decision' });
    }
});

// Public list of VERIFIED families (FR2). Deliberately anonymous: no name, phone, cell or village.
app.get('/api/families/verified', async (req, res) => {
    try {
        const rows = await dbAll(
            `SELECT b.id, b.family_code, b.sector, b.ubudehe_category, b.support_type, b.need_description,
                    b.need_amount, b.verified_at, ${FUNDED_SQL} AS funded
             FROM beneficiaries b
             WHERE b.verification_status = 'approved'
             ORDER BY (b.need_amount - ${FUNDED_SQL}) > 0 DESC, b.verified_at DESC`
        );
        res.json({
            success: true,
            data: rows.map((r) => ({
                id: r.id,
                familyCode: r.family_code,
                sector: r.sector,
                ubudeheCategory: r.ubudehe_category,
                needType: r.support_type,
                needLabel: NEED_LABELS[r.support_type] || r.support_type,
                description: r.need_description,
                needAmount: r.need_amount,
                funded: Number(r.funded),
                remaining: Math.max(0, r.need_amount - Number(r.funded)),
                verifiedAt: r.verified_at,
            })),
        });
    } catch (e) {
        console.error('Verified families error:', e);
        res.status(500).json({ success: false, message: 'Failed to load families' });
    }
});

// ---- Impact and reports ----------------------------------------------------------
// Donor's own impact
app.get('/api/impact/user/:userId', authenticateUser, async (req, res) => {
    const userId = Number(req.params.userId);
    if (userId !== Number(req.user.id) && !req.user.is_admin) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    try {
        const row = await dbGet(
            `SELECT COALESCE(SUM(amount), 0) AS total_donated, COUNT(*) AS donation_count,
                    COUNT(DISTINCT beneficiary_id) AS families_helped
             FROM donations WHERE user_id = ? AND status = 'completed'`,
            [userId]
        );
        res.json({
            success: true,
            data: {
                totalDonated: row.total_donated || 0,
                donationCount: row.donation_count || 0,
                familiesHelped: row.families_helped || 0,
            },
        });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Failed to fetch impact data' });
    }
});

async function buildSummary() {
    const totals = await dbGet(
        `SELECT COALESCE(SUM(amount), 0) AS total_raised, COUNT(*) AS donation_count, COUNT(DISTINCT user_id) AS donor_count,
                COUNT(DISTINCT beneficiary_id) AS families_helped
         FROM donations WHERE status = 'completed'`
    );
    const byPurpose = await dbAll(
        `SELECT purpose, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
         FROM donations WHERE status = 'completed' GROUP BY purpose`
    );
    const byStatus = await dbAll(`SELECT status, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total FROM donations GROUP BY status`);
    const families = await dbAll(`SELECT verification_status AS status, COUNT(*) AS count FROM beneficiaries GROUP BY verification_status`);
    const need = await dbGet(
        `SELECT COALESCE(SUM(b.need_amount), 0) AS total_need,
                COALESCE(SUM(MIN(b.need_amount, ${FUNDED_SQL})), 0) AS total_funded,
                COALESCE(SUM(CASE WHEN ${FUNDED_SQL} >= b.need_amount THEN 1 ELSE 0 END), 0) AS fully_funded
         FROM beneficiaries b WHERE b.verification_status = 'approved'`
    );
    const countOf = (s) => Number((families.find((f) => f.status === s) || {}).count || 0);
    return {
        totalRaised: Number(totals.total_raised || 0),
        donationCount: Number(totals.donation_count || 0),
        donorCount: Number(totals.donor_count || 0),
        familiesHelped: Number(totals.families_helped || 0),
        verifiedFamilies: countOf('approved'),
        pendingFamilies: countOf('pending'),
        rejectedFamilies: countOf('rejected'),
        fullyFundedFamilies: Number(need.fully_funded || 0),
        totalNeed: Number(need.total_need || 0),
        totalFundedAgainstNeed: Number(need.total_funded || 0),
        stillNeeded: Math.max(0, Number(need.total_need || 0) - Number(need.total_funded || 0)),
        byPurpose,
        byStatus,
        updatedAt: new Date().toISOString(),
    };
}

// FR8: simple admin report on donations and verified families
app.get('/api/admin/reports/summary', authenticateUser, requireAdmin, async (req, res) => {
    try {
        res.json({ success: true, data: await buildSummary() });
    } catch (e) {
        console.error('Summary error:', e);
        res.status(500).json({ success: false, message: 'Failed to build report' });
    }
});

// Public impact stats (no login) — aggregate only
app.get('/api/public/impact', async (req, res) => {
    try {
        const d = await buildSummary();
        // Public view is aggregate-only: no pending/rejected counts or payment-status breakdown
        delete d.pendingFamilies; delete d.rejectedFamilies; delete d.byStatus;
        res.json({ success: true, data: d });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Failed to load impact stats' });
    }
});

// Health check route
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'Empower Nyamagabe API is running',
        timestamp: new Date().toISOString()
    });
});

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error'
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

// Start server (only when run directly, not when imported by tests)
if (require.main === module) {
    if (!JWT_SECRET) {
        console.error('❌ JWT_SECRET is not set. Add JWT_SECRET to your .env file (any long random string) and restart.');
        process.exit(1);
    }
    app.listen(PORT, () => {
        console.log(`\n🚀 Empower Nyamagabe Server running on http://localhost:${PORT}`);
        console.log('📊 Dashboard: http://localhost:' + PORT);
        console.log('🏥 Database:', dbPath);
        console.log('\n📋 Default admin: ' + (process.env.ADMIN_EMAIL || 'admin@empowernyamagabe.org'));
        console.log('⚠️  Change the admin password after first login!\n');
        
        // Initialize database
        initDatabase();

    });
}

module.exports = { app, db, initDatabase };

// Graceful shutdown
if (require.main === module) {
    process.on('SIGINT', () => {
        console.log('\n🛑 Shutting down server...');
        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err);
            } else {
                console.log('📦 Database connection closed.');
            }
            process.exit(0);
        });
    });
}

