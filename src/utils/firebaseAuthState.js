// ============================================================
//  SAHIL 804 BOT — Baileys Auth State in Firebase RTDB
//  NEW FILE v4.2.0
//
//  PURPOSE: Store WhatsApp session credentials in Firebase
//  Realtime Database instead of filesystem.
//
//  WHY: On Railway (and all cloud platforms), the filesystem
//  is EPHEMERAL — it resets on every deploy/restart.
//  Storing auth state in RTDB ensures sessions survive restarts.
//
//  USAGE in launcher.js:
//    const { useFirebaseAuthState } = require('../utils/firebaseAuthState');
//    const { state, saveCreds } = await useFirebaseAuthState(sessionId);
//    // Use exactly like useMultiFileAuthState
// ============================================================

'use strict';

const { initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');
const { rtdb, initOk } = require('../firebase/config');

// ─── HELPERS ─────────────────────────────────────────────

function rtdbPath(sessionId) {
  // Sanitize sessionId for use as Firebase path key
  return `whatsapp_sessions/${sessionId.replace(/[.#$[\]]/g, '_')}`;
}

/**
 * Read all keys for a session from Firebase RTDB.
 * Returns null if nothing is stored yet.
 */
async function readSession(sessionId) {
  if (!initOk || !rtdb) return null;
  try {
    const snap = await rtdb.ref(rtdbPath(sessionId)).once('value');
    return snap.val();  // null if not found
  } catch (err) {
    console.warn(`[AuthState] Warning: could not read session ${sessionId}:`, err.message);
    return null;
  }
}

/**
 * Write a key-value pair to Firebase RTDB for this session.
 */
async function writeKey(sessionId, key, value) {
  if (!initOk || !rtdb) return;
  try {
    // Firebase keys cannot contain . # $ [ ]
    const safeKey = key.replace(/[.#$[\]]/g, '_');
    await rtdb.ref(`${rtdbPath(sessionId)}/${safeKey}`).set(
      JSON.stringify(value, BufferJSON.replacer)
    );
  } catch (err) {
    console.warn(`[AuthState] Warning: could not write key ${key}:`, err.message);
  }
}

/**
 * Delete a specific key for this session.
 */
async function deleteKey(sessionId, key) {
  if (!initOk || !rtdb) return;
  try {
    const safeKey = key.replace(/[.#$[\]]/g, '_');
    await rtdb.ref(`${rtdbPath(sessionId)}/${safeKey}`).remove();
  } catch (err) {
    console.warn(`[AuthState] Warning: could not delete key ${key}:`, err.message);
  }
}

/**
 * Delete ALL data for a session (called when bot is deleted or logged out).
 */
async function clearSession(sessionId) {
  if (!initOk || !rtdb) return;
  try {
    await rtdb.ref(rtdbPath(sessionId)).remove();
    console.log(`[AuthState] Session data cleared: ${sessionId}`);
  } catch (err) {
    console.warn(`[AuthState] Warning: could not clear session ${sessionId}:`, err.message);
  }
}

/**
 * Firebase-backed Baileys auth state.
 * Drop-in replacement for useMultiFileAuthState — same return signature.
 *
 * Falls back to fresh credentials if RTDB is unavailable,
 * so the bot can still generate a new QR code.
 *
 * @param {string} sessionId — unique session identifier (e.g. SAHIL-XXXXXXXX)
 * @returns {{ state: AuthenticationState, saveCreds: function }}
 */
async function useFirebaseAuthState(sessionId) {
  // ── Load existing session data ──
  let stored = null;
  if (initOk && rtdb) {
    stored = await readSession(sessionId);
  }

  // ── Parse credentials ──
  let creds;
  if (stored?.creds) {
    try {
      creds = JSON.parse(stored.creds, BufferJSON.reviver);
    } catch {
      creds = initAuthCreds();
    }
  } else {
    creds = initAuthCreds();
  }

  // ── Keys interface (Baileys Signal key store) ──
  const keys = {
    get: async (type, ids) => {
      const data = {};
      for (const id of ids) {
        const rawKey = `key_${type}_${id}`;
        const safeKey = rawKey.replace(/[.#$[\]]/g, '_');
        // Live RTDB read — NOT stale snapshot — so newly written keys are visible
        let raw = null;
        if (initOk && rtdb) {
          try {
            const snap = await rtdb.ref(`${rtdbPath(sessionId)}/${safeKey}`).once('value');
            raw = snap.val();
          } catch { /* ignore — treat as missing */ }
        }
        if (raw) {
          try {
            const value = JSON.parse(raw, BufferJSON.reviver);
            data[id] = value;
          } catch {
            // Ignore parse errors — key will be treated as missing
          }
        }
      }
      return data;
    },

    set: async (data) => {
      const writes = [];
      for (const [category, categoryData] of Object.entries(data)) {
        for (const [id, value] of Object.entries(categoryData)) {
          const key = `key_${category}_${id}`;
          if (value) {
            writes.push(writeKey(sessionId, key, value));
          } else {
            writes.push(deleteKey(sessionId, key));
          }
        }
      }
      if (writes.length > 0) {
        await Promise.allSettled(writes);
      }
    },
  };

  // ── saveCreds: called by Baileys when creds change ──
  const saveCreds = async () => {
    await writeKey(sessionId, 'creds', creds);
  };

  return {
    state: { creds, keys },
    saveCreds,
    clearSession: () => clearSession(sessionId),
  };
}

module.exports = {
  useFirebaseAuthState,
  clearSession,
};
