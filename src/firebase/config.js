// ============================================================
//  SAHIL 804 BOT — Firebase Admin SDK (Firestore + RTDB)
//  FULLY FIXED v4.2.0
//  Developer: Sahil Hacker
//  Fixes:
//   1. Complete service account credential (all 8 fields from env)
//   2. Robust init — server does NOT crash if Firebase fails
//   3. Private key \n handling — supports all .env formats
//   4. databaseURL included for Realtime DB access
//   5. Single shared admin instance — no double-init possible
//   6. Startup success logs printed on init
//   7. requireInit() guard on every DB function
// ============================================================

'use strict';

require('dotenv').config();

const admin = require('firebase-admin');

// ─── PRIVATE KEY PARSER ──────────────────────────────────
// Handles every common .env format:
//   "-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"  (actual newlines)
//   "-----BEGIN PRIVATE KEY-----\\nMIIE...\\n-----END PRIVATE KEY-----\\n" (escaped)
//   Key without surrounding quotes (Railway strips them automatically)
function parsePrivateKey(raw) {
  if (!raw) return null;
  // 1. Replace literal \\n with real newline
  let key = raw.replace(/\\n/g, '\n');
  // 2. Strip accidental surrounding quotes
  key = key.trim().replace(/^["']|["']$/g, '');
  if (!key.startsWith('-----BEGIN')) {
    console.error('[FIREBASE ERROR] FIREBASE_PRIVATE_KEY must start with: -----BEGIN PRIVATE KEY-----');
    return null;
  }
  return key;
}

// ─── BUILD FULL SERVICE ACCOUNT OBJECT ───────────────────
// Matches the downloaded serviceAccountKey.json exactly.
// Admin SDK minimum requirement: project_id + private_key + client_email.
// All other fields included for completeness and Railway compatibility.
function buildServiceAccount() {
  const projectId    = process.env.FIREBASE_PROJECT_ID   || 'sahilhaccker-bot';
  const clientEmail  = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey   = parsePrivateKey(process.env.FIREBASE_PRIVATE_KEY);
  const privateKeyId = process.env.FIREBASE_PRIVATE_KEY_ID || '';
  const clientId     = process.env.FIREBASE_CLIENT_ID     || '';

  if (!clientEmail) throw new Error('FIREBASE_CLIENT_EMAIL is not set in environment variables.');
  if (!privateKey)  throw new Error('FIREBASE_PRIVATE_KEY is missing or malformed.');

  return {
    type:                        'service_account',
    project_id:                  projectId,
    private_key_id:              privateKeyId,
    private_key:                 privateKey,
    client_email:                clientEmail,
    client_id:                   clientId,
    auth_uri:                    'https://accounts.google.com/o/oauth2/auth',
    token_uri:                   'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
    client_x509_cert_url:        `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(clientEmail)}`,
  };
}

// ─── STATE ───────────────────────────────────────────────
let _db     = null;   // Firestore instance
let _rtdb   = null;   // Realtime Database instance
let _initOk = false;  // true only after successful init

// ─── INITIALIZE ──────────────────────────────────────────
(function initializeFirebase() {
  // If another module already initialized Firebase (shouldn't happen with single import, but safe guard)
  if (admin.apps.length > 0) {
    _db     = admin.firestore();
    _rtdb   = admin.database();
    _initOk = true;
    console.log('[OK   ' + new Date().toISOString() + '] ✅ Firebase already initialized — reusing existing app');
    console.log('[OK   ' + new Date().toISOString() + '] ✅ Firestore session store initialized successfully');
    return;
  }

  try {
    const serviceAccount = buildServiceAccount();
    const databaseURL    = process.env.FIREBASE_DATABASE_URL
      || `https://${serviceAccount.project_id}-default-rtdb.asia-southeast1.firebasedatabase.app`;

    admin.initializeApp({
      credential:  admin.credential.cert(serviceAccount),
      databaseURL: databaseURL,
    });

    _db   = admin.firestore();
    _rtdb = admin.database();

    // Required for long-running Node.js processes — prevents undefinedFields warnings
    _db.settings({ ignoreUndefinedProperties: true });

    _initOk = true;

    const ts = new Date().toISOString();
    console.log(`[OK   ${ts}] ✅ Firebase Admin SDK initialized successfully`);
    console.log(`[OK   ${ts}] ✅ Firestore session store initialized successfully`);
    console.log(`[OK   ${ts}] ✅ Realtime Database connected → ${databaseURL}`);
    console.log(`[OK   ${ts}] ✅ Project: ${serviceAccount.project_id} | Account: ${serviceAccount.client_email}`);

  } catch (err) {
    // ── Do NOT crash the server — allow it to start so admin can diagnose ──
    console.error(`[ERROR ${new Date().toISOString()}] ❌ Firebase initialization FAILED`);
    console.error('   Reason  :', err.message);
    console.error('   Action  : Check all FIREBASE_* variables in Railway → Variables or .env file');
    console.error('   Guide   : docs/FIREBASE_SETUP_URDU.md');
    _initOk = false;
    _db     = null;
    _rtdb   = null;
  }
})();

// ─── INIT GUARD ──────────────────────────────────────────
// Every exported function calls this first.
// Throws a clean error instead of a cryptic "Cannot read property of null".
function requireInit() {
  if (!_initOk || !_db) {
    throw new Error(
      '🔴 Firebase is not initialized. ' +
      'Set FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL, FIREBASE_PROJECT_ID ' +
      'in your .env file or Railway variables, then restart the server.'
    );
  }
}

// ─── FIRESTORE HELPERS ────────────────────────────────────
const { FieldValue, Timestamp } = admin.firestore;


// ═══════════════════════════════════════════════════════
//  USERS
// ═══════════════════════════════════════════════════════

async function createUser(uid, data) {
  requireInit();
  await _db.collection('users').doc(uid).set({
    name:        data.name     || '',
    email:       data.email    || '',
    whatsapp:    data.whatsapp || '',
    password:    data.password || '',
    status:      'pending',
    plan:        'free',
    planExpiry:  null,
    botsCreated: 0,
    botsAllowed: 0,
    createdAt:   Timestamp.now(),
    lastLogin:   null,
    ip:          data.ip || null,
  });
}

async function getUserById(uid) {
  requireInit();
  const doc = await _db.collection('users').doc(uid).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

async function getUserByEmail(email) {
  requireInit();
  const snap = await _db
    .collection('users')
    .where('email', '==', email.toLowerCase().trim())
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function getAllUsers() {
  requireInit();
  const snap = await _db.collection('users').orderBy('createdAt', 'desc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function updateUser(uid, data) {
  requireInit();
  await _db.collection('users').doc(uid).update({ ...data, updatedAt: Timestamp.now() });
}

async function deleteUser(uid) {
  requireInit();
  await Promise.allSettled([
    _db.collection('subscriptions').doc(uid).delete(),
    _db.collection('users').doc(uid).delete(),
  ]);
}

async function approveUser(uid) {
  requireInit();
  await _db.collection('users').doc(uid).update({
    status:     'approved',
    approvedAt: Timestamp.now(),
  });
}

async function rejectUser(uid) {
  requireInit();
  await _db.collection('users').doc(uid).update({
    status:     'rejected',
    rejectedAt: Timestamp.now(),
  });
}


// ═══════════════════════════════════════════════════════
//  SUBSCRIPTIONS
// ═══════════════════════════════════════════════════════

async function assignSubscription(uid, plan) {
  requireInit();
  const days        = plan === 'yearly' ? 365 : 30;
  const botsAllowed = plan === 'yearly' ? 999 : 10;
  const expiry      = new Date();
  expiry.setDate(expiry.getDate() + days);

  const subData = {
    uid,
    plan,
    startDate:     Timestamp.now(),
    expiry:        Timestamp.fromDate(expiry),
    botsAllowed,
    botsUsed:      0,
    paymentStatus: 'confirmed',
    activatedBy:   'admin',
    activatedAt:   Timestamp.now(),
  };

  const batch = _db.batch();
  batch.set(_db.collection('subscriptions').doc(uid), subData);
  batch.update(_db.collection('users').doc(uid), {
    plan,
    planExpiry:  Timestamp.fromDate(expiry),
    botsAllowed,
    status:      'approved',
    updatedAt:   Timestamp.now(),
  });
  await batch.commit();
}

async function revokeSubscription(uid) {
  requireInit();
  const batch = _db.batch();
  batch.delete(_db.collection('subscriptions').doc(uid));
  batch.update(_db.collection('users').doc(uid), {
    plan:        'free',
    planExpiry:  null,
    botsAllowed: 0,
    updatedAt:   Timestamp.now(),
  });
  await batch.commit();
}

async function getSubscription(uid) {
  requireInit();
  const doc = await _db.collection('subscriptions').doc(uid).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

async function getAllSubscriptions() {
  requireInit();
  const snap = await _db.collection('subscriptions').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function isSubscriptionActive(uid) {
  const sub = await getSubscription(uid);
  if (!sub) return false;
  const expiry = sub.expiry?.toDate?.() || new Date(0);
  return expiry > new Date();
}


// ═══════════════════════════════════════════════════════
//  BOT SESSIONS (Firestore — persists across deploys)
// ═══════════════════════════════════════════════════════

async function createSession(sessionId, userId, whatsappNumber) {
  requireInit();
  const batch = _db.batch();
  batch.set(_db.collection('sessions').doc(sessionId), {
    userId,
    sessionId,
    whatsappNumber: whatsappNumber || '',
    status:         'active',
    mode:           'public',
    createdAt:      Timestamp.now(),
    lastActive:     Timestamp.now(),
    plan:           'free',
    messageCount:   0,
  });
  batch.update(_db.collection('users').doc(userId), {
    botsCreated: FieldValue.increment(1),
  });
  await batch.commit();
}

async function getSession(sessionId) {
  requireInit();
  const doc = await _db.collection('sessions').doc(sessionId).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

async function getSessionsByUser(userId) {
  requireInit();
  const snap = await _db.collection('sessions')
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function getAllSessions() {
  requireInit();
  const snap = await _db.collection('sessions').orderBy('createdAt', 'desc').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function updateSession(sessionId, data) {
  requireInit();
  await _db.collection('sessions').doc(sessionId).update({
    ...data,
    lastActive: Timestamp.now(),
  });
}

async function deleteSession(sessionId) {
  requireInit();
  const session = await getSession(sessionId);
  const batch   = _db.batch();
  if (session?.userId) {
    const userRef = _db.collection('users').doc(session.userId);
    const userDoc = await userRef.get();
    if (userDoc.exists && (userDoc.data().botsCreated || 0) > 0) {
      batch.update(userRef, { botsCreated: FieldValue.increment(-1) });
    }
  }
  batch.delete(_db.collection('sessions').doc(sessionId));
  await batch.commit();
}

async function setSessionMode(sessionId, mode) {
  requireInit();
  await _db.collection('sessions').doc(sessionId).update({
    mode,
    lastActive: Timestamp.now(),
  });
}


// ═══════════════════════════════════════════════════════
//  SETTINGS
// ═══════════════════════════════════════════════════════

const DEFAULT_PAYMENT_SETTINGS = {
  jazzcash:     '03496049312',
  easypaisa:    '03496049312',
  monthlyPrice: '500',
  yearlyPrice:  '4000',
  currency:     'PKR',
  instructions: 'Send payment screenshot to WhatsApp after paying.',
};

async function getPaymentSettings() {
  requireInit();
  const doc = await _db.collection('settings').doc('payment').get();
  return doc.exists ? doc.data() : DEFAULT_PAYMENT_SETTINGS;
}

async function updatePaymentSettings(data) {
  requireInit();
  await _db.collection('settings').doc('payment').set(data, { merge: true });
}


// ═══════════════════════════════════════════════════════
//  ANNOUNCEMENTS
// ═══════════════════════════════════════════════════════

async function createAnnouncement(title, message, adminEmail) {
  requireInit();
  const ref = _db.collection('announcements').doc();
  await ref.set({
    id:        ref.id,
    title,
    message,
    createdBy: adminEmail,
    createdAt: Timestamp.now(),
    active:    true,
  });
  return ref.id;
}

async function getActiveAnnouncement() {
  requireInit();
  const snap = await _db.collection('announcements')
    .where('active', '==', true)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

async function deactivateAnnouncement(id) {
  requireInit();
  await _db.collection('announcements').doc(id).update({ active: false });
}


// ═══════════════════════════════════════════════════════
//  EXPORTS
// ═══════════════════════════════════════════════════════

module.exports = {
  // Instances (needed by session store, auth state, utilities)
  get db()     { return _db; },
  get rtdb()   { return _rtdb; },
  admin,
  FieldValue,
  Timestamp,
  get initOk() { return _initOk; },
  // Users
  createUser, getUserById, getUserByEmail, getAllUsers,
  updateUser, deleteUser, approveUser, rejectUser,

  // Subscriptions
  assignSubscription, revokeSubscription, getSubscription,
  getAllSubscriptions, isSubscriptionActive,

  // Bot Sessions
  createSession, getSession, getSessionsByUser, getAllSessions,
  updateSession, deleteSession, setSessionMode,

  // Settings
  getPaymentSettings, updatePaymentSettings,

  // Announcements
  createAnnouncement, getActiveAnnouncement, deactivateAnnouncement,
};
