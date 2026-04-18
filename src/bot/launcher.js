const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
} = require('@whiskeysockets/baileys');

// Firebase-backed auth state (survives Railway restarts)
// Falls back to useMultiFileAuthState if Firebase is unavailable
const { useFirebaseAuthState, clearSession: clearFirebaseSession } = require('../utils/firebaseAuthState');

const path = require('path');
const fs = require('fs');

const config = require('../config/config');
const { logger, registerBot, removeBot, generateSessionId } = require('../utils/helpers');
const { handleMessage } = require('../handlers/messageHandler');
const { createSession, getSession, updateSession } = require('../firebase/config');

// ─── SAFE GLOBAL ERROR HANDLERS ─────────────────────────
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
});

// ─── SESSIONS DIRECTORY ──────────────────────────────────
const SESSIONS_DIR = path.join(__dirname, '..', 'auth_info_baileys');

// ─── SILENT LOGGER ───────────────────────────────────────
const silentLogger = {
  level: 'silent',
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  child: () => silentLogger,
};

// ─── RECONNECT CONTROL ───────────────────────────────────
const reconnectAttempts = new Map();
const reconnectTimers = new Map();
const MAX_RECONNECT_ATTEMPTS = 10;

// ─── ACTIVE SOCKETS REGISTRY ─────────────────────────────
const activeSockets = new Map();

// ─── MAIN BOT FUNCTION ────────────────────────────────────
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
    if (!sessionId) sessionId = generateSessionId();

    // ─── KILL EXISTING SOCKET FOR THIS SESSION ────────
    if (activeSockets.has(sessionId)) {
      try {
        activeSockets.get(sessionId).end(undefined);
      } catch (e) {}
      activeSockets.delete(sessionId);
      await new Promise((r) => setTimeout(r, 2000));
    }

    // ─── CLEAR ANY PENDING RECONNECT TIMER ───────────
    if (reconnectTimers.has(sessionId)) {
      clearTimeout(reconnectTimers.get(sessionId));
      reconnectTimers.delete(sessionId);
    }

    const authDir = path.join(SESSIONS_DIR, sessionId);
    fs.mkdirSync(authDir, { recursive: true });

    // Prefer Firebase auth state (persistent) — fallback to filesystem
    let state, saveCreds;
    try {
      const fbAuth = await useFirebaseAuthState(sessionId);
      state     = fbAuth.state;
      saveCreds = fbAuth.saveCreds;
      logger.info(`Using Firebase auth state for session: ${sessionId}`);
    } catch (fbErr) {
      logger.warn(`Firebase auth state failed (${fbErr.message}) — using local filesystem`);
      const localAuth = await useMultiFileAuthState(authDir);
      state     = localAuth.state;
      saveCreds = localAuth.saveCreds;
    }
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2,3000,1015526] }));

    let pairCodeRequested = false;

    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, silentLogger),
      },
      printQRInTerminal: false,
      logger: silentLogger,
      browser: Browsers.ubuntu('Chrome'),
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
      markOnlineOnConnect: true,
      generateHighQualityLinkPreview: true,
      syncFullHistory: false,
      fireInitQueries: false,
    });

    activeSockets.set(sessionId, sock);

    sock.ev.on('creds.update', saveCreds);

    // ─── CONNECTION HANDLER ───────────────────────────
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr && onQR) onQR(qr);

      // ─── PAIR CODE — triggered on 'connecting' state ──
      if (
        connection === 'connecting' &&
        phoneNumber &&
        !state.creds.registered &&
        !pairCodeRequested
      ) {
        pairCodeRequested = true;
        try {
          const cleanNum = phoneNumber.replace(/[^0-9]/g, '').replace(/^0+/, '');
          const code = await sock.requestPairingCode(cleanNum);
          logger.info(`Pair code for ${sessionId}: ${code}`);
          if (onPairCode) onPairCode(code);
        } catch (err) {
          logger.error(`Pair code error: ${err.message}`);
          if (onPairCode) onPairCode(null, err.message);
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
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

          const delay = Math.min(5000 * attempts, 60000);
          logger.info(`Reconnecting ${sessionId} in ${delay}ms (attempt ${attempts})`);

          const timer = setTimeout(() => {
            reconnectTimers.delete(sessionId);
            startBot(sessionId, userId, onQR, onPairCode, onConnected, onDisconnected, phoneNumber);
          }, delay);

          reconnectTimers.set(sessionId, timer);
        } else {
          reconnectAttempts.delete(sessionId);
          reconnectTimers.delete(sessionId);

          // ─── CLEANUP: local dir + Firebase auth state ──────────
          try {
            fs.rmSync(authDir, { recursive: true, force: true });
          } catch (e) {
            logger.error(`Failed to delete auth dir: ${e.message}`);
          }
          // Also clear Firebase RTDB auth state for this session
          clearFirebaseSession(sessionId).catch(() => {});

          if (onDisconnected) onDisconnected(sessionId);
        }
      }

      // ─── CONNECTED ────────────────────────────────
      if (connection === 'open') {
        reconnectAttempts.delete(sessionId);

        // ─── SAFE JID NORMALIZATION ───────────────────
        const rawId = sock.user?.id || '';
        const botNumber = rawId.replace(/:[0-9]+@/, '@').replace('@s.whatsapp.net', '');

        logger.info(`Bot ${sessionId} connected as +${botNumber}`);
        registerBot(sessionId, sock, 'public');

        const existingSession = await getSession(sessionId);

        if (!existingSession) {
          await createSession(sessionId, userId, botNumber);
        } else {
          await updateSession(sessionId, {
            status: 'active',
            whatsappNumber: botNumber,
          });
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

    // ─── MESSAGE HANDLER ─────────────────────────────
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

// ─── STOP BOT ─────────────────────────────────────────────
async function stopBot(sessionId) {
  try {
    // ─── CANCEL ANY PENDING RECONNECT ────────────────
    if (reconnectTimers.has(sessionId)) {
      clearTimeout(reconnectTimers.get(sessionId));
      reconnectTimers.delete(sessionId);
    }

    reconnectAttempts.delete(sessionId);

    // ─── CLOSE ACTIVE SOCKET ─────────────────────────
    if (activeSockets.has(sessionId)) {
      try {
        activeSockets.get(sessionId).end(undefined);
      } catch (e) {}
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

