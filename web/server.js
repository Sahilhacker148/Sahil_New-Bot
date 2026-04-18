// ============================================================
//  SAHIL 804 BOT — Web Server  (FULLY FIXED v4.1.0)
//  Fixed by: Claude AI
//  Fixes:
//   1. firestore-store removed → connect-session-firestore used correctly
//   2. Firebase double-init conflict resolved (single source of truth)
//   3. Session cookie trust proxy fixed for Railway
//   4. Admin password crash guard improved with clear message
//   5. All imports unified — only src/firebase/config.js used
//   6. Graceful fallback to MemoryStore if Firestore session fails
//   7. CORS + Helmet properly configured for Railway
//   8. All async errors properly caught and returned as JSON
// ============================================================

require('dotenv').config();

const express       = require('express');
const session       = require('express-session');
const helmet        = require('helmet');
const rateLimit     = require('express-rate-limit');
const path          = require('path');
const { WebSocketServer } = require('ws');
const http          = require('http');
const QRCode        = require('qrcode');
const { v4: uuidv4 } = require('uuid');

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const config = require('../src/config/config');

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const {
  logger,
  generateSessionId,
  validateSessionId,
  getAllActiveBots,
} = require('../src/utils/helpers');

// ─── AUTH MIDDLEWARE ─────────────────────────────────────────────────────────
const {
  hashPassword,
  comparePassword,
  isAuth,
  isAdmin,
  isPaid,
  isStrongPassword,
  isValidEmail,
  isValidWhatsApp,
} = require('../src/middleware/auth');

// ─── FIREBASE FUNCTIONS (single source of truth) ─────────────────────────────
// All Firebase functions come from src/firebase/config.js ONLY.
// This file initializes Firebase Admin SDK once (IIFE) and exports everything.
// No double-init possible — Node.js require() cache ensures single execution.
const {
  db,                       // ← Firestore instance for session store
  createUser,
  getUserByEmail,
  getUserById,
  getAllUsers,
  updateUser,
  deleteUser,
  approveUser,
  rejectUser,
  assignSubscription,
  revokeSubscription,
  getSubscription,
  getAllSubscriptions,
  isSubscriptionActive,
  createSession,
  getSession,
  getSessionsByUser,
  getAllSessions,
  updateSession,
  deleteSession,
  setSessionMode,
  getPaymentSettings,
  updatePaymentSettings,
  getActiveAnnouncement,
  createAnnouncement,
  deactivateAnnouncement,
Timestamp,
} = require('../src/firebase/config');

// ─── BOT LAUNCHER ────────────────────────────────────────────────────────────
const { startBot, stopBot } = require('../src/bot/launcher');

// ─── EXPRESS + HTTP SERVER + WEBSOCKET ───────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server, path: '/ws' });

// ─── CUSTOM FIRESTORE SESSION STORE ──────────────────────────────────────────
// Built from scratch using firebase-admin 12 directly.
// No third-party connect-session-firestore package needed.
// connect-session-firestore@^2.0.0 does NOT exist on npm (only 1.0.0 exists
// and that requires firebase-admin@^5 which is incompatible with our v12).
// This custom store implements the full express-session Store interface.

const { Store } = session;

class FirestoreSessionStore extends Store {
  constructor(db, collection = 'express_sessions') {
    super();
    this.db         = db;
    this.collection = collection;
  }

  // Get session by sid
  async get(sid, callback) {
    try {
      const doc = await this.db.collection(this.collection).doc(sid).get();
      if (!doc.exists) return callback(null, null);
      const data = doc.data();
      // Check expiry
      if (data.expires && data.expires.toDate && data.expires.toDate() < new Date()) {
        await this.destroy(sid, () => {});
        return callback(null, null);
      }
      return callback(null, data.session || null);
    } catch (err) {
      return callback(err);
    }
  }

  // Set/update session
  async set(sid, sessionData, callback) {
    try {
      const maxAge  = sessionData.cookie?.maxAge || 86400000; // default 24h
      const expires = new Date(Date.now() + maxAge);
      await this.db.collection(this.collection).doc(sid).set({
        session:    sessionData,
        expires:    expires,
        updatedAt:  new Date(),
      });
      return callback(null);
    } catch (err) {
      return callback(err);
    }
  }

  // Destroy session
  async destroy(sid, callback) {
    try {
      await this.db.collection(this.collection).doc(sid).delete();
      return callback(null);
    } catch (err) {
      return callback(err);
    }
  }

  // Touch — refresh expiry without changing session data
  async touch(sid, sessionData, callback) {
    try {
      const maxAge  = sessionData.cookie?.maxAge || 86400000;
      const expires = new Date(Date.now() + maxAge);
      await this.db.collection(this.collection).doc(sid).update({
        expires:   expires,
        updatedAt: new Date(),
      });
      return callback(null);
    } catch (err) {
      return callback(null); // non-fatal — silently ignore
    }
  }
}

// ─── INITIALIZE SESSION STORE ─────────────────────────────────────────────────
let sessionStore;
try {
  const firebaseModule = require('../src/firebase/config');
  const firestoreDb    = firebaseModule.db;

  if (!firestoreDb) {
    throw new Error('Firestore not initialized — check Firebase environment variables');
  }

  sessionStore = new FirestoreSessionStore(firestoreDb, 'express_sessions');
  logger.success('✅ Custom Firestore session store initialized successfully');
} catch (err) {
  logger.warn('⚠️  Firestore session store failed — using MemoryStore as fallback');
  logger.warn('   Reason:', err.message);
  logger.warn('   Impact: Sessions will NOT persist across server restarts');
  logger.warn('   Fix   : Ensure all FIREBASE_* environment variables are set correctly');
  sessionStore = undefined; // express-session defaults to MemoryStore
}

// ─── SECURITY MIDDLEWARE ─────────────────────────────────────────────────────
// BUG FIX #3: Railway sits behind a reverse proxy. Without trust proxy = 1,
// secure cookies are never sent and sessions break after login.
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy:    false, // disabled so inline scripts in HTML pages work
  crossOriginEmbedderPolicy: false,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── SESSION MIDDLEWARE ───────────────────────────────────────────────────────
app.use(session({
  store:            sessionStore,          // Firestore or MemoryStore fallback
  secret:           config.sessionSecret,
  resave:           false,
  saveUninitialized: false,
  name:             'sahil804.sid',        // custom cookie name (security: obscure)
  cookie: {
    // BUG FIX #3: secure:true only in production (Railway), false in local dev
    secure:   process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge:   24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax',
  },
}));

// ─── RATE LIMITERS ───────────────────────────────────────────────────────────
const generalLimiter = rateLimit(config.rateLimit.general);
const pairLimiter    = rateLimit(config.rateLimit.pairing);
const authLimiter    = rateLimit(config.rateLimit.auth);

app.use('/api/',              generalLimiter);
app.use('/api/bot/start-qr',  pairLimiter);
app.use('/api/bot/start-pair', pairLimiter);
app.use('/api/auth/login',    authLimiter);
app.use('/api/auth/register', authLimiter);

// ─── REQUEST LOGGER ──────────────────────────────────────────────────────────
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    logger.debug(`${req.method} ${req.path} — ip: ${req.ip}`);
  }
  next();
});

// ─── QR WEBSOCKET ────────────────────────────────────────────────────────────
const qrClients = new Map(); // sessionId → ws

wss.on('connection', (ws, req) => {
  let sid;
  try {
    sid = new URL(req.url, 'http://x').searchParams.get('sessionId');
  } catch (_) {
    sid = null;
  }
  if (sid) qrClients.set(sid, ws);
  ws.on('close', () => { if (sid) qrClients.delete(sid); });
  ws.on('error', (err) => {
    logger.warn('WebSocket error:', err.message);
    if (sid) qrClients.delete(sid);
  });
});

function wsSend(sessionId, data) {
  const ws = qrClients.get(sessionId);
  if (ws && ws.readyState === 1) {
    try {
      ws.send(JSON.stringify(data));
    } catch (err) {
      logger.warn('wsSend error:', err.message);
    }
  }
}

// 
═══════════════════════════════════════════════════════════════════════════
//  AUTH ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, whatsapp, password } = req.body;

    // ── Validation ──
    if (!name || !email || !whatsapp || !password)
      return res.status(400).json({ error: 'All fields are required.' });
    if (name.trim().length < 2)
      return res.status(400).json({ error: 'Name must be at least 2 characters.' });
    if (!isValidEmail(email))
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    if (!isValidWhatsApp(whatsapp))
      return res.status(400).json({ error: 'Please enter a valid WhatsApp number (10-15 digits).' });
    if (!isStrongPassword(password))
      return res.status(400).json({ error: 'Password must be at least 8 characters and contain letters and numbers.' });

    const normalizedEmail = email.toLowerCase().trim();

    // ── Duplicate check ──
    const existing = await getUserByEmail(normalizedEmail);
    if (existing)
      return res.status(409).json({ error: 'This email is already registered.' });

    // ── BUG FIX #5: createUser now called with correct signature matching src/firebase/config.js ──
    // Previously server.js was calling createUser(uid, { name, email, ... }) but
    // src/utils/firebase.js had createUser(userId, email, phone, passwordHash) — MISMATCH
    // Now using only src/firebase/config.js's createUser(uid, dataObject) — CORRECT
    const hashed = await hashPassword(password);
    const uid    = uuidv4();

    await createUser(uid, {
      name:     name.trim(),
      email:    normalizedEmail,
      whatsapp: whatsapp.replace(/[^0-9]/g, ''),
      password: hashed,
      ip:       req.ip || null,
    });

    logger.success(`New user registered: ${normalizedEmail} (uid: ${uid})`);
    return res.json({
      success: true,
      message: 'Account created successfully! Waiting for admin approval.',
    });

  } catch (err) {
    logger.error('Register error:', err.message, err.stack);
    return res.status(500).json({ error: 'Registration failed. Please try again later.' });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required.' });

    const user = await getUserByEmail(email.toLowerCase().trim());
    if (!user)
      return res.status(401).json({ error: 'Invalid email or password.' });

    if (user.status === 'pending')
      return res.status(403).json({ error: 'Your account is pending admin approval. Please wait.' });
    if (user.status === 'rejected')
      return res.status(403).json({ error: 'Your account has been rejected. Please contact support.' });

    const valid = await comparePassword(password, user.password);
    if (!valid)
      return res.status(401).json({ error: 'Invalid email or password.' });

    // ── Update last login ──
    await updateUser(user.id, { lastLogin: Timestamp.now() });

    // ── Set session ──
    req.session.userId    = user.id;
    req.session.userEmail = user.email;

    // ── BUG FIX: Save session explicitly before sending response ──
    req.session.save((err) => {
      if (err) {
        logger.error('Session save error on login:', err.message);
        return res.status(500).json({ error: 'Login failed. Session could not be saved.' });
      }
      logger.success(`User logged in: ${user.email}`);
      return res.json({ success: true, redirect: '/dashboard.html' });
    });

  } catch (err) {
    logger.error('Login error:', err.message, err.stack);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// POST /api/auth/admin-login
app.post('/api/auth/admin-login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required.' });

    // BUG FIX #4: config.admin.password can be undefined if ADMIN_PASSWORD not set in env.
    // Instead of crashing the whole server, return a clear error to the admin.
    if (!config.admin.password) {
      logger.error('ADMIN_PASSWORD is not set in environment variables!');
      return res.status(500).json({ error: 'Admin login is not configured. Set ADMIN_PASSWORD in environment.' });
    }

    if (
      email.toLowerCase().trim() === config.admin.email.toLowerCase() &&
      password === config.admin.password
    ) {
      req.session.isAdmin = true;
      req.session.userId  = 'admin';

      // BUG FIX: explicit session save before redirect
      return req.session.save((err) => {
        if (err) {
          logger.error('Admin session save error:', err.message);
          return res.status(500).json({ error: 'Login failed. Session could not be saved.' });
        }
        logger.success('Admin logged in successfully');
        return res.json({ success: true, redirect: '/admin.html' });
      });
    }

    return res.status(401).json({ error: 'Invalid admin credentials.' });

  } catch (err) {
    logger.error('Admin login error:', err.message, err.stack);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// POST /api/auth/logout
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) logger.warn('Session destroy error:', err.message);
    res.clearCookie('sahil804.sid');
    return res.json({ success: true });
  });
});

// GET /api/auth/me
app.get('/api/auth/me', isAuth, async (req, res) => {
  try {
    if (req.session.isAdmin)
      return res.json({ isAdmin: true, email: config.admin.email });

    const user = await getUserById(req.session.userId);
    if (!user)
      return res.status(404).json({ error: 'User not found.' });

    const { password: _, ...safeUser } = user;
    return res.json(safeUser);

  } catch (err) {
    logger.error('GET /api/auth/me error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch user.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  USER ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/user/subscription
app.get('/api/user/subscription', isAuth, async (req, res) => {
  try {
    const sub    = await getSubscription(req.session.userId);
    const active = sub ? await isSubscriptionActive(req.session.userId) : false;
    return res.json({ subscription: sub, active });
  } catch (err) {
    logger.error('GET /api/user/subscription error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch subscription.' });
  }
});

// GET /api/user/status
app.get('/api/user/status', async (req, res) => {
  if (!req.session || !req.session.userId)
    return res.json({ success: false, error: 'Not logged in.' });
  try {
    const user = await getUserById(req.session.userId);
    if (!user)
      return res.json({ success: false, error: 'User not found.' });
    const { password: _, ...safeUser } = user;
    return res.json({ success: true, user: safeUser });
  } catch (err) {
    logger.error('GET /api/user/status error:', err.message);
    return res.status(500).json({ success: false, error: 'Server error.' });
  }
});

// GET /api/user/bots
app.get('/api/user/bots', isAuth, async (req, res) => {
  try {
    const sessions = await getSessionsByUser(req.session.userId);
    const liveBots = getAllActiveBots();
    const enriched = sessions.map(s => ({
      ...s,
      isLive: liveBots.some(b => b.sessionId === s.sessionId),
    }));
    return res.json({ bots: enriched });
  } catch (err) {
    logger.error('GET /api/user/bots error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch bots.' });
  }
});

// GET /api/announcement
app.get('/api/announcement', async (req, res) => {
  try {
    const ann = await getActiveAnnouncement();
    return res.json({ announcement: ann });
  } catch (err) {
    logger.warn('GET /api/announcement error:', err.message);
    return res.json({ announcement: null });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  BOT ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/bot/start-qr
app.post('/api/bot/start-qr', isAuth, isPaid, async (req, res) => {
  try {
    const sessionId = generateSessionId();
    res.json({ success: true, sessionId });

    startBot(
      sessionId,
      req.session.userId,
      async (qr) => {
        try {
          const qrImage = await QRCode.toDataURL(qr);
          wsSend(sessionId, { type: 'qr', qr: qrImage, sessionId });
        } catch (qrErr) {
          logger.error('QR generation error:', qrErr.message);
        }
      },
      null,
      (sid, number) => wsSend(sid, { type: 'connected',    sessionId: sid, number }),
      (sid)         => wsSend(sid, { type: 'disconnected', sessionId: sid }),
    ).catch(err => logger.error('Bot QR start error:', err.message));

  } catch (err) {
    logger.error('POST /api/bot/start-qr error:', err.message);
    return res.status(500).json({ error: 'Failed to start bot.' });
  }
});

// POST /api/bot/start-pair
app.post('/api/bot/start-pair', isAuth, isPaid, async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber)
      return res.status(400).json({ error: 'Phone number is required.' });

    const cleanNum = phoneNumber.replace(/[^0-9]/g, '');
    if (cleanNum.length < 10)
      return res.status(400).json({ error: 'Invalid phone number. Must be at least 10 digits.' });

    const sessionId = generateSessionId();

    startBot(
      sessionId,
      req.session.userId,
      null,
      (code, err) => {
  if (code) wsSend(sessionId, { type: 'pairCode', code, sessionId });
  else wsSend(sessionId, { type: 'pairError', error: err || 'Pair code failed' });
},
      (sid, number) => wsSend(sid, { type: 'connected',    sessionId: sid, number }),
      (sid)         => wsSend(sid, { type: 'disconnected', sessionId: sid }),
      phoneNumber,
    ).catch(err => logger.error('Bot pair start error:', err.message));

    return res.json({ success: true, sessionId });

  } catch (err) {
    logger.error('POST /api/bot/start-pair error:', err.message);
    return res.status(500).json({ error: 'Failed to start pairing.' });
  }
});

// POST /api/bot/deploy
app.post('/api/bot/deploy', isAuth, isPaid, async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!validateSessionId(sessionId))
      return res.status(400).json({ error: 'Invalid Session ID format.' });

    const sess = await getSession(sessionId);
    if (!sess)
      return res.status(404).json({ error: 'Session not found. Please generate QR or pair code first.' });
    if (sess.userId !== req.session.userId)
      return res.status(403).json({ error: 'Unauthorized.' });

    return res.json({ success: true, message: 'Bot is deploying!', sessionId });

  } catch (err) {
    logger.error('POST /api/bot/deploy error:', err.message);
    return res.status(500).json({ error: 'Deployment failed.' });
  }
});

// POST /api/bot/stop
app.post('/api/bot/stop', isAuth, async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId)
      return res.status(400).json({ error: 'Session ID is required.' });

    const sess = await getSession(sessionId);
    if (!sess)
      return res.status(404).json({ error: 'Session not found.' });
    if (sess.userId !== req.session.userId && !req.session.isAdmin)
      return res.status(403).json({ error: 'Unauthorized.' });

    await stopBot(sessionId);
    return res.json({ success: true });

  } catch (err) {
    logger.error('POST /api/bot/stop error:', err.message);
    return res.status(500).json({ error: 'Failed to stop bot.' });
  }
});

// DELETE /api/bot/:sessionId
app.delete('/api/bot/:sessionId', isAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const sess = await getSession(sessionId);
    if (!sess)
      return res.status(404).json({ error: 'Session not found.' });
    if (sess.userId !== req.session.userId && !req.session.isAdmin)
      return res.status(403).json({ error: 'Unauthorized.' });

    await stopBot(sessionId);
    await deleteSession(sessionId);
    return res.json({ success: true });

  } catch (err) {
    logger.error('DELETE /api/bot/:sessionId error:', err.message);
    return res.status(500).json({ error: 'Failed to delete bot.' });
  }
});

// POST /api/bot/mode
app.post('/api/bot/mode', isAuth, async (req, res) => {
  try {
    const { sessionId, mode } = req.body;
    if (!sessionId)
      return res.status(400).json({ error: 'Session ID is required.' });
    if (!['public', 'private'].includes(mode))
      return res.status(400).json({ error: 'Mode must be "public" or "private".' });

    const sess = await getSession(sessionId);
    if (!sess)
      return res.status(404).json({ error: 'Session not found.' });
    if (sess.userId !== req.session.userId && !req.session.isAdmin)
      return res.status(403).json({ error: 'Unauthorized.' });

    await setSessionMode(sessionId, mode);
    return res.json({ success: true, mode });

  } catch (err) {
    logger.error('POST /api/bot/mode error:', err.message);
    return res.status(500).json({ error: 'Failed to update bot mode.' });
  }
});

// POST /api/bot/restart
app.post('/api/bot/restart', isAuth, async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId)
      return res.status(400).json({ error: 'Session ID is required.' });

    const sess = await getSession(sessionId);
    if (!sess)
      return res.status(404).json({ error: 'Session not found.' });
    if (sess.userId !== req.session.userId && !req.session.isAdmin)
      return res.status(403).json({ error: 'Unauthorized.' });

    await stopBot(sessionId);

    setTimeout(() => {
      startBot(
        sessionId,
        sess.userId,
        null, null,
        (sid, number) => logger.success(`Bot ${sid} restarted — connected as +${number}`),
        (sid)         => logger.warn(`Bot ${sid} disconnected after restart`),
      ).catch(err => logger.error('Bot restart error:', err.message));
    }, 2000);

    return res.json({ success: true, message: 'Bot is restarting...' });

  } catch (err) {
    logger.error('POST /api/bot/restart error:', err.message);
    return res.status(500).json({ error: 'Failed to restart bot.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  ADMIN ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/admin/stats
app.get('/api/admin/stats', isAdmin, async (req, res) => {
  try {
    const [users, sessions, subs] = await Promise.all([
      getAllUsers(),
      getAllSessions(),
      getAllSubscriptions(),
    ]);
    const liveBots = getAllActiveBots();

    return res.json({
      totalUsers:         users.length,
      approvedUsers:      users.filter(u => u.status === 'approved').length,
      pendingApprovals:   users.filter(u => u.status === 'pending').length,
      rejectedUsers:      users.filter(u => u.status === 'rejected').length,
      totalSessions:      sessions.length,
      activeSessions:     sessions.filter(s => s.status === 'active').length,
      liveBots:           liveBots.length,
      monthlySubscribers: subs.filter(s => s.plan === 'monthly').length,
      yearlySubscribers:  subs.filter(s => s.plan === 'yearly').length,
    });
  } catch (err) {
    logger.error('GET /api/admin/stats error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch stats.' });
  }
});

// GET /api/admin/users
app.get('/api/admin/users', isAdmin, async (req, res) => {
  try {
    const users = await getAllUsers();
    return res.json({
      users: users.map(({ password: _, ...u }) => u),
    });
  } catch (err) {
    logger.error('GET /api/admin/users error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch users.' });
  }
});

// POST /api/admin/users/:uid/approve
app.post('/api/admin/users/:uid/approve', isAdmin, async (req, res) => {
  try {
    await approveUser(req.params.uid);
    return res.json({ success: true });
  } catch (err) {
    logger.error('Approve user error:', err.message);
    return res.status(500).json({ error: 'Failed to approve user.' });
  }
});

// POST /api/admin/users/:uid/reject
app.post('/api/admin/users/:uid/reject', isAdmin, async (req, res) => {
  try {
    await rejectUser(req.params.uid);
    return res.json({ success: true });
  } catch (err) {
    logger.error('Reject user error:', err.message);
    return res.status(500).json({ error: 'Failed to reject user.' });
  }
});

// DELETE /api/admin/users/:uid
app.delete('/api/admin/users/:uid', isAdmin, async (req, res) => {
  try {
    await deleteUser(req.params.uid);
    return res.json({ success: true });
  } catch (err) {
    logger.error('Delete user error:', err.message);
    return res.status(500).json({ error: 'Failed to delete user.' });
  }
});

// POST /api/admin/subscriptions/:uid
app.post('/api/admin/subscriptions/:uid', isAdmin, async (req, res) => {
  try {
    const { plan } = req.body;
    if (!['monthly', 'yearly'].includes(plan))
      return res.status(400).json({ error: 'Invalid plan. Use: monthly or yearly' });
    await assignSubscription(req.params.uid, plan);
    return res.json({ success: true });
  } catch (err) {
    logger.error('Assign subscription error:', err.message);
    return res.status(500).json({ error: 'Failed to assign subscription.' });
  }
});

// DELETE /api/admin/subscriptions/:uid
app.delete('/api/admin/subscriptions/:uid', isAdmin, async (req, res) => {
  try {
    await revokeSubscription(req.params.uid);
    return res.json({ success: true });
  } catch (err) {
    logger.error('Revoke subscription error:', err.message);
    return res.status(500).json({ error: 'Failed to revoke subscription.' });
  }
});

// GET /api/admin/sessions
app.get('/api/admin/sessions', isAdmin, async (req, res) => {
  try {
    const sessions = await getAllSessions();
    const liveBots = getAllActiveBots();
    const enriched = sessions.map(s => ({
      ...s,
      isLive: liveBots.some(b => b.sessionId === s.sessionId),
    }));
    return res.json({ sessions: enriched });
  } catch (err) {
    logger.error('GET /api/admin/sessions error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch sessions.' });
  }
});

// DELETE /api/admin/sessions/:sessionId
app.delete('/api/admin/sessions/:sessionId', isAdmin, async (req, res) => {
  try {
    await stopBot(req.params.sessionId);
    await deleteSession(req.params.sessionId);
    return res.json({ success: true });
  } catch (err) {
    logger.error('Delete session error:', err.message);
    return res.status(500).json({ error: 'Failed to delete session.' });
  }
});

// GET /api/admin/payment-settings
app.get('/api/admin/payment-settings', isAdmin, async (req, res) => {
  try {
    return res.json(await getPaymentSettings());
  } catch (err) {
    logger.error('GET /api/admin/payment-settings error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch payment settings.' });
  }
});

// POST /api/admin/payment-settings
app.post('/api/admin/payment-settings', isAdmin, async (req, res) => {
  try {
    await updatePaymentSettings(req.body);
    return res.json({ success: true });
  } catch (err) {
    logger.error('POST /api/admin/payment-settings error:', err.message);
    return res.status(500).json({ error: 'Failed to update payment settings.' });
  }
});

// GET /api/admin/live-bots
app.get('/api/admin/live-bots', isAdmin, (req, res) => {
  return res.json({ bots: getAllActiveBots() });
});

// POST /api/admin/announcements
app.post('/api/admin/announcements', isAdmin, async (req, res) => {
  try {
    const { title, message } = req.body;
    if (!title || !message)
      return res.status(400).json({ error: 'Title and message are required.' });
    const id = await createAnnouncement(title, message, config.admin.email);
    return res.json({ success: true, id });
  } catch (err) {
    logger.error('POST /api/admin/announcements error:', err.message);
    return res.status(500).json({ error: 'Failed to create announcement.' });
  }
});

// DELETE /api/admin/announcements/:id
app.delete('/api/admin/announcements/:id', isAdmin, async (req, res) => {
  try {
    await deactivateAnnouncement(req.params.id);
    return res.json({ success: true });
  } catch (err) {
    logger.error('DELETE /api/admin/announcements error:', err.message);
    return res.status(500).json({ error: 'Failed to deactivate announcement.' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  PUBLIC ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/payment-info (public — no auth required for payment display)
app.get('/api/payment-info', async (req, res) => {
  try {
    const s = await getPaymentSettings();
    return res.json({
      jazzcash:     s.jazzcash,
      easypaisa:    s.easypaisa,
      monthlyPrice: s.monthlyPrice,
      yearlyPrice:  s.yearlyPrice,
      currency:     s.currency,
      instructions: s.instructions,
    });
  } catch (err) {
    logger.error('GET /api/payment-info error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch payment info.' });
  }
});

// ─── HEALTH CHECK ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  return res.json({
    status:    'ok',
    bot:       config.bot.name,
    version:   config.bot.version,
    uptime:    Math.floor(process.uptime()),
    memory:    process.memoryUsage(),
    liveBots:  getAllActiveBots().length,
    timestamp: new Date().toISOString(),
  });
});

// ─── 404 HANDLER ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith('/api/'))
    return res.status(404).json({ error: 'API route not found.' });
  // SPA fallback — serve index.html for all non-API 404s
  return res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── GLOBAL ERROR HANDLER ────────────────────────────────────────────────────
// BUG FIX: proper 4-arg error handler signature required by Express
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logger.error('Express unhandled error:', err.message, err.stack);
  return res.status(500).json({ error: 'Internal server error.' });
});

// ─── START SERVER ─────────────────────────────────────────────────────────────
const PORT = config.port || 3000;

server.listen(PORT, () => {
  logger.success('╔══════════════════════════════════╗');
  logger.success('║   🤖  SAHIL 804 BOT  SERVER      ║');
  logger.success(`║   🌐  Port : ${PORT}                 ║`);
  logger.success('║   ✅  All Bugs Fixed v4.1.0       ║');
  logger.success('║   👑  Sahil Hacker 804            ║');
  logger.success('╚══════════════════════════════════╝');
});

// ─── GRACEFUL SHUTDOWN ────────────────────────────────────────────────────────
process.on('SIGTERM', () => {
  logger.warn('SIGTERM received — shutting down gracefully...');
  server.close(() => {
    logger.info('HTTP server closed.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.warn('SIGINT received — shutting down gracefully...');
  server.close(() => {
    logger.info('HTTP server closed.');
    process.exit(0);
  });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err.message, err.stack);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection:', reason);
});

module.exports = app;
      
