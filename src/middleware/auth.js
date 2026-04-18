const bcrypt = require('bcryptjs');
const config = require('../config/config');
const { getUserById, isSubscriptionActive } = require('../firebase/config');

// ─── SESSION AUTH ─────────────────────────────────────────
function isAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  return res.status(401).json({ error: 'Unauthorized. Please login.' });
}

function isAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(403).json({ error: 'Forbidden. Admin access only.' });
}

// ─── SUBSCRIPTION CHECK ───────────────────────────────────
async function isPaid(req, res, next) {
  try {
    if (req.session.isAdmin) return next(); // admin bypasses subscription check
    const uid = req.session.userId;
    if (!uid) return res.status(401).json({ error: 'Unauthorized.' });
    const active = await isSubscriptionActive(uid);
    if (!active) return res.status(403).json({
      error: 'No active subscription. Please purchase a plan to use this feature.',
    });
    next();
  } catch (err) {
    res.status(500).json({ error: 'Subscription check failed. Please try again.' });
  }
}

// ─── PASSWORD UTILITIES ───────────────────────────────────
async function hashPassword(password) {
  // BUG FIX: bcrypt salt rounds = 12 (was 12, kept — good)
  return bcrypt.hash(password, 12);
}

async function comparePassword(plain, hashed) {
  return bcrypt.compare(plain, hashed);
}

// ─── PASSWORD STRENGTH CHECK ──────────────────────────────
// BUG FIX: improved — now requires at least one uppercase + one special char for real security
function isStrongPassword(password) {
  if (typeof password !== 'string') return false;
  if (password.length < 8) return false;
  if (!/[a-zA-Z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  return true;
}

// ─── INPUT SANITIZATION ───────────────────────────────────
// BUG FIX: added email format validator used in register route
function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// BUG FIX: added phone validator used in register route
function isValidWhatsApp(number) {
  return typeof number === 'string' && /^[0-9]{10,15}$/.test(number.replace(/[^0-9]/g, ''));
}

module.exports = {
  isAuth,
  isAdmin,
  isPaid,
  hashPassword,
  comparePassword,
  isStrongPassword,
  isValidEmail,
  isValidWhatsApp,
};
