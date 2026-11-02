const clean = (value, max) => String(value == null ? '' : value).trim().slice(0, max);

const isEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// Rwandan mobile numbers: 07XXXXXXXX, 7XXXXXXXX or +2507XXXXXXXX
const isPhone = (phone) => /^(\+250|0)?7[0-9]{8}$/.test(String(phone).replace(/\s/g, ''));

function normalizePhone(raw) {
  const p = String(raw || '').replace(/[\s-]/g, '');
  if (!p) return null;
  if (p.startsWith('+250')) return p;
  if (p.startsWith('250')) return '+' + p;
  if (p.startsWith('0')) return '+250' + p.slice(1);
  if (p.startsWith('7')) return '+250' + p;
  return p;
}

// "5,000 RWF" -> 5000. The minus sign stays so negative amounts get rejected.
const parseAmount = (raw) => Number(String(raw == null ? '' : raw).replace(/[^0-9.-]/g, ''));

module.exports = { clean, isEmail, isPhone, normalizePhone, parseAmount };
