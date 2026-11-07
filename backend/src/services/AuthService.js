const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { ROLES } = require('../config/constants');
const { roleOf, publicUser } = require('../utils/helpers');
const { clean, isEmail, isPhone, normalizePhone } = require('../utils/validators');
const { ValidationError, ForbiddenError, UnauthorizedError } = require('../utils/AppError');

const RESET_LINK_MINUTES = 60;
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

class AuthService {
  constructor({ users, resets, audit, email, settings }) {
    this.users = users;
    this.resets = resets;
    this.audit = audit;
    this.email = email;
    this.settings = settings;
  }

  #signToken(user) {
    return jwt.sign({ uid: user.id, role: roleOf(user) }, this.settings.jwtSecret, { expiresIn: this.settings.jwtExpiresIn });
  }

  #hash(password) {
    return bcrypt.hash(password, this.settings.bcryptRounds);
  }

  // Creates the first admin from .env if there is no admin yet
  async ensureAdmin() {
    if (await this.users.findAdmin()) return 'exists';
    const { email, password } = this.settings.admin;
    if (!password) return 'missing-password';
    await this.users.createAdmin(email, await this.#hash(password));
    await this.audit.add(null, 'admin_account_created', 'users', null, { email });
    return 'created';
  }

  async userFromToken(token) {
    if (!token) throw new UnauthorizedError();
    let payload;
    try {
      payload = jwt.verify(token, this.settings.jwtSecret);
    } catch (err) {
      throw new UnauthorizedError('Your session has expired. Please log in again.');
    }
    const user = await this.users.findById(payload.uid);
    if (!user) throw new UnauthorizedError();
    return user;
  }

  // Shared by sign-up and leader accounts
  async #checkNewAccount({ name, email, phone, password }) {
    if (!name || !password) throw new ValidationError('Name and password are required');
    if (!email && !phone) throw new ValidationError('Enter a phone number or an email address');
    if (email && !isEmail(email)) throw new ValidationError('Enter a valid email address');
    if (phone && !isPhone(phone)) throw new ValidationError('Enter a valid Rwandan phone number');
    if (password.length < 6) throw new ValidationError('Password must be at least 6 characters');

    const normalized = normalizePhone(phone);
    if (await this.users.exists(email, normalized)) {
      throw new ValidationError('An account with this email or phone number already exists');
    }
    return normalized;
  }

  static #readAccount(body) {
    return {
      name: clean(body.name, 120),
      email: clean(body.email, 200).toLowerCase(),
      phone: clean(body.phone, 30),
      password: String(body.password || ''),
    };
  }

  async signup(body) {
    const input = AuthService.#readAccount(body);
    const phone = await this.#checkNewAccount(input);

    // Public sign-up always makes a donor. Leaders are added by the admin.
    const id = await this.users.create({ ...input, phone, passwordHash: await this.#hash(input.password), role: ROLES.DONOR });
    const user = await this.users.findById(id);
    return { user: publicUser(user), token: this.#signToken(user) };
  }

  async login(body) {
    const identifier = clean(body.identifier || body.email, 200);
    const password = String(body.password || '');
    const wantedRole = body.role || ROLES.DONOR;
    if (!identifier || !password) throw new ValidationError('Enter your phone or email and your password');

    const user = identifier.includes('@')
      ? await this.users.findByEmail(identifier)
      : await this.users.findByPhone(normalizePhone(identifier));

    const ok = user && (await bcrypt.compare(password, user.password_hash));
    if (!ok) throw new ValidationError('Wrong phone/email or password');

    const role = roleOf(user);
    if (wantedRole === ROLES.ADMIN && role !== ROLES.ADMIN) throw new ForbiddenError('This is not an admin account');
    if (wantedRole === ROLES.LEADER && role === ROLES.DONOR) throw new ForbiddenError('This is not a local leader account');

    return { user: publicUser(user), token: this.#signToken(user) };
  }

  async createLeader(admin, body) {
    const input = AuthService.#readAccount(body);
    const sector = clean(body.sector, 80);
    if (input.name.length < 2 || !sector) throw new ValidationError('Name and sector are required');

    const phone = await this.#checkNewAccount(input);
    const id = await this.users.create({
      ...input, phone, passwordHash: await this.#hash(input.password), role: ROLES.LEADER, sector,
    });

    await this.audit.add(admin.id, 'leader_account_created', 'users', id, { name: input.name, sector });
    return { id, name: input.name, sector };
  }

  listLeaders() {
    return this.users.listLeaders();
  }

  async requestPasswordReset(emailRaw, appUrl) {
    const user = await this.users.findByEmail(String(emailRaw || '').trim().toLowerCase());
    if (!user) return; // same reply either way, so emails can't be guessed

    const token = crypto.randomBytes(24).toString('hex');
    await this.resets.create(user.id, hashToken(token), new Date(Date.now() + RESET_LINK_MINUTES * 60 * 1000));

    const link = `${appUrl}/reset-password?email=${encodeURIComponent(user.email)}&token=${token}`;
    const sent = await this.email.send({
      to: user.email,
      subject: 'Reset your password',
      text: `Use this link to set a new password. It expires in one hour.\n${link}`,
      html: `<p>Use the link below to set a new password. It expires in one hour.</p><p><a href="${link}">Reset password</a></p>`,
    });
    if (!sent) console.log('Password reset link:', link);

    await this.audit.add(user.id, 'password_reset_requested', 'users', user.id);
  }

  async resetPassword({ email, token, newPassword }) {
    const user = await this.users.findByEmail(String(email || '').trim().toLowerCase());
    if (!user) throw new ValidationError('This reset link is not valid');

    const reset = await this.resets.findValid(user.id, hashToken(String(token || '').trim()));
    if (!reset) throw new ValidationError('This reset link is not valid or has expired');

    await this.users.updatePassword(user.id, await this.#hash(String(newPassword)));
    await this.resets.markUsed(reset.id);
    await this.audit.add(user.id, 'password_reset_completed', 'users', user.id);
  }
}

module.exports = AuthService;
