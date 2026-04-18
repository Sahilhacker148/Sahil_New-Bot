'use strict';
// ============================================================
//  launcher.js — FIXED for @whiskeysockets/baileys v6.7.x ESM
//  Baileys v6.7+ is pure ESM — require() does NOT work.
//  Fix: lazy dynamic import() wrapped inside an async init.
//  All exports remain identical — no other file needs changes.
// ============================================================

const path = require('path');
const fs   = require('fs');

const config  = require('../config/config');
const { logger, registerBot, removeBot, generateSessionId } = require('../utils/helpers');
const { handleMessage }                                      = require('../handlers/messageHandler');
const { createSession, getSession, updateSession }           = require('../firebase/config');
const { useFirebaseAuthState, clearSession: clearFirebaseSession } = require('../utils/firebaseAuthState');

// ─── SAFE GLOBAL ERROR HANDLERS ──────────────────────────────────────────────
process.on('uncaughtException',  (err) => console.error('UNCAUGHT EXCEPTION:',  err));
process.on('unhandledRejection', (err) => console.error('UNHANDLED REJECTION:', err));

// ─── SESSIONS DIRECTORY ───────────────────────────────────────────────────────
const SESSIONS_DIR = path.join(__dirname, '..', 'auth_info_baileys');

// ─── SILENT LOGGER ────────────────────────────────────────────────────────────
const silentLogger = {
  level: 'silent',
  trace: () => {}, debug: () => {}, info: () => {},
  warn:  () => {}, error: () => {}, fatal: () => {},
  child: () => silentLogger,
};

// ─── RECONNECT CONTROL ────────────────────────────────────────────────────────
const reconnectAttempts = new Map();
const reconnectTimers   = new Map();
const MAX_RECONNECT_ATTEMPTS = 10;

// ─── ACTIVE SOCKETS REGISTRY ─────────────────────────────────────────────────
const activeSockets = new Map();

// ─── BAILEYS ESM LOADER (cached after first load) ────────────────────────────
let _baileys = null;
async function getBaileys() {
  if (_baileys) return _baileys;
  _baileys = await import('@whiskeysockets/baileys');
  return _baileys;
}

// ─── MAIN BOT FUNCTION ────────────────────────────────────────────────────────
async function startBot(
  sessionId,
  userId,
  onQR,
  onPairCode,
  onConnected,
  onDisconnected,
  phoneNumber = null
) {
  try {
    const {
      default: makeWASocket,
      DisconnectReason,
      useMultiFileAuthState,
      fetchLatestBaileysVersion,
      makeCacheableSignalKeyStore,
      Browsers,
    } = await getBaileys();

    if (!sessionId) sessionId = generateSessionId();

    if (activeSockets.has(sessionId)) {
      try { activeSockets.get(sessionId).end(undefined); } catch (_) {}
      activeSockets.delete(sessionId);
      await new Promise((r) => setTimeout(r, 2000));
    }

    if (reconnectTimers.has(sessionId)) {
      clearTimeout(reconnectTimers.get(sessionId));
      reconnectTimers.delete(sessionId);
    }

    const authDir = path.join(SESSIONS_DIR, sessionId);
    fs.mkdirSync(authDir, { recursive: true });

    let state, saveCreds;
    try {
      const fbAuth  = await useFirebaseAuthState(sessionId);
      state         = fbAuth.state;
      saveCreds     = fbAuth.saveCreds;
      logger.info(`Using Firebase auth state for session: ${sessionId}`);
    } catch (fbErr) {
      logger.warn(`Firebase auth state failed (${fbErr.message}) — using local filesystem`);
      const localAuth = await useMultiFileAuthState(authDir);
      state           = localAuth.state;
      saveCreds       = localAuth.saveCreds;
    }

    // ── BUG FIX: fetchLatestBaileysVersion with proper fallback ──────────────
    let version;
    try {
      const result = await fetchLatestBaileysVersion();
      version = result.version;
      logger.info(`Baileys version: ${version}`);
    } catch (_) {
      version = [2, 3000, 1015526];
      logger.warn(`fetchLatestBaileysVersion failed — using fallback: ${version}`);
    }

    let pairCodeRequested = false;

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys:  makeCacheableSignalKeyStore(state.keys, silentLogger),
      },
      printQRInTerminal:              false,
      logger:                         silentLogger,
      browser:                        Browsers.ubuntu('Chrome'),
      connectTimeoutMs:               60_000,
      defaultQueryTimeoutMs:          60_000,
      keepAliveIntervalMs:            30_000,
      markOnlineOnConnect:            true,
      generateHighQualityLinkPreview: true,
      syncFullHistory:                false,
      fireInitQueries:                false,
    });

    activeSockets.set(sessionId, sock);
    sock.ev.on('creds.update', saveCreds);

    // ── Connection handler ─────────────────────────────────────────────────────
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr && onQR) onQR(qr);

      // ── BUG FIX: Pair code timing ─────────────────────────────────────────
      // ROOT CAUSE: In Baileys v6.7.x, calling requestPairingCode() immediately
      // on 'connecting' event causes "Connection Closed" + 401 because the
      // WebSocket handshake with WhatsApp is NOT complete at that point.
      // FIX: Delay pair code request by 3 seconds after 'connecting' fires,
      // giving the WS handshake enough time to fully complete.
      if (
        connection === 'connecting' &&
        phoneNumber &&
        !state.creds.registered &&
        !pairCodeRequested
      ) {
        pairCodeRequested = true;
        setTimeout(async () => {
          // Safety check: socket must still be active after delay
          if (!activeSockets.has(sessionId)) return;
          try {
            const cleanNum = phoneNumber.replace(/[^0-9]/g, '').replace(/^0+/, '');
            logger.info(`Requesting pair code for: ${cleanNum} (session: ${sessionId})`);
            const code = await sock.requestPairingCode(cleanNum);
            logger.info(`Pair code for ${sessionId}: ${code}`);
            if (onPairCode) onPairCode(code);
          } catch (err) {
            logger.error(`Pair code error: ${err.message}`);
            if (onPairCode) onPairCode(null, err.message);
          }
        }, 3000);
      }

      if (connection === 'close') {
        const statusCode      = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        logger.warn(`Bot ${sessionId} disconnected. Code: ${statusCode}`);
        activeSockets.delete(sessionId);
        removeBot(sessionId);
        await updateSession(sessionId, { status: 'inactive' }).catch(() => {});

        if (shouldReconnect) {
          const attempts = (reconnectAttempts.get(sessionId) || 0) + 1;
          reconnectAttempts.set(sessionId, attempts);

          if (attempts > MAX_RECONNECT_ATTEMPTS) {
            logger.error(`Max reconnect attempts reached for ${sessionId}`);
            reconnectAttempts.delete(sessionId);
            reconnectTimers.delete(sessionId);
            if (onDisconnected) onDisconnected(sessionId);
            return;
          }

          const delay = Math.min(5000 * attempts, 60_000);
          logger.info(`Reconnecting ${sessionId} in ${delay}ms (attempt ${attempts})`);

          const timer = setTimeout(() => {
            reconnectTimers.delete(sessionId);
            startBot(sessionId, userId, onQR, onPairCode, onConnected, onDisconnected, phoneNumber);
          }, delay);

          reconnectTimers.set(sessionId, timer);

        } else {
          reconnectAttempts.delete(sessionId);
          reconnectTimers.delete(sessionId);

          try {
            fs.rmSync(authDir, { recursive: true, force: true });
          } catch (e) {
            logger.error(`Failed to delete auth dir: ${e.message}`);
          }

          clearFirebaseSession(sessionId).catch(() => {});
          if (onDisconnected) onDisconnected(sessionId);
        }
      }

      if (connection === 'open') {
        reconnectAttempts.delete(sessionId);

        const rawId     = sock.user?.id || '';
        const botNumber = rawId.replace(/:[0-9]+@/, '@').replace('@s.whatsapp.net', '');

        logger.info(`Bot ${sessionId} connected as +${botNumber}`);
        registerBot(sessionId, sock, 'public');

        const existingSession = await getSession(sessionId);
        if (!existingSession) {
          await createSession(sessionId, userId, botNumber);
        } else {
          await updateSession(sessionId, { status: 'active', whatsappNumber: botNumber });
        }

        const welcomeMsg =
          `🤖 SAHIL 804 BOT READY\n` +
          `✅ Connected Successfully\n` +
          `📋 Type .menu\n` +
          `🌐 Mode: PUBLIC\n` +
          `🔐 Session: ${sessionId}`;

        const jid = rawId.replace(/:[0-9]+@/, '@') || `${botNumber}@s.whatsapp.net`;
        await sock.sendMessage(jid, { text: welcomeMsg }).catch(() => {});

        if (onConnected) onConnected(sessionId, botNumber);
      }
    });

    // ── Message handler ────────────────────────────────────────────────────────
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        if (!msg.message) continue;
        await handleMessage(sock, msg, sessionId).catch((err) =>
          logger.error(err.message)
        );
      }
    });

    return sock;

  } catch (err) {
    console.error('BOT START ERROR:', err);
    throw err;
  }
}

// ─── STOP BOT ─────────────────────────────────────────────────────────────────
async function stopBot(sessionId) {
  try {
    if (reconnectTimers.has(sessionId)) {
      clearTimeout(reconnectTimers.get(sessionId));
      reconnectTimers.delete(sessionId);
    }

    reconnectAttempts.delete(sessionId);

    if (activeSockets.has(sessionId)) {
      try { activeSockets.get(sessionId).end(undefined); } catch (_) {}
      activeSockets.delete(sessionId);
    }

    removeBot(sessionId);
    await updateSession(sessionId, { status: 'inactive' }).catch(() => {});
    logger.info(`Bot ${sessionId} stopped`);
  } catch (e) {
    console.error(e);
  }
}

module.exports = { startBot, stopBot };
      
