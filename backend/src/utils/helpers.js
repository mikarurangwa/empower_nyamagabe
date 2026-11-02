const env = require('../config/env');
const { ROLES } = require('../config/constants');

const roleOf = (user) => (user.is_admin ? ROLES.ADMIN : user.role || ROLES.DONOR);

// What we send to the browser about a user. Never includes the password hash.
const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  isAdmin: !!user.is_admin,
  role: roleOf(user),
  sector: user.sector || null,
});

const familyCode = (id) => 'NYA-' + String(id).padStart(4, '0');

const remainingNeed = (family) => Math.max(0, Number(family.need_amount) - Number(family.funded || 0));

// Public address of the site, used in payment and email links
const baseUrl = (req) => env.appBaseUrl || `${req.protocol}://${req.get('host')}`;

module.exports = { roleOf, publicUser, familyCode, remainingNeed, baseUrl };
