'use strict';

// ════════════════════════════════════════════════════════════════════════════
//  Sahil Legend LAZMI BOT — src/handlers/messageHandler.js
//  ULTIMATE PRO MASTER LEVEL 2026
//  Owner  : Sahil Legend
//  Links  : All require paths 100% preserved — zero structure breakage
// ════════════════════════════════════════════════════════════════════════════

const config = require('../config/config');
const {
  isSuperAdmin,
  getReactEmoji,
  logger,
  incrementBotMessageCount,
  sanitizeInput,
  formatUptime,
  getTimestamp,
  jidToNumber,
} = require('../utils/helpers');
const { handleCommand } = require('../commands/index');
const { getSession }    = require('../firebase/config');
const NodeCache         = require('node-cache');

// ─── SESSION CACHE — 30s TTL, reduces Firestore reads ────────────────────────
const sessionCache = new NodeCache({ stdTTL: 30, checkperiod: 10 });

// ════════════════════════════════════════════════════════════════════════════
//  ① ANTI-SPAM ENGINE — per-user sliding window
// ════════════════════════════════════════════════════════════════════════════
const spamTracker = new Map(); // jid → { count, lastMsg, warned }
const SPAM_LIMIT  = 8;
const SPAM_WINDOW = 10_000; // 10 seconds

// Auto-clean stale entries every 5 minutes — prevents memory leak
setInterval(() => {
  const now = Date.now();
  for (const [jid, e] of spamTracker.entries())
    if (now - e.lastMsg > SPAM_WINDOW * 6) spamTracker.delete(jid);
}, 5 * 60_000);

function isSpamming(jid) {
  const now   = Date.now();
  const entry = spamTracker.get(jid);
  if (!entry || now - entry.lastMsg > SPAM_WINDOW) {
    spamTracker.set(jid, { count: 1, lastMsg: now, warned: false });
    return false;
  }
  entry.count++;
  entry.lastMsg = now;
  return entry.count > SPAM_LIMIT;
}

// ════════════════════════════════════════════════════════════════════════════
//  ② COOLDOWN ENGINE — per-user per-command (5 seconds)
// ════════════════════════════════════════════════════════════════════════════
const cooldowns   = new Map(); // `${jid}:${cmd}` → timestamp
const COOLDOWN_MS = 5_000;

function isOnCooldown(jid, cmd) {
  const key  = `${jid}:${cmd}`;
  const last = cooldowns.get(key) || 0;
  if (Date.now() - last < COOLDOWN_MS) return true;
  cooldowns.set(key, Date.now());
  return false;
}

// Auto-clean cooldown map every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, t] of cooldowns.entries())
    if (now - t > COOLDOWN_MS * 2) cooldowns.delete(k);
}, 10 * 60_000);

// ════════════════════════════════════════════════════════════════════════════
//  ③ USER ACTIVITY TRACKER — lightweight in-memory
// ════════════════════════════════════════════════════════════════════════════
const userActivity = new Map();
// jid → { totalMsgs, commandCount, lastSeen, firstName, joinedAt }

function trackUser(jid, pushName, isCommand) {
  const now      = new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' });
  const existing = userActivity.get(jid) || {
    totalMsgs: 0, commandCount: 0,
    lastSeen: now, firstName: pushName || 'User',
    joinedAt: now,
  };
  existing.totalMsgs++;
  if (isCommand) existing.commandCount++;
  existing.lastSeen  = now;
  existing.firstName = pushName || existing.firstName;
  userActivity.set(jid, existing);
}

// Expose globally so commands/index.js can access .mystats data
global.__userActivity = userActivity;

// ════════════════════════════════════════════════════════════════════════════
//  ④ SMART REACT ENGINE — command-aware emoji mapping
// ════════════════════════════════════════════════════════════════════════════
function getSmartReact(body, prefix) {
  const b = (body || '').toLowerCase().trim();
  if (!b.startsWith(prefix)) return getReactEmoji(body);

  const cmd = b.slice(prefix.length).split(' ')[0];
  const map = {
    dl: '⬇️', video: '🎬', audio: '🎵', play: '🎶', song: '🎸',
    yt: '📺', ytmp3: '🎵', tiktok: '🎵', fb: '📘', ig: '📸',
    menu: '📋', help: '📖', info: 'ℹ️', ping: '🏓', speed: '⚡',
    uptime: '⏱️', stats: '📊', mystats: '👤', weather: '🌤️', news: '📰',
    quran: '📖', hadith: '📿', dua: '🤲', prayer: '🕌', hijri: '🕋',
    joke: '😂', meme: '😄', quote: '💬', fact: '🧠', riddle: '🤔',
    shayari: '🌹', attitude: '😎', pickup: '😍', roast: '🔥',
    truth: '❓', dare: '🎯', compliment: '🌟', gm: '🌅', gn: '🌙',
    calc: '🧮', translate: '🌐', sticker: '🎨', wiki: '📚',
    short: '🔗', define: '📝', currency: '💱', time: '⏰',
    sim: '📱', ip: '🌐', fancy: '✨', big: '🔠', howto: '📋',
    crypto: '💹', topcrypto: '📊',
    broadcast: '📢', kick: '👢', add: '➕', promote: '⬆️',
    demote: '⬇️', mute: '🔇', unmute: '🔊', tagall: '📣',
    ai: '🤖', gpt: '🧠',
    default: '⚡',
  };
  return map[cmd] || map.default;
}

// ════════════════════════════════════════════════════════════════════════════
//  ⑤ MESSAGE BODY EXTRACTOR — handles ALL WhatsApp message types
// ════════════════════════════════════════════════════════════════════════════
function extractBody(msg) {
  const m = msg.message;
  if (!m) return '';
  return (
    m.conversation                                                      ||
    m.extendedTextMessage?.text                                         ||
    m.imageMessage?.caption                                             ||
    m.videoMessage?.caption                                             ||
    m.documentMessage?.caption                                          ||
    m.audioMessage?.caption                                             ||
    m.stickerMessage?.caption                                           ||
    m.buttonsResponseMessage?.selectedButtonId                          ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId             ||
    m.templateButtonReplyMessage?.selectedId                            ||
    m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
    ''
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  ⑥ MAIN MESSAGE HANDLER
// ════════════════════════════════════════════════════════════════════════════
async function handleMessage(sock, msg, sessionId) {
  try {
    if (!msg.message) return;

    const from   = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;

    // ── OWNER FIX: allow owner to use bot on their own number ──────────────
    const isGroupMsg = from?.endsWith('@g.us');
    if (msg.key.fromMe && !isGroupMsg) return;

    // ── AUTO STATUS SEEN + LOVE REACT ──────────────────────────────────────
    if (from === 'status@broadcast') {
      try {
        await sock.readMessages([msg.key]);
        await sock.sendMessage(from, {
          react: { text: '❤️', key: msg.key },
        }).catch(() => {});
      } catch (_) {}
      return;
    }

    const body     = sanitizeInput(extractBody(msg));
    const prefix   = config.bot.prefix || '.';
    const isCmd    = body.startsWith(prefix);
    const pushName = msg.pushName || 'User';

    // ── SESSION FETCH — cached 30s ─────────────────────────────────────────
    let session = sessionCache.get(sessionId);
    if (!session) {
      session = await getSession(sessionId);
      if (session) sessionCache.set(sessionId, session);
    }
    if (!session) return;

    const botMode     = session.mode || 'public';
    const botOwnerJid = session.whatsappNumber + '@s.whatsapp.net';

    // ── ACCESS CONTROL ─────────────────────────────────────────────────────
    const superAdmin   = isSuperAdmin(sender);
    const isBotOwner   = sender === botOwnerJid;
    const isPrivileged = superAdmin || isBotOwner;

    if (botMode === 'private' && !isPrivileged) return;

    // ── ANTI-SPAM — skip for privileged users ──────────────────────────────
    if (!isPrivileged && isSpamming(sender)) {
      logger.warn(`[SPAM] ${sender} in session ${sessionId}`);
      const entry = spamTracker.get(sender);
      if (entry && !entry.warned) {
        entry.warned = true;
        await sock.sendMessage(from, {
          text:
            `╭━━━〔 🚫 𝑺𝑷𝑨𝑴 𝑫𝑬𝑻𝑬𝑪𝑻𝑬𝑫 〕━━━╮\n` +
            `┃\n` +
            `┃  👤 ${pushName}\n` +
            `┃  ⏳ Ruko 10 seconds\n` +
            `┃  📋 Phir .menu use karo\n` +
            `┃\n` +
            `┃  👑 Owner: Sahil Legend\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━╯`,
        }, { quoted: msg }).catch(() => {});
      }
      return;
    }

    // ── USER ACTIVITY TRACK ────────────────────────────────────────────────
    trackUser(sender, pushName, isCmd);

    // ── ANTI-DELETE ALERT → OWNER ──────────────────────────────────────────
    if (msg.message?.protocolMessage?.type === 0) {
      try {
        const dk    = msg.message.protocolMessage.key;
        const dNum  = (dk.participant || dk.remoteJid || '').replace('@s.whatsapp.net', '');
        const dName = msg.pushName || dNum;
        const dTime = new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' });
        await sock.sendMessage(botOwnerJid, {
          text:
            `╭━━━〔 🗑️ 𝑨𝑵𝑻𝑰-𝑫𝑬𝑳𝑬𝑻𝑬 𝑨𝑳𝑬𝑹𝑻 〕━━━╮\n` +
            `┃\n` +
            `┃  👤 𝑵𝒂𝒎𝒆   : ${dName}\n` +
            `┃  📞 𝑵𝒖𝒎𝒃𝒆𝒓 : ${dNum}\n` +
            `┃  💬 𝑪𝒉𝒂𝒕   : ${dk.remoteJid}\n` +
            `┃  🕐 𝑻𝒊𝒎𝒆   : ${dTime}\n` +
            `┃  ⚠️ 𝑴𝒔𝒈 𝑫𝒆𝒍𝒆𝒕𝒆𝒅!\n` +
            `┃\n` +
            `┃  👑 Owner: Sahil Legend\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━╯`,
        }).catch(() => {});
      } catch (_) {}
    }

    // ── VIEW ONCE SAVER → OWNER ───────────────────────────────────────────
    if (msg.message?.viewOnceMessage || msg.message?.viewOnceMessageV2) {
      try {
        const inner =
          msg.message?.viewOnceMessage?.message ||
          msg.message?.viewOnceMessageV2?.message;
        const sName = msg.pushName || sender.replace('@s.whatsapp.net', '');
        const dTime = new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' });
        const cap   =
          `╭━━━〔 👁️ 𝑽𝑰𝑬𝑾 𝑶𝑵𝑪𝑬 𝑺𝑨𝑽𝑬𝑫 〕━━━╮\n` +
          `┃  👤 From : ${sName}\n` +
          `┃  🕐 Time : ${dTime}\n` +
          `┃  👑 Owner: Legend Sahil\n` +
          `╰━━━━━━━━━━━━━━━━━━━━━━━╯`;

        if (inner?.imageMessage)
          await sock.sendMessage(botOwnerJid, { image: { url: inner.imageMessage.url }, caption: cap }).catch(() => {});
        else if (inner?.videoMessage)
          await sock.sendMessage(botOwnerJid, { video: { url: inner.videoMessage.url }, caption: cap }).catch(() => {});
        else if (inner?.audioMessage)
          await sock.sendMessage(botOwnerJid, { audio: { url: inner.audioMessage.url }, mimetype: 'audio/mpeg', caption: cap }).catch(() => {});
      } catch (_) {}
    }

    // ── COOLDOWN CHECK — commands only, skip privileged ───────────────────
    if (isCmd && !isPrivileged) {
      const cmdName = body.slice(prefix.length).split(' ')[0].toLowerCase();
      if (isOnCooldown(sender, cmdName)) {
        await sock.sendMessage(from, {
          text:
            `╭━━━〔 ⏳ 𝑪𝑶𝑶𝑳𝑫𝑶𝑾𝑵 〕━━━╮\n` +
            `┃\n` +
            `┃  🔄 Command : .${cmdName}\n` +
            `┃  ⏱️ Wait    : 5 seconds\n` +
            `┃  🚀 Phir try karo!\n` +
            `┃\n` +
            `┃  👑 Owner:  Legend Sahil\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━╯`,
        }, { quoted: msg }).catch(() => {});
        return;
      }
    }

    // ── MESSAGE COUNTER ───────────────────────────────────────────────────
    incrementBotMessageCount(sessionId);

    // ── SMART REACT ───────────────────────────────────────────────────────
    if (body) {
      const reactEmoji = getSmartReact(body, prefix);
      await sock.sendMessage(from, {
        react: { text: reactEmoji, key: msg.key },
      }).catch(() => {});
    }

    // ── COMMAND HANDLER ───────────────────────────────────────────────────
    const handled = await handleCommand(sock, msg, sessionId, botMode, botOwnerJid);

    // ── CHATBOT + BUILT-IN FALLBACK ───────────────────────────────────────
    if (!handled) {

      // .mystats — user apni activity dekhe
      if (body.toLowerCase() === `${prefix}mystats`) {
        const stats = userActivity.get(sender);
        if (stats) {
          await sock.sendMessage(from, {
            text:
              `╭━━━〔 📊 𝑴𝒀 𝑺𝑻𝑨𝑻𝑺 〕━━━╮\n` +
              `┃\n` +
              `┃  👤 Name      : ${stats.firstName}\n` +
              `┃  💬 Total Msgs: ${stats.totalMsgs}\n` +
              `┃  ⚡ Commands  : ${stats.commandCount}\n` +
              `┃  🕐 Last Seen : ${stats.lastSeen}\n` +
              `┃  📅 Joined    : ${stats.joinedAt}\n` +
              `┃\n` +
              `┃  👑 Owner:  Legend Sahil\n` +
              `╰━━━━━━━━━━━━━━━━━━━━━━━╯`,
          }, { quoted: msg }).catch(() => {});
        }
        return;
      }

      // .ai query
      if (body.toLowerCase().startsWith(`${prefix}ai `)) {
        const query = body.slice(prefix.length + 3).trim();
        if (query) {
          await sock.sendMessage(from, {
            text:
              `╭━━━〔 🤖 𝑨𝑰 𝑨𝑺𝑺𝑰𝑺𝑻𝑨𝑵𝑻 〕━━━╮\n` +
              `┃\n` +
              `┃  🔍 Query : ${query.slice(0, 60)}\n` +
              `┃\n` +
              `┃  ⚡ AI Integration Coming Soon\n` +
              `┃  🚀 Stay Tuned For Next Update!\n` +
              `┃\n` +
              `┃  👑 Owner:  Legend Sahil\n` +
              `╰━━━━━━━━━━━━━━━━━━━━━━━╯`,
          }, { quoted: msg }).catch(() => {});
        }
        return;
      }

      // Chatbot auto-reply — only when .boton enabled
      const chatbotEnabled = config.chatbotSessions?.get(sessionId) === true;
      if (chatbotEnabled && body && !body.startsWith(prefix)) {
        const lower = body.toLowerCase().trim();

        const replies = [
          {
            match: ['hi', 'hello', 'hii', 'hey', 'salam', 'assalam', 'slm'],
            text:
              `╭━━━〔 👋 𝑾𝒆𝒍𝒄𝒐𝒎𝒆 〕━━━╮\n` +
              `┃\n` +
              `┃  Hello ${pushName}! 😊\n` +
              `┃  🤖 I am  Legend Sahil⚡\n` +
              `┃  📋 Type *${prefix}menu* to start!\n` +
              `┃\n` +
              `┃  👑 Owner:  Legend Sahil\n` +
              `╰━━━━━━━━━━━━━━━━━━━━━━━╯`,
          },
          {
            match: ['how are you', 'how r u', 'wassup', 'whats up', 'kya haal', 'kese ho'],
            text:
              `╭━━━〔 😎 𝑺𝒕𝒂𝒕𝒖𝒔 〕━━━╮\n` +
              `┃\n` +
              `┃  Doing Amazing! 🔥\n` +
              `┃  ⚡ Always Ready To Help!\n` +
              `┃  🚀 What can I do for you ${pushName}?\n` +
              `┃\n` +
              `┃  👑 Owner:  Legend Sahil\n` +
              `╰━━━━━━━━━━━━━━━━━━━━━━━╯`,
          },
          {
            match: ['your name', 'who are you', 'bot name', 'tera naam', 'kon ho'],
            text:
              `╭━━━〔 🤖 𝑩𝒐𝒕 𝑰𝒏𝒇𝒐 〕━━━╮\n` +
              `┃\n` +
              `┃  📛 Name    : Legend Sahil Bot\n` +
              `┃  👑 Owner   :  Legend Sahil\n` +
              `┃  ⚡ Version  : v${config.bot.version}\n` +
              `┃  🔢 Commands : 110+\n` +
              `┃  📋 Type *${prefix}menu* to start!\n` +
              `┃\n` +
              `╰━━━━━━━━━━━━━━━━━━━━━━━╯`,
          },
          {
            match: ['i love you', 'i luv you', 'love you', 'pyar', 'iloveyou'],
            text:
              `╭━━━〔 ❤️ 𝑳𝒐𝒗𝒆 〕━━━╮\n` +
              `┃\n` +
              `┃  Aww! Thank You ${pushName}! 😄\n` +
              `┃  🤖 But I am just a Bot 😅\n` +
              `┃  📋 Try *${prefix}menu* instead!\n` +
              `┃\n` +
              `┃  👑 Owner:  Legend Sahil\n` +
              `╰━━━━━━━━━━━━━━━━━━━━━━━╯`,
          },
          {
            match: ['thanks', 'thank you', 'ty', 'thx', 'shukriya', 'shukria'],
            text:
              `╭━━━〔 🙏 𝑾𝒆𝒍𝒄𝒐𝒎𝒆 〕━━━╮\n` +
              `┃\n` +
              `┃  ⚡ Always Here To Help!\n` +
              `┃  🌟 Have a Great Day ${pushName}! 😊\n` +
              `┃\n` +
              `┃  👑 Owner:  Legend Sahil\n` +
              `╰━━━━━━━━━━━━━━━━━━━━━━━╯`,
          },
          {
            match: ['bye', 'goodbye', 'see you', 'cya', 'khuda hafiz', 'alvida'],
            text:
              `╭━━━〔 👋 𝑮𝒐𝒐𝒅𝒃𝒚𝒆 〕━━━╮\n` +
              `┃\n` +
              `┃  🌟 Take Care ${pushName}!\n` +
              `┃  🤖 I will Be Here When You Return!\n` +
              `┃\n` +
              `┃  👑 Owner:  Legend Sahil \n` +
              `╰━━━━━━━━━━━━━━━━━━━━━━━╯`,
          },
          {
            match: ['good morning', 'morning', 'subah bakhair'],
            text:
              `╭━━━〔 🌅 𝑮𝒐𝒐𝒅 𝑴𝒐𝒓𝒏𝒊𝒏𝒈 〕━━━╮\n` +
              `┃\n` +
              `┃  ☀️ Good Morning ${pushName}!\n` +
              `┃  🌸 May your day be amazing!\n` +
              `┃  💪 Rise and shine! 🔥\n` +
              `┃\n` +
              `┃  👑 Owner:  Legend Sahil\n` +
              `╰━━━━━━━━━━━━━━━━━━━━━━━╯`,
          },
          {
            match: ['good night', 'goodnight', 'shab bakhair', 'so ja'],
            text:
              `╭━━━〔 🌙 𝑮𝒐𝒐𝒅 𝑵𝒊𝒈𝒉𝒕 〕━━━╮\n` +
              `┃\n` +
              `┃  🌙 Good Night ${pushName}!\n` +
              `┃  ⭐ Sweet dreams!\n` +
              `┃  😴 Rest well, tomorrow is a new day!\n` +
              `┃\n` +
              `┃  👑 Owner: Legend Sahil\n` +
              `╰━━━━━━━━━━━━━━━━━━━━━━━╯`,
          },
          {
            match: ['mashallah', 'masha allah', 'alhamdulillah', 'subhanallah'],
            text:
              `╭━━━〔 🕌 𝑴𝒂𝒔𝒉𝒂𝒍𝒍𝒂𝒉 〕━━━╮\n` +
              `┃\n` +
              `┃  🤲 Mashallah ${pushName}!\n` +
              `┃  📿 Allah bless you!\n` +
              `┃  🕋 Ameen!\n` +
              `┃\n` +
              `┃  👑 Owner: Legend Sahil \n` +
              `╰━━━━━━━━━━━━━━━━━━━━━━━╯`,
          },
        ];

        const matched = replies.find(r => r.match.some(w => lower.includes(w)));

        if (matched) {
          await sock.sendMessage(from, { text: matched.text }, { quoted: msg }).catch(() => {});
        } else {
          await sock.sendMessage(from, {
            text:
              `╭━━━〔 🤖 𝑭𝒐𝒖𝒄𝒆𝒔 𝑳𝒂𝒛𝒎𝒊 𝑩𝒐𝒕 〕━━━╮\n` +
              `┃\n` +
              `┃  💬 You Said:\n` +
              `┃  _"${body.slice(0, 60)}"_\n` +
              `┃\n` +
              `┃  📋 Use *${prefix}menu* to see\n` +
              `┃     all available commands!\n` +
              `┃\n` +
              `┃  👑 Owner: Legend Sahil\n` +
              `╰━━━━━━━━━━━━━━━━━━━━━━━╯`,
          }, { quoted: msg }).catch(() => {});
        }
      }
    }

  } catch (err) {
    logger.error(`[Session: ${sessionId}] Handler error: ${err.message}`);
    try {
      const errFrom = msg.key?.remoteJid;
      if (errFrom) {
        await sock.sendMessage(errFrom, {
          text:
            `╭━━━〔 ⚠️ 𝑬𝑹𝑹𝑶𝑹 〕━━━╮\n` +
            `┃\n` +
            `┃  😔 Kuch masla hua!\n` +
            `┃  🔄 Dobara try karo.\n` +
            `┃\n` +
            `┃  👑 Owner: Legend Sahil\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━╯`,
        }, { quoted: msg }).catch(() => {});
      }
    } catch (_) {}
  }
}

module.exports = { handleMessage };
      
