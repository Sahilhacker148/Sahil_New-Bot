const config = require('../config/config');
const { isSuperAdmin, getReactEmoji, logger, incrementBotMessageCount, sanitizeInput } = require('../utils/helpers');
const { handleCommand } = require('../commands/index');
const { getSession } = require('../firebase/config');
const NodeCache = require('node-cache');
const sessionCache = new NodeCache({ stdTTL: 30, checkperiod: 10 });

// ─── ANTI-SPAM TRACKER ───────────────────────────────────
// BUG FIX: use a cleanup interval to prevent memory leak from unbounded Map growth
const spamTracker = new Map(); // jid -> { count, lastMsg }
const SPAM_LIMIT  = 8;
const SPAM_WINDOW = 10 * 1000; // 10 seconds

// BUG FIX: clean up stale spam entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [jid, entry] of spamTracker.entries()) {
    if (now - entry.lastMsg > SPAM_WINDOW * 6) spamTracker.delete(jid);
  }
}, 5 * 60 * 1000);

function isSpamming(jid) {
  const now   = Date.now();
  const entry = spamTracker.get(jid);
  if (!entry || now - entry.lastMsg > SPAM_WINDOW) {
    spamTracker.set(jid, { count: 1, lastMsg: now });
    return false;
  }
  entry.count++;
  entry.lastMsg = now;
  return entry.count > SPAM_LIMIT;
}

// ─── EXTRACT MESSAGE BODY ────────────────────────────────
// BUG FIX: centralized body extraction — handles all message types
function extractBody(msg) {
  const m = msg.message;
  if (!m) return '';
  return (
    m.conversation                          ||
    m.extendedTextMessage?.text             ||
    m.imageMessage?.caption                 ||
    m.videoMessage?.caption                 ||
    m.documentMessage?.caption              ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    ''
  );
}

// ─── MAIN MESSAGE HANDLER ────────────────────────────────
async function handleMessage(sock, msg, sessionId) {
  try {
    if (!msg.message) return;
    if (msg.key.fromMe) return; // Ignore messages sent by the bot itself

    const from   = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;

    // Auto Status Seen + Like
    if (from === 'status@broadcast') {
      try {
        await sock.readMessages([msg.key]);
        await sock.sendMessage(from, {
          react: { text: '❤️', key: msg.key },
        }).catch(() => {});
      } catch (_) {}
      return;
    }

    // BUG FIX: use centralized body extractor
    const body = sanitizeInput(extractBody(msg));

    // Fetch session info (mode, botOwner)
    // BUG FIX: cache session in memory for 30s to reduce Firestore reads
    let session = sessionCache.get(sessionId);
    if (!session) {
      session = await getSession(sessionId);
      if (session) sessionCache.set(sessionId, session);
    }
    if (!session) return;

    const botMode     = session.mode || 'public';
    const botOwnerJid = session.whatsappNumber + '@s.whatsapp.net';

    // Mode check
    const superAdmin    = isSuperAdmin(sender);
    const isBotOwnerNum = sender === botOwnerJid;

    if (botMode === 'private' && !superAdmin && !isBotOwnerNum) return;

    // Anti-spam (skip for super admin / bot owner)
    if (!superAdmin && !isBotOwnerNum && isSpamming(sender)) {
      logger.warn(`Spam detected from ${sender} in session ${sessionId}`);
      // BUG FIX: warn the spammer instead of silently dropping
      await sock.sendMessage(from, {
        react: { text: '🚫', key: msg.key },
      }).catch(() => {});
      return;
    }

    // ─── ANTI-DELETE ─────────────────────────────────────
    if (msg.message?.protocolMessage?.type === 0) {
      try {
        const deletedKey = msg.message.protocolMessage.key;
        const deletedJid = deletedKey.remoteJid;
        const senderNum  = deletedKey.participant || deletedKey.remoteJid;
        const name       = msg.pushName || senderNum.replace('@s.whatsapp.net', '');
        await sock.sendMessage(botOwnerJid, {
          text:
            `╔══════════════════════════════╗\n` +
            `║ 🗑️ 𝑨𝑵𝑻𝑰-𝑫𝑬𝑳𝑬𝑻𝑬 𝑨𝑳𝑬𝑹𝑻        ║\n` +
            `╠══════════════════════════════╣\n` +
            `║ 👤 𝑵𝒂𝒎𝒆: ${name}\n` +
            `║ 📞 𝑵𝒖𝒎: ${senderNum.replace('@s.whatsapp.net', '')}\n` +
            `║ 💬 𝑪𝒉𝒂𝒕: ${deletedJid}\n` +
            `║ ⚠️ 𝑫𝒆𝒍𝒆𝒕𝒆𝒅 𝒂 𝒎𝒆𝒔𝒔𝒂𝒈𝒆!\n` +
            `╚══════════════════════════════╝`,
        }).catch(() => {});
      } catch (_) {}
    }

    // ─── VIEW ONCE SAVER ──────────────────────────────────
    if (msg.message?.viewOnceMessage || msg.message?.viewOnceMessageV2) {
      try {
        const inner =
          msg.message?.viewOnceMessage?.message ||
          msg.message?.viewOnceMessageV2?.message;
        const senderName = msg.pushName || sender.replace('@s.whatsapp.net', '');
        if (inner?.imageMessage) {
          await sock.sendMessage(botOwnerJid, {
            image: { url: inner.imageMessage.url },
            caption:
              `👁️ 𝑽𝒊𝒆𝒘 𝑶𝒏𝒄𝒆 𝑰𝒎𝒂𝒈𝒆 𝑺𝒂𝒗𝒆𝒅\n` +
              `👤 𝑭𝒓𝒐𝒎: ${senderName}`,
          }).catch(() => {});
        } else if (inner?.videoMessage) {
          await sock.sendMessage(botOwnerJid, {
            video: { url: inner.videoMessage.url },
            caption:
              `👁️ 𝑽𝒊𝒆𝒘 𝑶𝒏𝒄𝒆 𝑽𝒊𝒅𝒆𝒐 𝑺𝒂𝒗𝒆𝒅\n` +
              `👤 𝑭𝒓𝒐𝒎: ${senderName}`,
          }).catch(() => {});
        } else if (inner?.audioMessage) {
          await sock.sendMessage(botOwnerJid, {
            audio: { url: inner.audioMessage.url },
            mimetype: 'audio/mpeg',
            caption:
              `👁️ 𝑽𝒊𝒆𝒘 𝑶𝒏𝒄𝒆 𝑨𝒖𝒅𝒊𝒐 𝑺𝒂𝒗𝒆𝒅\n` +
              `👤 𝑭𝒓𝒐𝒎: ${senderName}`,
          }).catch(() => {});
        }
      } catch (_) {}
    }

    // Increment message counter
    incrementBotMessageCount(sessionId);

    // Auto React — only for non-empty text messages
    if (body) {
      const reactEmoji = getReactEmoji(body);
      await sock.sendMessage(from, {
        react: { text: reactEmoji, key: msg.key },
      }).catch(() => {});
    }

    // Handle commands
    const handled = await handleCommand(sock, msg, sessionId, botMode, botOwnerJid);

    // ─── CHATBOT AUTO-REPLY ──────────────────────────────
    if (!handled) {
      const prefix = config.bot.prefix;

      // AI command
      if (body.toLowerCase().startsWith(`${prefix}ai `)) {
        const query = body.slice(prefix.length + 3).trim();
        if (query) {
          await sock.sendMessage(from, {
            text:
              `╔══════════════════════════════╗\n` +
              `║ 🤖 𝑨𝑰 𝑨𝑺𝑺𝑰𝑺𝑻𝑨𝑵𝑻              ║\n` +
              `╠══════════════════════════════╣\n` +
              `║ 🔍 𝑸𝒖𝒆𝒓𝒚: ${query.slice(0, 50)}\n` +
              `║\n` +
              `║ ⚡ 𝑨𝑰 𝑰𝒏𝒕𝒆𝒈𝒓𝒂𝒕𝒊𝒐𝒏 𝑪𝒐𝒎𝒊𝒏𝒈 𝑺𝒐𝒐𝒏\n` +
              `║ 🚀 𝑺𝒕𝒂𝒚 𝑻𝒖𝒏𝒆𝒅 𝑭𝒐𝒓 𝑵𝒆𝒙𝒕 𝑼𝒑𝒅𝒂𝒕𝒆!\n` +
              `║\n` +
              `║ 👑 𝑳𝒆𝒈𝒆𝒏𝒅 𝑺𝒂𝒉𝒊𝒍 𝑯𝒂𝒄𝒌𝒆𝒓 𝟖𝟎𝟒\n` +
              `╚══════════════════════════════╝`,
          }, { quoted: msg }).catch(() => {});
        }
        return;
      }

      // Chatbot auto-reply (only when enabled via .boton)
      const chatbotEnabled = config.chatbotSessions?.get(sessionId) === true;
      if (chatbotEnabled && body && !body.startsWith(prefix)) {
        const lower = body.toLowerCase().trim();

        if (['hi', 'hello', 'hii', 'hey'].some(w => lower.includes(w))) {
          await sock.sendMessage(from, {
            text:
              `╔══════════════════════════════╗\n` +
              `║ 👋 𝑯𝒆𝒍𝒍𝒐 𝑻𝒉𝒆𝒓𝒆!              ║\n` +
              `╠══════════════════════════════╣\n` +
              `║ 🤖 𝑰 𝒂𝒎 𝑺𝒂𝒉𝒊𝒍 𝟖𝟎𝟒 𝑩𝒐𝒕 ⚡\n` +
              `║ 💬 𝑯𝒐𝒘 𝒄𝒂𝒏 𝑰 𝒉𝒆𝒍𝒑 𝒚𝒐𝒖 𝒕𝒐𝒅𝒂𝒚?\n` +
              `║ 📋 𝑻𝒚𝒑𝒆 *${prefix}menu* 𝒕𝒐 𝒔𝒕𝒂𝒓𝒕!\n` +
              `╚══════════════════════════════╝`,
          }, { quoted: msg }).catch(() => {});

        } else if (['how are you', 'how r u', 'wassup', 'whats up'].some(w => lower.includes(w))) {
          await sock.sendMessage(from, {
            text:
              `╔══════════════════════════════╗\n` +
              `║ 😎 𝑰 𝒂𝒎 𝑫𝒐𝒊𝒏𝒈 𝑨𝒎𝒂𝒛𝒊𝒏𝒈!      ║\n` +
              `╠══════════════════════════════╣\n` +
              `║ ⚡ 𝑨𝒍𝒘𝒂𝒚𝒔 𝑹𝒆𝒂𝒅𝒚 𝑻𝒐 𝑯𝒆𝒍𝒑!\n` +
              `║ 🚀 𝑾𝒉𝒂𝒕 𝒄𝒂𝒏 𝑰 𝒅𝒐 𝒇𝒐𝒓 𝒚𝒐𝒖?\n` +
              `╚══════════════════════════════╝`,
          }, { quoted: msg }).catch(() => {});

        } else if (['your name', 'who are you', 'bot name'].some(w => lower.includes(w))) {
          await sock.sendMessage(from, {
            text:
              `╔══════════════════════════════╗\n` +
              `║ 🤖 𝑩𝒐𝒕 𝑰𝒅𝒆𝒏𝒕𝒊𝒕𝒚               ║\n` +
              `╠══════════════════════════════╣\n` +
              `║ 📛 𝑵𝒂𝒎𝒆: 𝑺𝒂𝒉𝒊𝒍 𝟖𝟎𝟒 𝑩𝒐𝒕\n` +
              `║ 👑 𝑶𝒘𝒏𝒆𝒓: 𝑳𝒆𝒈𝒆𝒏𝒅 𝑺𝒂𝒉𝒊𝒍 𝑯𝒂𝒄𝒌𝒆𝒓 𝟖𝟎𝟒\n` +
              `║ ⚡ 𝑽𝒆𝒓𝒔𝒊𝒐𝒏: v${config.bot.version}\n` +
              `║ 🔢 𝑪𝒐𝒎𝒎𝒂𝒏𝒅𝒔: 𝟏𝟏𝟎+\n` +
              `╚══════════════════════════════╝`,
          }, { quoted: msg }).catch(() => {});

        } else if (['i love you', 'i luv you', 'love you'].some(w => lower.includes(w))) {
          await sock.sendMessage(from, {
            text:
              `╔══════════════════════════════╗\n` +
              `║ ❤️ 𝑳𝒐𝒗𝒆 𝑹𝒆𝒄𝒆𝒊𝒗𝒆𝒅!             ║\n` +
              `╠══════════════════════════════╣\n` +
              `║ 😄 𝑨𝒘𝒘! 𝑻𝒉𝒂𝒏𝒌 𝒀𝒐𝒖 𝑺𝒐 𝑴𝒖𝒄𝒉!\n` +
              `║ 🤖 𝑩𝒖𝒕 𝑰 𝒂𝒎 𝒋𝒖𝒔𝒕 𝒂 𝑩𝒐𝒕 😅\n` +
              `║ 📋 𝑻𝒓𝒚 *${prefix}menu* 𝒊𝒏𝒔𝒕𝒆𝒂𝒅!\n` +
              `╚══════════════════════════════╝`,
          }, { quoted: msg }).catch(() => {});

        } else if (['thanks', 'thank you', 'ty', 'thx'].some(w => lower.includes(w))) {
          await sock.sendMessage(from, {
            text:
              `╔══════════════════════════════╗\n` +
              `║ 🙏 𝒀𝒐𝒖 𝒂𝒓𝒆 𝑾𝒆𝒍𝒄𝒐𝒎𝒆!          ║\n` +
              `╠══════════════════════════════╣\n` +
              `║ ⚡ 𝑨𝒍𝒘𝒂𝒚𝒔 𝑯𝒆𝒓𝒆 𝑻𝒐 𝑯𝒆𝒍𝒑!\n` +
              `║ 🌟 𝑯𝒂𝒗𝒆 𝒂 𝑮𝒓𝒆𝒂𝒕 𝑫𝒂𝒚! 😊\n` +
              `╚══════════════════════════════╝`,
          }, { quoted: msg }).catch(() => {});

        } else if (['bye', 'goodbye', 'see you', 'cya'].some(w => lower.includes(w))) {
          await sock.sendMessage(from, {
            text:
              `╔══════════════════════════════╗\n` +
              `║ 👋 𝑮𝒐𝒐𝒅𝒃𝒚𝒆!                  ║\n` +
              `╠══════════════════════════════╣\n` +
              `║ 🌟 𝑻𝒂𝒌𝒆 𝑪𝒂𝒓𝒆 𝑨𝒏𝒅 𝑺𝒕𝒂𝒚 𝑺𝒂𝒇𝒆!\n` +
              `║ 🤖 𝑰 𝒘𝒊𝒍𝒍 𝑩𝒆 𝑯𝒆𝒓𝒆 𝑾𝒉𝒆𝒏 𝒀𝒐𝒖\n` +
              `║    𝑹𝒆𝒕𝒖𝒓𝒏! 😊\n` +
              `╚══════════════════════════════╝`,
          }, { quoted: msg }).catch(() => {});

        } else {
          await sock.sendMessage(from, {
            text:
              `╔══════════════════════════════╗\n` +
              `║ 🤖 𝑺𝒂𝒉𝒊𝒍 𝟖𝟎𝟒 𝑩𝒐𝒕              ║\n` +
              `╠══════════════════════════════╣\n` +
              `║ 💬 𝒀𝒐𝒖 𝑺𝒂𝒊𝒅:\n` +
              `║ _"${body.slice(0, 60)}"_\n` +
              `║\n` +
              `║ 📋 𝑼𝒔𝒆 *${prefix}menu* 𝒕𝒐 𝑺𝒆𝒆\n` +
              `║    𝑨𝒍𝒍 𝑨𝒗𝒂𝒊𝒍𝒂𝒃𝒍𝒆 𝑪𝒐𝒎𝒎𝒂𝒏𝒅𝒔!\n` +
              `╚══════════════════════════════╝`,
          }, { quoted: msg }).catch(() => {});
        }
      }
    }

  } catch (err) {
    logger.error(`[Session: ${sessionId}] Message handler error:`, err.message);
  }
}

module.exports = { handleMessage };
