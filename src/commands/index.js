const config = require('../config/config');

// ─── BAILEYS ESM LAZY LOADER ──────────────────────────────────────────────────
// @whiskeysockets/baileys v6.7+ is pure ESM — require() crashes.
// Solution: lazy dynamic import(), cached after first call.
let _baileys = null;
async function getBaileys() {
  if (!_baileys) _baileys = await import('@whiskeysockets/baileys');
  return _baileys;
}
const NodeCache = require('node-cache');
const apiCache = new NodeCache({ stdTTL: 60, checkperiod: 30 }); // 60s cache for API results
const {
  isSuperAdmin, isBotOwner, formatBox, jidToNumber,
  formatUptime, getAllActiveBots, safeEval, getBotInstance,
} = require('../utils/helpers');
const {
  getWeather, getQuran, getQuranSurah, getPrayerTimes, getRandomDua, getRandomHadith,
  translateText, shortenUrl, getCryptoPrice, getTopCryptos, getCurrencyRates,
  getWikipedia, getDictionary, getNews, getSimInfo,
  downloadYouTubeMP3, getYouTubeInfo, downloadTikTok,
  getGithubUser, getNpmPackage, getIpInfo, getCovidStats,
  getOnlineJoke, getOnlineQuote, getAdvice, getCatFact, getDogFact,
  getCountryInfo, getMovieInfo, getProgrammingJoke, getRandomWord,
  getRiddle, getUselessFact, getNumberFact,
  calculateAge, calculateBMI, generatePassword,
  encodeBase64, decodeBase64, toBinary, fromBinary, toMorse, fromMorse,
  getColorInfo, getLoveMeter, getHoroscope, getZodiacSign,
  getWorldTime, getLyrics,
} = require('../apis/downloader');
const { setSessionMode, getAllSessions, getAllUsers } = require('../firebase/config');

const BOT_START_TIME = Date.now();

// ─── STATIC CONTENT ──────────────────────────────────────
const JOKES = [
  'Teacher: Why are you late?\nStudent: Because of the sign outside!\nTeacher: What sign?\nStudent: School Ahead, Go Slow! 😂',
  'Doctor: You need to rest.\nPatient: But doctor, I cannot afford it!\nDoctor: OK then go to work. 😆',
  'Wife: I changed my mind!\nHusband: Thank God! Does it work better now? 🤣',
  'Me: I will sleep early tonight.\nAlso me at 3 AM: watching random videos 😂',
  'Boss: We need to talk about your punctuality.\nEmployee: I agree, let us talk about it tomorrow. 😅',
  'Friend: You look different today.\nMe: I showered. 😂',
  'Me: I only need 5 minutes to get ready.\n*45 minutes later* — Still not ready. 😅',
];
const QUOTES = [
  '⚡ *"Success is not final, failure is not fatal."* — Churchill',
  '🔥 *"Dream big, work hard, stay focused."*',
  '💎 *"Your only limit is your mind."*',
  '🌟 *"The harder you work, the luckier you get."* — Gary Player',
  '🚀 *"Do not watch the clock; do what it does. Keep going."* — Sam Levenson',
  '💪 *"It always seems impossible until it is done."* — Nelson Mandela',
  '🌊 *"In the middle of every difficulty lies opportunity."* — Einstein',
  '🎯 *"The secret of getting ahead is getting started."* — Mark Twain',
];
const FACTS = [
  '🧠 Honey never spoils — 3000-year-old honey found in Egyptian tombs was still edible!',
  '🐙 Octopuses have three hearts and blue blood.',
  '⚡ Lightning strikes Earth about 100 times every second.',
  '🦈 Sharks are older than trees — they have existed for over 400 million years.',
  '🐘 Elephants are the only animals that cannot jump.',
  '🌊 The ocean produces over 50% of the world\'s oxygen.',
  '🦋 Butterflies taste with their feet.',
  '🌍 A day on Venus is longer than a year on Venus.',
  '🧊 Hot water freezes faster than cold water — this is called the Mpemba effect.',
  '🍌 Bananas are berries but strawberries are not.',
];
const SHAYARI = [
  '🌹 *True love is a form of worship*\nThat comes only from the heart\nNot from false words\nBut from sincere pain 💔',
  '✨ *Those who find true friends*\nAre truly fortunate\nFor in this world people meet\nBut true friends are rare 🤝',
  '🌙 *In the silence of the night*\nYour memory comes to me\nCalms my heart\nBut leaves my eyes tearful 💧',
  '🌸 *Life is too short*\nTo hold grudges and hate\nForgive and move forward\nThat is true strength 💪',
];
const PICKUP = [
  '😍 Are you a magician? Because whenever I look at you, everyone else disappears.',
  '💫 Do you have a map? I keep getting lost in your eyes.',
  '🌟 Are you WiFi? Because I feel a strong connection.',
  '🎵 Are you a song? Because you have been stuck in my head all day.',
  '☕ Are you coffee? Because you make my mornings worth waking up for.',
  '🌙 Are you the moon? Because even when I cannot see you, I know you exist.',
];
const ATTITUDE = [
  '👑 *People say do not show attitude.*\nI say wait until you see it! 😎',
  '🔥 *Only those who deserve it*\nAre in my life.\nThe rest got deleted! 💪',
  '💎 *My circle is small*\nBecause I value quality over quantity. 🙌',
  '🚀 *I did not change.*\nI just stopped pretending to be someone I am not. 😤',
];
const ROASTS = [
  'Your personality is like a Wi-Fi signal — looks connected but delivers nothing! 😂',
  'You are so boring even your selfie falls asleep! 💀',
  'Your IQ and your shoe size are suspiciously similar! 🤣',
  'I have seen better arguments in a kindergarten debate club. 😏',
  'You are like a cloud — when you disappear, it is a beautiful day! ☀️',
  'I would roast you harder but my mother told me not to burn garbage. 🔥',
];
const TRUTHS = [
  'What is something you have never told anyone? 🤔',
  'Do you currently have a secret crush? 😏',
  'When was the last time you cried? 💧',
  'What is your biggest regret? 😔',
  'Have you ever lied to get out of trouble? 🙈',
  'What is something you are afraid to admit? 😰',
];
const DARES = [
  'Send a voice note saying "I love you" to someone in this chat! 😂',
  'Change your WhatsApp status to something embarrassing for 1 hour! 😅',
  'Send a selfie right now with a funny face! 🤳',
  'Text your crush right now! 💌',
  'Do 20 push-ups and send proof! 💪',
  'Call someone and sing happy birthday even if it is not their birthday! 🎂',
];
const MEMES = [
  'Monday morning: "I will sleep early tonight."\nSame person at 3 AM: watching random videos 😂',
  'Me: I will eat healthy.\nFood: *smells amazing*\nMe: One cheat day will not hurt. 🍕😅',
  'Me studying 5 minutes before exam:\n*"I am ready."* 😂📚',
  'Teacher: The exam will be easy.\nThe exam: *Requires knowledge from 3 previous lives* 💀',
  'My brain at 3 AM: Hey, remember that embarrassing thing you did 10 years ago? 😭',
];
const COMPLIMENTS = [
  '🌟 You are absolutely amazing and do not let anyone tell you otherwise!',
  '💎 Your kindness and warmth make the world a better place.',
  '🔥 You have a brilliant mind and an even better heart.',
  '✨ The world is lucky to have someone as wonderful as you.',
  '💪 You are stronger than you think and braver than you believe!',
];
const GOODMORNING = [
  '🌅 *Good Morning!*\nMay your day be as bright as your smile!\nRise and shine, champion! ☀️',
  '🌸 *Good Morning!*\nEvery morning is a fresh start.\nMake today count! 💪',
  '☕ *Good Morning!*\nSip your coffee, take a deep breath\nand go conquer the world! 🌍',
];
const GOODNIGHT = [
  '🌙 *Good Night!*\nRest well, dream big.\nTomorrow is a new opportunity! ⭐',
  '💫 *Good Night!*\nClose your eyes and let the stars\nguide you to beautiful dreams! 🌟',
  '😴 *Good Night!*\nYou worked hard today.\nYou deserve the best sleep! 🛏️',
];

// ─── MENU BUILDER ─────────────────────────────────────────
function buildMenu() {
  const p = config.bot.prefix;
  return `╔═══〔 🤖 𝑺𝑨𝑯𝑰𝑳 𝟖𝟎𝟒 𝑩𝑶𝑻 〕═══╗
║ ⚡ 𝑭𝒂𝒔𝒕 • 𝑺𝒎𝒂𝒓𝒕 • 𝑷𝒐𝒘𝒆𝒓𝒇𝒖𝒍
║ 👑 𝑶𝒘𝒏𝒆𝒓: 𝑳𝒆𝒈𝒆𝒏𝒅 𝑺𝒂𝒉𝒊𝒍 𝑯𝒂𝒄𝒌𝒆𝒓 𝟖𝟎𝟒
║ 🔢 𝑻𝒐𝒕𝒂𝒍 𝑪𝒐𝒎𝒎𝒂𝒏𝒅𝒔: 𝟏𝟎𝟎+
║ 📢 Channel: https://whatsapp.com/channel/0029Vb7ufE7It5rzLqedDc3l
╚═══════════════════════════╝

╔═❖〔 𝑮𝑬𝑵𝑬𝑹𝑨𝑳 〕❖═╗
║ ${p}𝒎𝒆𝒏𝒖
║ ${p}𝒉𝒆𝒍𝒑
║ ${p}𝒑𝒊𝒏𝒈
║ ${p}𝒂𝒍𝒊𝒗𝒆
║ ${p}𝒐𝒏𝒍𝒊𝒏𝒆
║ ${p}𝒔𝒕𝒂𝒕𝒖𝒔
║ ${p}𝒐𝒘𝒏𝒆𝒓
║ ${p}𝒊𝒅
║ ${p}𝒖𝒑𝒕𝒊𝒎𝒆
╚══════════════════╝

╔═❖〔 𝑭𝑼𝑵 〕❖═╗
║ ${p}𝒋𝒐𝒌𝒆
║ ${p}𝒒𝒖𝒐𝒕𝒆
║ ${p}𝒇𝒂𝒄𝒕
║ ${p}𝒇𝒍𝒊𝒑
║ ${p}𝒅𝒊𝒄𝒆
║ ${p}𝒑𝒊𝒄𝒌𝒖𝒑
║ ${p}𝒔𝒉𝒂𝒚𝒂𝒓𝒊
║ ${p}𝒂𝒕𝒕𝒊𝒕𝒖𝒅𝒆
║ ${p}𝒎𝒆𝒎𝒆
║ ${p}𝒓𝒐𝒂𝒔𝒕
║ ${p}𝒕𝒓𝒖𝒕𝒉
║ ${p}𝒅𝒂𝒓𝒆
║ ${p}𝒄𝒐𝒎𝒑𝒍𝒊𝒎𝒆𝒏𝒕
║ ${p}𝒄𝒂𝒕𝒇𝒂𝒄𝒕
║ ${p}𝒅𝒐𝒈𝒇𝒂𝒄𝒕
║ ${p}𝒂𝒅𝒗𝒊𝒄𝒆
║ ${p}𝒓𝒊𝒅𝒅𝒍𝒆
║ ${p}𝒘𝒆𝒊𝒓𝒅𝒇𝒂𝒄𝒕
║ ${p}𝒈𝒎
║ ${p}𝒈𝒏
╚══════════════════╝

╔═❖〔 𝑮𝑨𝑴𝑬𝑺 〕❖═╗
║ ${p}𝒓𝒑𝒔
║ ${p}𝒅𝒊𝒄𝒆
║ ${p}𝒇𝒍𝒊𝒑
║ ${p}𝒕𝒓𝒊𝒗𝒊𝒂
║ ${p}𝒎𝒂𝒕𝒉
║ ${p}𝒏𝒖𝒎𝒃𝒆𝒓
║ ${p}𝒍𝒐𝒗𝒆
║ ${p}𝒘𝒐𝒓𝒅𝒈𝒆𝒏
║ ${p}𝒆𝒎𝒐𝒋𝒊
╚══════════════════╝

╔═❖〔 𝑻𝑶𝑶𝑳𝑺 〕❖═╗
║ ${p}𝒄𝒂𝒍𝒄
║ ${p}𝒕𝒓𝒂𝒏𝒔𝒍𝒂𝒕𝒆
║ ${p}𝒔𝒉𝒐𝒓𝒕
║ ${p}𝒘𝒊𝒌𝒊
║ ${p}𝒅𝒆𝒇𝒊𝒏𝒆
║ ${p}𝒔𝒚𝒏𝒐𝒏𝒚𝒎
║ ${p}𝒄𝒖𝒓𝒓𝒆𝒏𝒄𝒚
║ ${p}𝒘𝒆𝒂𝒕𝒉𝒆𝒓
║ ${p}𝒕𝒊𝒎𝒆
║ ${p}𝒔𝒊𝒎
║ ${p}𝒊𝒑
║ ${p}𝒇𝒂𝒏𝒄𝒚
║ ${p}𝒃𝒊𝒈
║ ${p}𝒉𝒐𝒘𝒕𝒐
╚══════════════════╝

╔═❖〔 𝑪𝑹𝒀𝑷𝑻𝑶 & 𝑭𝑰𝑵𝑨𝑵𝑪𝑬 〕❖═╗
║ ${p}𝒄𝒓𝒚𝒑𝒕𝒐
║ ${p}𝒕𝒐𝒑𝒄𝒓𝒚𝒑𝒕𝒐
║ ${p}𝒏𝒆𝒘𝒔
╚══════════════════╝

╔═❖〔 𝑰𝑺𝑳𝑨𝑴𝑰𝑪 〕❖═╗
║ ${p}𝒒𝒖𝒓𝒂𝒏
║ ${p}𝒔𝒖𝒓𝒂𝒉
║ ${p}𝒑𝒓𝒂𝒚𝒆𝒓
║ ${p}𝒅𝒖𝒂
║ ${p}𝒉𝒂𝒅𝒊𝒕𝒉
║ ${p}𝒉𝒊𝒋𝒓𝒊
╚══════════════════╝

╔═❖〔 𝑰𝑵𝑭𝑶 〕❖═╗
║ ${p}𝒄𝒐𝒖𝒏𝒕𝒓𝒚
║ ${p}𝒎𝒐𝒗𝒊𝒆
║ ${p}𝒈𝒊𝒕𝒉𝒖𝒃
║ ${p}𝒏𝒑𝒎
║ ${p}𝒄𝒐𝒗𝒊𝒅
║ ${p}𝒄𝒐𝒍𝒐𝒓
║ ${p}𝒏𝒖𝒎𝒇𝒂𝒄𝒕
╚══════════════════╝

╔═❖〔 𝑬𝑵𝑪𝑶𝑫𝑬 / 𝑫𝑬𝑪𝑶𝑫𝑬 〕❖═╗
║ ${p}𝒆𝒏𝒄𝒐𝒅𝒆𝟔𝟒
║ ${p}𝒅𝒆𝒄𝒐𝒅𝒆𝟔𝟒
║ ${p}𝒎𝒐𝒓𝒔𝒆
║ ${p}𝒖𝒏𝒎𝒐𝒓𝒔𝒆
║ ${p}𝒃𝒊𝒏𝒂𝒓𝒚
║ ${p}𝒖𝒏𝒃𝒊𝒏𝒂𝒓𝒚
╚══════════════════╝

╔═❖〔 𝑪𝑨𝑳𝑪𝑼𝑳𝑨𝑻𝑶𝑹𝑺 〕❖═╗
║ ${p}𝒂𝒈𝒆
║ ${p}𝒃𝒎𝒊
║ ${p}𝒑𝒂𝒔𝒔𝒘𝒐𝒓𝒅
╚══════════════════╝

╔═❖〔 𝑯𝑶𝑹𝑶𝑺𝑪𝑶𝑷𝑬 〕❖═╗
║ ${p}𝒉𝒐𝒓𝒐𝒔𝒄𝒐𝒑𝒆
║ ${p}𝒛𝒐𝒅𝒊𝒂𝒄
╚══════════════════╝

╔═❖〔 𝑫𝑬𝑽 𝑻𝑶𝑶𝑳𝑺 〕❖═╗
║ ${p}𝒅𝒆𝒗𝒋𝒐𝒌𝒆
║ ${p}𝒕𝒕𝒔
║ ${p}𝒔𝒕𝒊𝒄𝒌𝒆𝒓
║ ${p}𝒕𝒐𝒊𝒎𝒈
║ ${p}𝒓𝒆𝒗𝒆𝒓𝒔𝒆
║ ${p}𝒓𝒆𝒑𝒆𝒂𝒕
║ ${p}𝒖𝒑𝒑𝒆𝒓
║ ${p}𝒍𝒐𝒘𝒆𝒓
║ ${p}𝒔𝒑𝒆𝒆𝒅
║ ${p}𝒒𝒕
║ ${p}𝒃𝒐𝒕𝒊𝒏𝒇𝒐
╚══════════════════╝

╔═❖〔 ⚙️ 𝑺𝑬𝑻𝑻𝑰𝑵𝑮𝑺 〕❖═╗
║ ${p}𝒃𝒐𝒕𝒐𝒏
║ ${p}𝒃𝒐𝒕𝒐𝒇𝒇
║ ${p}𝒔𝒆𝒕𝒕𝒊𝒏𝒈𝒔
╚══════════════════╝

╔═❖〔 𝑫𝑶𝑾𝑵𝑳𝑶𝑨𝑫𝑺 〕❖═╗
║ ${p}𝒚𝒕𝒎𝒑𝟑
║ ${p}𝒚𝒕𝒊𝒏𝒇𝒐
║ ${p}𝒕𝒊𝒌𝒕𝒐𝒌
║ ${p}𝒍𝒚𝒓𝒊𝒄𝒔
╚══════════════════╝

╔═❖〔 𝑮𝑹𝑶𝑼𝑷 𝑨𝑫𝑴𝑰𝑵 〕❖═╗
║ ${p}𝒌𝒊𝒄𝒌
║ ${p}𝒂𝒅𝒅
║ ${p}𝒑𝒓𝒐𝒎𝒐𝒕𝒆
║ ${p}𝒅𝒆𝒎𝒐𝒕𝒆
║ ${p}𝒎𝒖𝒕𝒆
║ ${p}𝒖𝒏𝒎𝒖𝒕𝒆
║ ${p}𝒕𝒂𝒈𝒂𝒍𝒍
║ ${p}𝒈𝒓𝒐𝒖𝒑𝒊𝒏𝒇𝒐
║ ${p}𝒓𝒆𝒔𝒆𝒕𝒍𝒊𝒏𝒌
║ ${p}𝒑𝒐𝒍𝒍
║ ${p}𝒓𝒆𝒎𝒊𝒏𝒅
╚══════════════════╝

╔═❖〔 𝑩𝑶𝑻 〕❖═╗
║ ${p}𝒑𝒖𝒃𝒍𝒊𝒄
║ ${p}𝒑𝒓𝒊𝒗𝒂𝒕𝒆
║ ${p}𝒑𝒊𝒏𝒈
║ ${p}𝒂𝒍𝒊𝒗𝒆
║ ${p}𝒖𝒑𝒕𝒊𝒎𝒆
║ ${p}𝒐𝒘𝒏𝒆𝒓
║ ${p}𝒊𝒅
╚══════════════════╝

╔═❖〔 𝑺𝑼𝑷𝑬𝑹 𝑨𝑫𝑴𝑰𝑵 〕❖═╗
║ ${p}𝒔𝒕𝒂𝒕𝒔
║ ${p}𝒃𝒓𝒐𝒂𝒅𝒄𝒂𝒔𝒕
║ ${p}𝒖𝒔𝒆𝒓𝒔
║ ${p}𝒔𝒆𝒔𝒔𝒊𝒐𝒏𝒔
║ ${p}𝒎𝒆𝒎𝒐𝒓𝒚
║ ${p}𝒔𝒆𝒓𝒗𝒆𝒓𝒊𝒏𝒇𝒐
║ ${p}𝒔𝒂𝒚
╚══════════════════╝

〔 🚀 𝑷𝑶𝑾𝑬𝑹𝑬𝑫 𝑩𝒀 𝑺𝑨𝑯𝑰𝑳 𝑯𝑨𝑪𝑲𝑬𝑹 𝟖𝟎𝟒 〕
║ 📢 https://whatsapp.com/channel/0029Vb7ufE7It5rzLqedDc3l
╚════════════════════════════════╝`;
}
// ─── COMMAND HANDLER ─────────────────────────────────────
async function handleCommand(sock, msg, sessionId, botMode, botOwnerJid) {
  try {
    if (!msg.message) return false;

    const from    = msg.key.remoteJid;
    const sender  = msg.key.participant || msg.key.remoteJid;
    const isGroup = from.endsWith('@g.us');

    const body =
      msg.message?.conversation                   ||
      msg.message?.extendedTextMessage?.text       ||
      msg.message?.imageMessage?.caption           ||
      msg.message?.videoMessage?.caption           || '';

    const prefix = config.bot.prefix;
    if (!body.startsWith(prefix)) return false;

    const parts = body.slice(prefix.length).trim().split(/\s+/);
    const cmd   = parts[0].toLowerCase();
    const args  = parts.slice(1);
    const text  = args.join(' ').trim();

    const superAdmin = isSuperAdmin(sender);
    const authorized = superAdmin || isBotOwner(sender, botOwnerJid);

    const reply = async (txt) => {
      await sock.sendMessage(from, { text: txt }, { quoted: msg });
    };

    // ═══════════════════════════════════════════════
    // 1. MENU
    // ═══════════════════════════════════════════════
    if (['menu', 'help', 'cmd', 'commands'].includes(cmd)) {
      await sock.sendMessage(from, {
        image: { url: 'https://i.ibb.co/Vc2LHyqv/IMG-20260408-WA0014.jpg' },
        caption: buildMenu()
      }, { quoted: msg });
      await sock.sendMessage(from, {
        audio: { url: 'https://github.com/sahilhackerx110-byte/sahil-bot-master/raw/main/New%20Bot%20Song.mp3' },
        mimetype: 'audio/mpeg',
        ptt: false
      }, { quoted: msg });
      return true;
    }

    // ═══════════════════════════════════════════════
    // 2. PING
    // ═══════════════════════════════════════════════
    if (cmd === 'ping') {
      const ms = Math.abs(Date.now() - msg.messageTimestamp * 1000);
      await reply(`╔══════════════════╗\n║ ⚡ PING RESULT    ║\n╠══════════════════╣\n║ 🏓 Pong!\n║ ⏱️ Speed: ${ms}ms\n╚══════════════════╝`);
      return true;
    }

    // ═══════════════════════════════════════════════
    // 3. ALIVE / ONLINE / STATUS
    // ═══════════════════════════════════════════════
    if (['alive', 'online', 'status'].includes(cmd)) {
      const uptime = formatUptime(Date.now() - BOT_START_TIME);
      await reply(
        `╔══════════════════════════════╗\n` +
        `║  🤖 SAHIL 804 BOT ONLINE     ║\n` +
        `╠══════════════════════════════╣\n` +
        `║ ✅ Running perfectly!\n` +
        `║ 🌐 Mode: ${botMode.toUpperCase()}\n` +
        `║ 👑 Owner: Sahil Hacker 804\n` +
        `║ 📋 Version: v${config.bot.version}\n` +
        `║ ⏱️ Uptime: ${uptime}\n` +
        `║ 🔢 Commands: 100\n` +
        `╚══════════════════════════════╝`
      );
      return true;
    }

    // ═══════════════════════════════════════════════
    // 4. UPTIME
    // ═══════════════════════════════════════════════
    if (cmd === 'uptime') {
      const uptime = formatUptime(Date.now() - BOT_START_TIME);
      await reply(`⏱️ *Bot Uptime:* ${uptime}\n📋 *Version:* v${config.bot.version}\n🔢 *Commands:* 100`);
      return true;
    }

    // ═══════════════════════════════════════════════
    // 5. OWNER
    // ═══════════════════════════════════════════════
    if (cmd === 'owner') {
      await reply(
        `╔══════════════════════════════╗\n` +
        `║  👑 BOT OWNER INFO           ║\n` +
        `╠══════════════════════════════╣\n` +
        `║ 📛 Name: Sahil Hacker 804\n` +
        `║ 📞 WA: wa.me/${config.owner.number}\n` +
        `║ 📧 Email: ${config.owner.email}\n` +
        `║ 📢 Channel: ${config.owner.channel}\n` +
        `╚══════════════════════════════╝`
      );
      return true;
    }

    // ═══════════════════════════════════════════════
    // 6. ID
    // ═══════════════════════════════════════════════
    if (cmd === 'id') {
      await reply(`╔══════════════════╗\n║ 🆔 YOUR JID       ║\n╠══════════════════╣\n║ ${sender}\n╚══════════════════╝`);
      return true;
    }

    // ═══════════════════════════════════════════════
    // 7. PRIVATE MODE
    // ═══════════════════════════════════════════════
    if (cmd === 'private') {
      if (!authorized) return reply('❌ Only Bot Owner can change mode.');
      await setSessionMode(sessionId, 'private');
      await reply(`╔══════════════════════════╗\n║ 🔒 PRIVATE MODE ON        ║\n╠══════════════════════════╣\n║ ✅ Only YOU can use your bot now.\n║ 🌐 To go public: Type ${prefix}public\n╚══════════════════════════╝`);
      return true;
    }

    // ═══════════════════════════════════════════════
    // 8. PUBLIC MODE
    // ═══════════════════════════════════════════════
    if (cmd === 'public') {
      if (!authorized) return reply('❌ Only Bot Owner can change mode.');
      await setSessionMode(sessionId, 'public');
      await reply(`╔══════════════════════════╗\n║ 🌐 PUBLIC MODE ON         ║\n╠══════════════════════════╣\n║ ✅ Everyone can use your bot now.\n║ 🔒 To go private: Type ${prefix}private\n╚══════════════════════════╝`);
      return true;
    }

    // ═══════════════════════════════════════════════
    // 9. JOKE (offline)
    // ═══════════════════════════════════════════════
    if (cmd === 'joke') {
      const j = await getOnlineJoke();
      await reply(j || JOKES[Math.floor(Math.random() * JOKES.length)]);
      return true;
    }

    // ═══════════════════════════════════════════════
    // 10. QUOTE (offline + online)
    // ═══════════════════════════════════════════════
    if (cmd === 'quote') {
      const q = await getOnlineQuote();
      await reply(q ? `💬 *"${q.text}"*\n\n— ${q.author}` : QUOTES[Math.floor(Math.random() * QUOTES.length)]);
      return true;
    }

    // ═══════════════════════════════════════════════
    // 11. FACT
    // ═══════════════════════════════════════════════
    if (cmd === 'fact') {
      await reply(FACTS[Math.floor(Math.random() * FACTS.length)]);
      return true;
    }

    // ═══════════════════════════════════════════════
    // 12. SHAYARI
    // ═══════════════════════════════════════════════
    if (cmd === 'shayari') {
      await reply(SHAYARI[Math.floor(Math.random() * SHAYARI.length)]);
      return true;
    }

    // ═══════════════════════════════════════════════
    // 13. ATTITUDE
    // ═══════════════════════════════════════════════
    if (cmd === 'attitude') {
      await reply(ATTITUDE[Math.floor(Math.random() * ATTITUDE.length)]);
      return true;
    }

    // ═══════════════════════════════════════════════
    // 14. PICKUP
    // ═══════════════════════════════════════════════
    if (cmd === 'pickup') {
      await reply(PICKUP[Math.floor(Math.random() * PICKUP.length)]);
      return true;
    }

    // ═══════════════════════════════════════════════
    // 15. MEME
    // ═══════════════════════════════════════════════
    if (cmd === 'meme') {
      await reply(MEMES[Math.floor(Math.random() * MEMES.length)]);
      return true;
    }

    // ═══════════════════════════════════════════════
    // 16. TRUTH
    // ═══════════════════════════════════════════════
    if (cmd === 'truth') {
      await reply(`❓ *Truth Question:*\n\n${TRUTHS[Math.floor(Math.random() * TRUTHS.length)]}`);
      return true;
    }

    // ═══════════════════════════════════════════════
    // 17. DARE
    // ═══════════════════════════════════════════════
    if (cmd === 'dare') {
      await reply(`🎯 *Dare Challenge:*\n\n${DARES[Math.floor(Math.random() * DARES.length)]}`);
      return true;
    }

    // ═══════════════════════════════════════════════
    // 18. ROAST
    // ═══════════════════════════════════════════════
    if (cmd === 'roast') {
      await reply(ROASTS[Math.floor(Math.random() * ROASTS.length)]);
      return true;
    }

    // ═══════════════════════════════════════════════
    // 19. COMPLIMENT
    // ═══════════════════════════════════════════════
    if (cmd === 'compliment') {
      await reply(COMPLIMENTS[Math.floor(Math.random() * COMPLIMENTS.length)]);
      return true;
    }

    // ═══════════════════════════════════════════════
    // 20. GOOD MORNING
    // ═══════════════════════════════════════════════
    if (['gm', 'goodmorning', 'morning'].includes(cmd)) {
      await reply(GOODMORNING[Math.floor(Math.random() * GOODMORNING.length)]);
      return true;
    }

    // ═══════════════════════════════════════════════
    // 21. GOOD NIGHT
    // ═══════════════════════════════════════════════
    if (['gn', 'goodnight', 'night'].includes(cmd)) {
      await reply(GOODNIGHT[Math.floor(Math.random() * GOODNIGHT.length)]);
      return true;
    }

    // ═══════════════════════════════════════════════
    // 22. CAT FACT
    // ═══════════════════════════════════════════════
    if (cmd === 'catfact') {
      const f = await getCatFact();
      await reply(f ? `🐱 *Cat Fact:*\n\n${f}` : '❌ Could not fetch cat fact right now.');
      return true;
    }

    // ═══════════════════════════════════════════════
    // 23. DOG FACT
    // ═══════════════════════════════════════════════
    if (cmd === 'dogfact') {
      const f = await getDogFact();
      await reply(f ? `🐶 *Dog Fact:*\n\n${f}` : '❌ Could not fetch dog fact right now.');
      return true;
    }

    // ═══════════════════════════════════════════════
    // 24. ADVICE
    // ═══════════════════════════════════════════════
    if (cmd === 'advice') {
      const a = await getAdvice();
      await reply(a ? `💡 *Advice of the Day:*\n\n${a}` : '❌ Could not fetch advice right now.');
      return true;
    }

    // ═══════════════════════════════════════════════
    // 25. RIDDLE
    // ═══════════════════════════════════════════════
    if (cmd === 'riddle') {
      const r = await getRiddle();
      await reply(r ? `🎭 *Riddle:*\n\n${r.question}\n\n||Answer: ${r.answer}||` : '❌ Could not fetch riddle.');
      return true;
    }

    // ═══════════════════════════════════════════════
    // 26. WEIRD FACT
    // ═══════════════════════════════════════════════
    if (['weirdfact', 'ufact', 'useless'].includes(cmd)) {
      const f = await getUselessFact();
      await reply(f ? `🤯 *Weird Fact:*\n\n${f}` : '❌ Could not fetch fact.');
      return true;
    }

    // ═══════════════════════════════════════════════
    // 27. DEV JOKE
    // ═══════════════════════════════════════════════
    if (cmd === 'devjoke') {
      const j = await getProgrammingJoke();
      await reply(j ? `💻 *Programming Joke:*\n\n${j}` : '❌ Could not fetch joke.');
      return true;
    }

    // ═══════════════════════════════════════════════
    // 28. COIN FLIP
    // ═══════════════════════════════════════════════
    if (cmd === 'flip') {
      await reply(`🪙 *Coin Flip Result:*\n\n${Math.random() < 0.5 ? 'HEADS 👑' : 'TAILS 🦅'}`);
      return true;
    }

    // ═══════════════════════════════════════════════
    // 29. DICE
    // ═══════════════════════════════════════════════
    if (cmd === 'dice') {
      const max = Math.min(Math.max(parseInt(args[0]) || 6, 2), 100);
      await reply(`🎲 You rolled: *${Math.floor(Math.random() * max) + 1}* out of ${max}`);
      return true;
    }

    // ═══════════════════════════════════════════════
    // 30. ROCK PAPER SCISSORS
    // ═══════════════════════════════════════════════
    if (cmd === 'rps') {
      const choices = ['rock', 'paper', 'scissors'];
      const bot     = choices[Math.floor(Math.random() * 3)];
      const user    = text.toLowerCase();
      if (!choices.includes(user)) return reply(`❌ Usage: ${prefix}rps rock | paper | scissors`);
      let result = '🤝 Draw!';
      if ((user === 'rock' && bot === 'scissors') || (user === 'paper' && bot === 'rock') || (user === 'scissors' && bot === 'paper')) result = '🏆 You Win!';
      else if (user !== bot) result = '😢 Bot Wins!';
      await reply(`✊ You: *${user}*\n🤖 Bot: *${bot}*\n\n${result}`);
      return true;
    }

    // ═══════════════════════════════════════════════
    // 31. TRIVIA
    // ═══════════════════════════════════════════════
    if (cmd === 'trivia') {
      const trivias = [
        { q: 'What is the capital of Pakistan?',            a: 'Islamabad 🇵🇰' },
        { q: 'How many planets are in our solar system?',   a: '8 Planets 🪐' },
        { q: 'What language has the most native speakers?', a: 'Mandarin Chinese 🇨🇳' },
        { q: 'What is the largest ocean on Earth?',         a: 'Pacific Ocean 🌊' },
        { q: 'How many bones are in the human body?',       a: '206 Bones 🦴' },
        { q: 'What is the speed of light?',                 a: '299,792,458 m/s ⚡' },
        { q: 'Which planet is closest to the Sun?',         a: 'Mercury ☿' },
        { q: 'How many continents are on Earth?',           a: '7 Continents 🌍' },
        { q: 'Who invented the telephone?',                 a: 'Alexander Graham Bell 📞' },
        { q: 'What is the largest country in the world?',   a: 'Russia 🇷🇺' },
        { q: 'What is the smallest country in the world?',  a: 'Vatican City 🇻🇦' },
        { q: 'How many sides does a hexagon have?',         a: '6 Sides 🔷' },
      ];
      const t = trivias[Math.floor(Math.random() * trivias.length)];
      await reply(`❓ *Trivia Question:*\n\n${t.q}\n\n✅ *Answer:* ${t.a}`);
      return true;
    }

    // ═══════════════════════════════════════════════
    // 32. MATH QUIZ
    // ═══════════════════════════════════════════════
    if (cmd === 'math') {
      const a   = Math.floor(Math.random() * 50) + 1;
      const b   = Math.floor(Math.random() * 50) + 1;
      const ops = [{ sym: '+', ans: a + b }, { sym: '-', ans: a - b }, { sym: '×', ans: a * b }];
      const op  = ops[Math.floor(Math.random() * ops.length)];
      await reply(`🧮 *Math Challenge:*\n\nWhat is *${a} ${op.sym} ${b}*?\n\n✅ Answer: *${op.ans}*`);
      return true;
    }

    // ═══════════════════════════════════════════════
    // 33. NUMBER GUESS GAME
    // ═══════════════════════════════════════════════
    if (cmd === 'number') {
      const secret = Math.floor(Math.random() * 10) + 1;
      const guess  = parseInt(text);
      if (!text) return reply(`🃏 *Number Game:*\n\nGuess a number between 1-10!\nUsage: ${prefix}number <1-10>`);
      if (isNaN(guess) || guess < 1 || guess > 10) return reply('❌ Enter a number between 1 and 10!');
      if (guess === secret) {
        await reply(`🎉 *CORRECT!* The number was *${secret}*!\nYou are a genius! 🧠`);
      } else {
        await reply(`❌ *Wrong!* The number was *${secret}*.\nBetter luck next time! 😅`);
      }
      return true;
    }

    // ═══════════════════════════════════════════════
    // 34. LOVE METER
    // ═══════════════════════════════════════════════
    if (['love', 'lovemeter', 'ship'].includes(cmd)) {
      const names = text.split(/\s+and\s+|\s*&\s*|\s*\+\s*/i);
      if (names.length < 2 || !names[1]) return reply(`❌ Usage: ${prefix}love <name1> & <name2>`);
      const result = getLoveMeter(names[0], names[1]);
      const bar    = '█'.repeat(Math.floor(result.percent / 10)) + '░'.repeat(10 - Math.floor(result.percent / 10));
      await reply(
        `╔══════════════════════╗\n` +
        `║ 💕 LOVE METER         ║\n` +
        `╠══════════════════════╣\n` +
        `║ 👤 ${names[0].trim()}\n` +
        `║ 💖 + ${names[1].trim()}\n` +
        `║\n` +
        `║ [${bar}] ${result.percent}%\n` +
        `║\n` +
        `║ ${result.emoji}\n` +
        `╚══════════════════════╝`
      );
      return true;
    }

    // ═══════════════════════════════════════════════
    // 35. WORD GENERATOR
    // ═══════════════════════════════════════════════
    if (['wordgen', 'randomword'].includes(cmd)) {
      const w = await getRandomWord();
      await reply(w ? `🔡 *Random Word:*\n\n*${w.toUpperCase()}*\n\nUse ${prefix}define ${w} to get the meaning!` : '❌ Could not generate word.');
      return true;
    }

    // ═══════════════════════════════════════════════
    // 36. CALCULATOR
    // ═══════════════════════════════════════════════
    if (['calc', 'calculator', 'math-calc'].includes(cmd)) {
      if (!text) return reply(`❌ Usage: ${prefix}calc 5+5*2`);
      const result = safeEval(text);
      if (result === null) return reply('❌ Invalid expression! Use numbers and operators like: + - * / ()');
      await reply(`╔══════════════════╗\n║ 🔢 CALCULATOR     ║\n╠══════════════════╣\n║ 📝 ${text}\n║ ✅ = ${result}\n╚══════════════════╝`);
      return true;
    }

    // ═══════════════════════════════════════════════
    // 37. TRANSLATE
    // ═══════════════════════════════════════════════
    if (cmd === 'translate') {
      if (!text) return reply(`❌ Usage: ${prefix}translate <text>\n💡 Specific language: ${prefix}translate fr Hello`);
      await reply('⏳ Translating...');
      const [src, ...rest] = text.split(' ');
      let targetLang = 'en', query = text;
      if (/^[a-z]{2,3}$/.test(src) && rest.length) { targetLang = src; query = rest.join(' '); }
      const result = await translateText(query, targetLang);
      await reply(result
        ? `╔══════════════════╗\n║ 🌍 TRANSLATED     ║\n╠══════════════════╣\n║ 🔤 Original: ${query}\n║ ✅ Result: ${result}\n╚══════════════════╝`
        : '❌ Translation failed. Try again.');
      return true;
    }

    // ═══════════════════════════════════════════════
    // 38. URL SHORTENER
    // ═══════════════════════════════════════════════
    if (cmd === 'short') {
      if (!text) return reply(`❌ Usage: ${prefix}short <url>`);
      const short = await shortenUrl(text);
      await reply(short ? `🔗 *Short URL:*\n\n${short}` : '❌ Failed to shorten URL. Make sure it is a valid URL.');
      return true;
    }

    // ═══════════════════════════════════════════════
    // 39. WIKIPEDIA
    // ═══════════════════════════════════════════════
    if (cmd === 'wiki') {
      if (!text) return reply(`❌ Usage: ${prefix}wiki <query>`);
      await reply('🔍 Searching Wikipedia...');
      const result = await getWikipedia(text);
      await reply(result
        ? `╔══════════════════════╗\n║ 📖 ${result.title}\n╠══════════════════════╣\n${result.summary}\n\n🔗 ${result.url}\n╚══════════════════════╝`
        : '❌ Not found on Wikipedia.');
      return true;
    }

    // ═══════════════════════════════════════════════
    // 40. DICTIONARY / DEFINE
    // ═══════════════════════════════════════════════
    if (cmd === 'define') {
      if (!text) return reply(`❌ Usage: ${prefix}define <word>`);
      const result = await getDictionary(text);
      await reply(result
        ? `📝 *${result.word}* /${result.phonetic}/\n🏷️ *${result.partOfSpeech}*\n\n📖 *Meaning:* ${result.meaning}\n💬 *Example:* ${result.example || 'N/A'}\n🔤 *Synonyms:* ${result.synonyms}`
        : '❌ Word not found. Check spelling and try again.');
      return true;
    }

    // ═══════════════════════════════════════════════
    // 41. SYNONYM
    // ═══════════════════════════════════════════════
    if (cmd === 'synonym') {
      if (!text) return reply(`❌ Usage: ${prefix}synonym <word>`);
      const result = await getDictionary(text);
      if (!result) return reply('❌ Word not found.');
      await reply(`🔤 *Synonyms for "${result.word}":*\n\n${result.synonyms || 'No synonyms found.'}`);
      return true;
    }

    // ═══════════════════════════════════════════════
    // 42. WEATHER
    // ═══════════════════════════════════════════════
    if (cmd === 'weather') {
      if (!text) return reply(`❌ Usage: ${prefix}weather <city>`);
      const w = await getWeather(text);
      await reply(w
        ? `╔══════════════════════╗\n║ 🌤️ WEATHER: ${text.toUpperCase()}\n╠══════════════════════╣\n║ 🌡️ Temp: ${w.temp}°C (Feels ${w.feels}°C)\n║ 🌥️ ${w.desc}\n║ 💧 Humidity: ${w.humidity}%\n║ 💨 Wind: ${w.wind} km/h\n║ 👁️ Visibility: ${w.visibility} km\n║ ☀️ UV Index: ${w.uvIndex}\n╚══════════════════════╝`
        : '❌ City not found. Try: Karachi, London, Dubai');
      return true;
    }

    // ═══════════════════════════════════════════════
    // 43. WORLD TIME
    // ═══════════════════════════════════════════════
    if (cmd === 'time') {
      if (!text) return reply(`❌ Usage: ${prefix}time <timezone>\n💡 Examples: Asia/Karachi, America/New_York, Europe/London`);
      const t = await getWorldTime(text);
      await reply(t
        ? `╔══════════════════════╗\n║ ⏰ WORLD TIME         ║\n╠══════════════════════╣\n║ 🌍 Zone: ${t.timezone}\n║ 🕐 Time: ${t.datetime}\n║ ⏱️ UTC: ${t.utcOffset}\n╚══════════════════════╝`
        : '❌ Invalid timezone. Example: Asia/Karachi');
      return true;
    }

    // ═══════════════════════════════════════════════
    // 44. CRYPTO PRICE
    // ═══════════════════════════════════════════════
    if (cmd === 'crypto') {
      if (!text) return reply(`❌ Usage: ${prefix}crypto bitcoin\n💡 Examples: bitcoin, ethereum, solana`);
      const coinKey = text.toLowerCase().replace(/\s+/g, '-');
      const cached = apiCache.get(`crypto_${coinKey}`);
      const result = cached || await getCryptoPrice(coinKey);
      if (result && !cached) apiCache.set(`crypto_${coinKey}`, result);
      await reply(result
        ? `╔══════════════════╗\n║ 💹 CRYPTO PRICE  ║\n╠══════════════════╣\n║ 🪙 ${text.toUpperCase()}\n║ 💵 USD: $${result.usd?.toLocaleString()}\n║ 🇵🇰 PKR: ₨${result.pkr?.toLocaleString()}\n║ 📊 24h: ${result.change24h}%\n╚══════════════════╝`
        : '❌ Coin not found. Try: bitcoin, ethereum, solana');
      return true;
    }

    // ═══════════════════════════════════════════════
    // 45. TOP 10 CRYPTOS
    // ═══════════════════════════════════════════════
    if (cmd === 'topcrypto') {
      await reply('⏳ Fetching top cryptos...');
      const list = await getTopCryptos();
      if (!list) return reply('❌ Could not fetch crypto data.');
      const formatted = list.map((c, i) =>
        `${i + 1}. *${c.name}* (${c.symbol})\n   💵 $${c.price?.toLocaleString()} | 📊 ${c.change}%`
      ).join('\n\n');
      await reply(`╔══════════════════════╗\n║ 📊 TOP 10 CRYPTOS    ║\n╠══════════════════════╣\n${formatted}\n╚══════════════════════╝`);
      return true;
    }

    // ═══════════════════════════════════════════════
    // 46. CURRENCY CONVERTER
    // ═══════════════════════════════════════════════
    if (cmd === 'currency') {
      const [amount, from2, to2] = args;
      if (!amount || !from2 || !to2) return reply(`❌ Usage: ${prefix}currency 100 USD PKR`);
      const rates  = await getCurrencyRates(from2.toUpperCase());
      if (!rates) return reply('❌ Failed to fetch exchange rates.');
      const toRate = rates[to2.toUpperCase()];
      if (!toRate) return reply(`❌ Invalid currency: ${to2.toUpperCase()}`);
      const converted = (parseFloat(amount) * toRate).toFixed(2);
      await reply(`╔══════════════════╗\n║ 💱 CURRENCY       ║\n╠══════════════════╣\n║ 💰 ${amount} ${from2.toUpperCase()}\n║ = ${converted} ${to2.toUpperCase()}\n╚══════════════════╝`);
      return true;
    }

    // ═══════════════════════════════════════════════
    // 47. NEWS
    // ═══════════════════════════════════════════════
    if (cmd === 'news') {
      const articles = await getNews();
      if (!articles.length) return reply('❌ Failed to fetch news. Try again later.');
      const formatted = articles.map((a, i) => `${i + 1}. *${a.title}*`).join('\n\n');
      await reply(`╔══════════════════════╗\n║ 📰 LATEST NEWS        ║\n╠══════════════════════╣\n${formatted}\n╚══════════════════════╝`);
      return true;
    }

    // ═══════════════════════════════════════════════
    // 48. SIM INFO
    // ═══════════════════════════════════════════════
    if (cmd === 'sim') {
      if (!text) return reply(`❌ Usage: ${prefix}sim 03001234567`);
      await reply('🔍 Searching SIM database...');
      const result = await getSimInfo(text);
      await reply(result
        ? `╔══════════════════╗\n║ 📱 SIM INFO       ║\n╠══════════════════╣\n${JSON.stringify(result, null, 2).slice(0, 600)}\n╚══════════════════╝`
        : '❌ No record found for this number.');
      return true;
    }

    // ═══════════════════════════════════════════════
    // 49. IP INFO
    // ═══════════════════════════════════════════════
    if (cmd === 'ip') {
      if (!text) return reply(`❌ Usage: ${prefix}ip <ip address>`);
      await reply('🔍 Looking up IP...');
      const result = await getIpInfo(text);
      await reply(result
        ? `╔══════════════════════╗\n║ 🌐 IP INFO            ║\n╠══════════════════════╣\n║ 🌍 IP: ${result.ip}\n║ 🏙️ City: ${result.city}\n║ 📍 Region: ${result.region}\n║ 🌏 Country: ${result.country}\n║ 🏢 ISP: ${result.org}\n║ ⏰ Timezone: ${result.timezone}\n╚══════════════════════╝`
        : '❌ Invalid IP address or not found.');
      return true;
    }

    // ═══════════════════════════════════════════════
    // 50. COUNTRY INFO
    // ═══════════════════════════════════════════════
    if (cmd === 'country') {
      if (!text) return reply(`❌ Usage: ${prefix}country <name>`);
      const c = await getCountryInfo(text);
      await reply(c
        ? `╔══════════════════════╗\n║ 🌍 ${c.flag} ${c.name}\n╠══════════════════════╣\n║ 🏛️ Capital: ${c.capital}\n║ 👥 Population: ${c.population}\n║ 🌎 Region: ${c.region}\n║ 💰 Currency: ${c.currency}\n║ 🗣️ Languages: ${c.languages}\n╚══════════════════════╝`
        : '❌ Country not found. Try full name like: Pakistan, France');
      return true;
    }

    // ═══════════════════════════════════════════════
    // 51. MOVIE INFO
    // ═══════════════════════════════════════════════
    if (cmd === 'movie') {
      if (!text) return reply(`❌ Usage: ${prefix}movie <title>`);
      await reply('🎬 Searching movie...');
      const m = await getMovieInfo(text);
      await reply(m
        ? `╔══════════════════════╗\n║ 🎬 ${m.title} (${m.year})\n╠══════════════════════╣\n║ 🎭 Genre: ${m.genre}\n║ 🎥 Director: ${m.director}\n║ ⭐ IMDB: ${m.rating}/10\n║ ⏱️ Runtime: ${m.runtime}\n║\n║ 📖 ${m.plot}\n╚══════════════════════╝`
        : '❌ Movie not found. Try exact title like: Inception');
      return true;
    }

    // ═══════════════════════════════════════════════
    // 52. GITHUB USER
    // ═══════════════════════════════════════════════
    if (cmd === 'github') {
      if (!text) return reply(`❌ Usage: ${prefix}github <username>`);
      await reply('🐙 Fetching GitHub profile...');
      const g = await getGithubUser(text);
      await reply(g
        ? `╔══════════════════════╗\n║ 🐙 GITHUB PROFILE    ║\n╠══════════════════════╣\n║ 👤 ${g.name} (@${g.login})\n║ 📝 ${g.bio}\n║ 📦 Repos: ${g.repos}\n║ 👥 Followers: ${g.followers}\n║ 🌍 ${g.location}\n║ 🔗 ${g.url}\n╚══════════════════════╝`
        : '❌ GitHub user not found.');
      return true;
    }

    // ═══════════════════════════════════════════════
    // 53. NPM PACKAGE INFO
    // ═══════════════════════════════════════════════
    if (cmd === 'npm') {
      if (!text) return reply(`❌ Usage: ${prefix}npm <package-name>`);
      await reply('📦 Fetching package info...');
      const p = await getNpmPackage(text);
      await reply(p
        ? `╔══════════════════════╗\n║ 📦 NPM PACKAGE        ║\n╠══════════════════════╣\n║ 📛 ${p.name}@${p.version}\n║ 📝 ${p.description}\n║ 👤 Author: ${p.author}\n║ 📄 License: ${p.license}\n╚══════════════════════╝`
        : '❌ Package not found on NPM.');
      return true;
    }

    // ═══════════════════════════════════════════════
    // 54. COVID STATS
    // ═══════════════════════════════════════════════
    if (cmd === 'covid') {
      const country = text || 'Pakistan';
      await reply('🦠 Fetching COVID stats...');
      const c = await getCovidStats(country);
      await reply(c
        ? `╔══════════════════════╗\n║ 🦠 COVID-19: ${c.country}\n╠══════════════════════╣\n║ 😷 Total Cases: ${c.cases}\n║ 💀 Deaths: ${c.deaths}\n║ ✅ Recovered: ${c.recovered}\n║ 🔴 Active: ${c.active}\n║ 📅 Today: +${c.todayCases}\n╚══════════════════════╝`
        : '❌ Country not found.');
      return true;
    }

    // ═══════════════════════════════════════════════
    // 55. COLOR INFO
    // ═══════════════════════════════════════════════
    if (cmd === 'color') {
      if (!text) return reply(`❌ Usage: ${prefix}color #FF5733`);
      const hex = text.replace('#', '');
      if (!/^[0-9A-Fa-f]{6}$/.test(hex)) return reply('❌ Invalid hex color. Example: #FF5733');
      const c = await getColorInfo(hex);
      await reply(c
        ? `╔══════════════════════╗\n║ 🎨 COLOR INFO         ║\n╠══════════════════════╣\n║ 🎨 Name: ${c.name}\n║ 🔷 HEX: ${c.hex}\n║ 🔴 RGB: ${c.rgb}\n║ 🌈 HSL: ${c.hsl}\n╚══════════════════════╝`
        : '❌ Could not fetch color info.');
      return true;
    }
    
    // ═══════════════════════════════════════════════
    // 56. NUMBER FACT
    // ═══════════════════════════════════════════════
    if (cmd === 'numfact') {
      if (!text || isNaN(text)) return reply(`❌ Usage: ${prefix}numfact <number>`);
      const f = await getNumberFact(text);
      await reply(f ? `🔢 *Fact about ${text}:*\n\n${f}` : '❌ Could not fetch fact.');
      return true;
    }

    // ═══════════════════════════════════════════════
    // 57. AGE CALCULATOR
    // ═══════════════════════════════════════════════
    if (cmd === 'age') {
      if (!text) return reply(`❌ Usage: ${prefix}age <YYYY-MM-DD>\n💡 Example: ${prefix}age 2000-04-15`);
      const result = calculateAge(text);
      if (!result) return reply('❌ Invalid date format. Use: YYYY-MM-DD');
      await reply(
        `╔══════════════════════╗\n` +
        `║ 🎂 AGE CALCULATOR     ║\n` +
        `╠══════════════════════╣\n` +
        `║ 📅 Birthday: ${text}\n` +
        `║ 🎉 Age: ${result.years} years, ${result.months} months, ${result.days} days\n` +
        `║ 📊 Total Days: ${result.totalDays.toLocaleString()} days\n` +
        `╚══════════════════════╝`
      );
      return true;
    }

    // ═══════════════════════════════════════════════
    // 58. BMI CALCULATOR
    // ═══════════════════════════════════════════════
    if (cmd === 'bmi') {
      const [weight, height] = args;
      if (!weight || !height) return reply(`❌ Usage: ${prefix}bmi <weight_kg> <height_cm>\n💡 Example: ${prefix}bmi 70 175`);
      const result = calculateBMI(parseFloat(weight), parseFloat(height));
      await reply(
        `╔══════════════════════╗\n` +
        `║ ⚖️ BMI CALCULATOR      ║\n` +
        `╠══════════════════════╣\n` +
        `║ ⚖️ Weight: ${weight} kg\n` +
        `║ 📏 Height: ${height} cm\n` +
        `║ 📊 BMI: ${result.bmi}\n` +
        `║ 🏷️ Status: ${result.category}\n` +
        `╚══════════════════════╝`
      );
      return true;
    }

    // ═══════════════════════════════════════════════
    // 59. PASSWORD GENERATOR
    // ═══════════════════════════════════════════════
    if (cmd === 'password') {
      const len    = Math.min(parseInt(text) || 12, 32);
      const pass   = generatePassword(len);
      await reply(
        `╔══════════════════════╗\n` +
        `║ 🔑 GENERATED PASSWORD ║\n` +
        `╠══════════════════════╣\n` +
        `║ 🔒 ${pass}\n` +
        `║\n` +
        `║ 📏 Length: ${len} chars\n` +
        `║ ⚠️ Save it somewhere safe!\n` +
        `╚══════════════════════╝`
      );
      return true;
    }

    // ═══════════════════════════════════════════════
    // 60. BASE64 ENCODE
    // ═══════════════════════════════════════════════
    if (cmd === 'encode64') {
      if (!text) return reply(`❌ Usage: ${prefix}encode64 <text>`);
      const encoded = encodeBase64(text);
      await reply(`🔒 *Base64 Encoded:*\n\n\`${encoded}\``);
      return true;
    }

    // ═══════════════════════════════════════════════
    // 61. BASE64 DECODE
    // ═══════════════════════════════════════════════
    if (cmd === 'decode64') {
      if (!text) return reply(`❌ Usage: ${prefix}decode64 <encoded text>`);
      const decoded = decodeBase64(text);
      await reply(decoded ? `🔓 *Base64 Decoded:*\n\n${decoded}` : '❌ Invalid Base64 string.');
      return true;
    }

    // ═══════════════════════════════════════════════
    // 62. TEXT TO MORSE
    // ═══════════════════════════════════════════════
    if (cmd === 'morse') {
      if (!text) return reply(`❌ Usage: ${prefix}morse <text>`);
      const morse = toMorse(text);
      await reply(`📡 *Morse Code:*\n\n${morse}`);
      return true;
    }

    // ═══════════════════════════════════════════════
    // 63. MORSE TO TEXT
    // ═══════════════════════════════════════════════
    if (cmd === 'unmorse') {
      if (!text) return reply(`❌ Usage: ${prefix}unmorse <morse code>\n💡 Example: ${prefix}unmorse .... .`);
      const decoded = fromMorse(text);
      await reply(`📻 *Decoded Text:*\n\n${decoded}`);
      return true;
    }

    // ═══════════════════════════════════════════════
    // 64. TEXT TO BINARY
    // ═══════════════════════════════════════════════
    if (cmd === 'binary') {
      if (!text) return reply(`❌ Usage: ${prefix}binary <text>`);
      const bin = toBinary(text);
      await reply(`💻 *Binary Code:*\n\n${bin}`);
      return true;
    }

    // ═══════════════════════════════════════════════
    // 65. BINARY TO TEXT
    // ═══════════════════════════════════════════════
    if (cmd === 'unbinary') {
      if (!text) return reply(`❌ Usage: ${prefix}unbinary <binary>\n💡 Example: ${prefix}unbinary 01001000 01101001`);
      const decoded = fromBinary(text);
      await reply(decoded ? `📟 *Decoded Text:*\n\n${decoded}` : '❌ Invalid binary code.');
      return true;
    }

    // ═══════════════════════════════════════════════
    // 66. HOROSCOPE
    // ═══════════════════════════════════════════════
    if (cmd === 'horoscope') {
      if (!text) return reply(`❌ Usage: ${prefix}horoscope <sign>\n💡 Signs: aries, taurus, gemini, cancer, leo, virgo, libra, scorpio, sagittarius, capricorn, aquarius, pisces`);
      const h = getHoroscope(text);
      await reply(h
        ? `╔══════════════════════╗\n║ 🔮 HOROSCOPE          ║\n╠══════════════════════╣\n║ ${h.sign}\n║\n║ ${h.reading}\n╚══════════════════════╝`
        : '❌ Invalid zodiac sign. Example: aries, leo, scorpio');
      return true;
    }

    // ═══════════════════════════════════════════════
    // 67. ZODIAC SIGN
    // ═══════════════════════════════════════════════
    if (cmd === 'zodiac') {
      const [day, month] = args;
      if (!day || !month) return reply(`❌ Usage: ${prefix}zodiac <day> <month>\n💡 Example: ${prefix}zodiac 15 4`);
      const sign = getZodiacSign(day, month);
      await reply(`♈ *Your Zodiac Sign:*\n\n*${sign}*\n\nUse ${prefix}horoscope to get your daily reading!`);
      return true;
    }

    // ═══════════════════════════════════════════════
    // 68. LYRICS
    // ═══════════════════════════════════════════════
    if (cmd === 'lyrics') {
      if (!text || !text.includes('-')) return reply(`❌ Usage: ${prefix}lyrics <artist> - <song title>\n💡 Example: ${prefix}lyrics Eminem - Lose Yourself`);
      const [artist, ...titleParts] = text.split('-');
      const title = titleParts.join('-').trim();
      await reply('🎵 Searching lyrics...');
      const result = await getLyrics(artist.trim(), title.trim());
      await reply(result ? `🎵 *${artist.trim()} — ${title.trim()}*\n\n${result}` : '❌ Lyrics not found. Check artist and song name.');
      return true;
    }

    // ═══════════════════════════════════════════════
    // 69. YOUTUBE INFO
    // ═══════════════════════════════════════════════
    if (cmd === 'ytinfo') {
      if (!text) return reply(`❌ Usage: ${prefix}ytinfo <youtube url>`);
      await reply('📹 Fetching YouTube video info...');
      const result = await getYouTubeInfo(text);
      await reply(result
        ? `╔══════════════════════╗\n║ 📹 YOUTUBE INFO       ║\n╠══════════════════════╣\n║ 🎬 ${result.title}\n║ 👤 ${result.author}\n╚══════════════════════╝`
        : '❌ Could not fetch video info. Check the URL.');
      return true;
    }

    // ═══════════════════════════════════════════════
    // 70. YOUTUBE MP3 DOWNLOAD
    // ═══════════════════════════════════════════════
    if (['yt', 'ytmp3', 'y'].includes(cmd)) {
      if (!text) return reply(`❌ Usage: ${prefix}ytmp3 <youtube url>`);
      await reply('⏳ Fetching YouTube audio... Please wait.');
      const result = await downloadYouTubeMP3(text);
      if (result && result.download_url) {
        await sock.sendMessage(from, { audio: { url: result.download_url }, mimetype: 'audio/mpeg' }, { quoted: msg });
      } else {
        await reply('❌ Download failed. Check the URL and try again.\n💡 Make sure you use a full YouTube link: https://youtube.com/watch?v=...');
      }
      return true;
    }

    // ═══════════════════════════════════════════════
    // 71. TIKTOK DOWNLOAD
    // ═══════════════════════════════════════════════
    if (['t', 'tiktok'].includes(cmd)) {
      if (!text) return reply(`❌ Usage: ${prefix}tiktok <url>`);
      await reply('⏳ Downloading TikTok video...');
      const result = await downloadTikTok(text);
      if (result && result.videoUrl) {
        await sock.sendMessage(from, { video: { url: result.videoUrl }, caption: `🎬 ${result.title}\n👤 ${result.author}\n⏱️ ${result.duration}s` }, { quoted: msg });
      } else {
        await reply('❌ Download failed. Make sure the TikTok link is valid and public.');
      }
      return true;
    }

    // ═══════════════════════════════════════════════
    // 72. QURAN AYAH
    // ═══════════════════════════════════════════════
    if (cmd === 'quran') {
      if (!text || !text.includes(':')) return reply(`❌ Usage: ${prefix}quran <surah>:<ayah>\n💡 Example: ${prefix}quran 2:255`);
      const [s, a] = text.split(':');
      if (isNaN(s) || isNaN(a)) return reply('❌ Invalid format. Use numbers like: .quran 2:255');
      await reply('📖 Fetching Ayah...');
      const result = await getQuran(s, a);
      await reply(result
        ? `╔══════════════════════════╗\n║ 📖 QURAN (${result.number})       ║\n╠══════════════════════════╣\n🕌 Surah: ${result.surahName}\n📍 Juz: ${result.juz}\n\n🌙 Arabic:\n${result.arabic}\n\n🌍 English:\n${result.english}\n╚══════════════════════════╝`
        : '❌ Ayah not found. Check surah and ayah numbers.');
      return true;
    }

    // ═══════════════════════════════════════════════
    // 73. SURAH INFO
    // ═══════════════════════════════════════════════
    if (cmd === 'surah') {
      if (!text || isNaN(text)) return reply(`❌ Usage: ${prefix}surah <number>\n💡 Example: ${prefix}surah 1`);
      const result = await getQuranSurah(text);
      await reply(result
        ? `╔══════════════════════╗\n║ 📚 SURAH INFO         ║\n╠══════════════════════╣\n║ 📛 ${result.name} (${result.arabicName})\n║ 💬 Meaning: ${result.meaning}\n║ 📖 Ayahs: ${result.ayahs}\n║ 🕌 Revealed: ${result.revelationType}\n╚══════════════════════╝`
        : '❌ Surah not found. Enter number 1-114.');
      return true;
    }

    // ═══════════════════════════════════════════════
    // 74. PRAYER TIMES
    // ═══════════════════════════════════════════════
    if (cmd === 'prayer') {
      if (!text) return reply(`❌ Usage: ${prefix}prayer <city>`);
      await reply('🕌 Fetching prayer times...');
      const t = await getPrayerTimes(text);
      await reply(t
        ? `╔══════════════════════╗\n║ 🕌 PRAYER TIMES — ${text.toUpperCase()}\n╠══════════════════════╣\n║ 🌅 Fajr:    ${t.Fajr}\n║ ☀️ Dhuhr:   ${t.Dhuhr}\n║ 🌤️ Asr:     ${t.Asr}\n║ 🌇 Maghrib: ${t.Maghrib}\n║ 🌙 Isha:    ${t.Isha}\n╚══════════════════════╝`
        : '❌ City not found. Try: Karachi, Lahore, Islamabad');
      return true;
    }

    // ═══════════════════════════════════════════════
    // 75. RANDOM DUA
    // ═══════════════════════════════════════════════
    if (cmd === 'dua') {
      const dua = await getRandomDua();
      await reply(dua
        ? `╔══════════════════╗\n║ 📿 RANDOM DUA     ║\n╠══════════════════╣\n${dua}\n╚══════════════════╝`
        : '📿 *Allahu Akbar* — Keep remembering Allah! 🤲');
      return true;
    }

    // ═══════════════════════════════════════════════
    // 76. HADITH
    // ═══════════════════════════════════════════════
    if (cmd === 'hadith') {
      await reply('📜 Fetching Hadith...');
      const hadith = await getRandomHadith();
      await reply(hadith
        ? `╔══════════════════════╗\n║ 📜 HADITH             ║\n╠══════════════════════╣\n📚 Book: ${hadith.book}\n🔢 #${hadith.number}\n\n${hadith.text}\n╚══════════════════════╝`
        : '❌ Hadith API key not configured. Set HADITH_API_KEY in .env');
      return true;
    }

    // ═══════════════════════════════════════════════
    // 77. HIJRI DATE
    // ═══════════════════════════════════════════════
    if (cmd === 'hijri') {
      const today    = new Date();
      const JD = Math.floor((today.getTime() / 86400000) + 2440587.5);
      const l  = JD - 1948440 + 10632;
      const n  = Math.floor((l - 1) / 10631);
      const l2 = l - 10631 * n + 354;
      const j  = Math.floor((10985 - l2) / 5316) * Math.floor((50 * l2) / 17719) + Math.floor(l2 / 5670) * Math.floor((43 * l2) / 15238);
      const l3 = l2 - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
      const month = Math.floor((24 * l3) / 709);
      const day   = l3 - Math.floor((709 * month) / 24);
      const year  = 30 * n + j - 30;
      const hijriMonths = ['Muharram','Safar','Rabi al-Awwal','Rabi al-Thani','Jumada al-Awwal','Jumada al-Thani','Rajab','Sha\'ban','Ramadan','Shawwal','Dhu al-Qi\'dah','Dhu al-Hijjah'];
      await reply(`🗓️ *Gregorian:* ${today.toDateString()}\n🌙 *Hijri:* ${day} ${hijriMonths[month - 1] || ''} ${year} AH`);
      return true;
    }

    // ═══════════════════════════════════════════════
    // GROUP ADMIN COMMANDS (78–86)
    // ═══════════════════════════════════════════════
    if (isGroup) {
      const groupMeta    = await sock.groupMetadata(from).catch(() => null);
      const groupAdmins  = groupMeta?.participants.filter(p => p.admin).map(p => p.id) || [];
      const isGroupAdmin = groupAdmins.includes(sender) || superAdmin;

      // 78. KICK
      if (cmd === 'kick') {
        if (!isGroupAdmin) return reply('❌ Group admin only!');
        const targets = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        if (!targets.length) return reply(`❌ Tag someone to kick. Usage: ${prefix}kick @user`);
        for (const t of targets) await sock.groupParticipantsUpdate(from, [t], 'remove').catch(() => {});
        await reply(`✅ Kicked ${targets.length} member(s).`);
        return true;
      }

      // 79. ADD
      if (cmd === 'add') {
        if (!isGroupAdmin) return reply('❌ Group admin only!');
        if (!text) return reply(`❌ Usage: ${prefix}add 923001234567`);
        const jid    = text.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
        const result = await sock.groupParticipantsUpdate(from, [jid], 'add').catch(() => null);
        await reply(result ? `✅ Added ${text}` : '❌ Failed to add. User may not exist or has privacy settings.');
        return true;
      }

      // 80. PROMOTE
      if (cmd === 'promote') {
        if (!isGroupAdmin) return reply('❌ Group admin only!');
        const targets = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        if (!targets.length) return reply(`❌ Tag someone to promote. Usage: ${prefix}promote @user`);
        for (const t of targets) await sock.groupParticipantsUpdate(from, [t], 'promote').catch(() => {});
        await reply(`✅ Promoted ${targets.length} member(s) to admin.`);
        return true;
      }

      // 81. DEMOTE
      if (cmd === 'demote') {
        if (!isGroupAdmin) return reply('❌ Group admin only!');
        const targets = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
        if (!targets.length) return reply(`❌ Tag someone to demote. Usage: ${prefix}demote @user`);
        for (const t of targets) await sock.groupParticipantsUpdate(from, [t], 'demote').catch(() => {});
        await reply(`✅ Demoted ${targets.length} admin(s).`);
        return true;
      }

      // 82. MUTE
      if (cmd === 'mute') {
        if (!isGroupAdmin) return reply('❌ Group admin only!');
        await sock.groupSettingUpdate(from, 'announcement').catch(() => {});
        await reply('🔇 Group muted. Only admins can send messages now.');
        return true;
      }

      // 83. UNMUTE
      if (cmd === 'unmute') {
        if (!isGroupAdmin) return reply('❌ Group admin only!');
        await sock.groupSettingUpdate(from, 'not_announcement').catch(() => {});
        await reply('🔊 Group unmuted. Everyone can send messages now.');
        return true;
      }

      // 84. TAG ALL
      if (cmd === 'tagall') {
        if (!isGroupAdmin) return reply('❌ Group admin only!');
        const members = groupMeta?.participants.map(p => p.id) || [];
        const tagText = members.map(m => `@${m.replace('@s.whatsapp.net', '')}`).join(' ');
        await sock.sendMessage(from, { text: `📣 ${text || 'Attention Everyone!'}\n\n${tagText}`, mentions: members }, { quoted: msg });
        return true;
      }

      // 85. GROUP INFO
      if (cmd === 'groupinfo') {
        if (!groupMeta) return reply('❌ Failed to fetch group info.');
        await reply(
          `╔══════════════════════╗\n` +
          `║ 👥 GROUP INFO         ║\n` +
          `╠══════════════════════╣\n` +
          `║ 📛 Name: ${groupMeta.subject}\n` +
          `║ 👤 Members: ${groupMeta.participants.length}\n` +
          `║ 👑 Admins: ${groupAdmins.length}\n` +
          `║ 📅 Created: ${new Date(groupMeta.creation * 1000).toDateString()}\n` +
          `║ 🆔 ID: ${from}\n` +
          `╚══════════════════════╝`
        );
        return true;
      }

      // 86. RESET INVITE LINK
      if (cmd === 'resetlink') {
        if (!isGroupAdmin) return reply('❌ Group admin only!');
        await sock.groupRevokeInvite(from).catch(() => {});
        const newCode = await sock.groupInviteCode(from).catch(() => null);
        await reply(newCode ? `🔗 *New Invite Link:*\nhttps://chat.whatsapp.com/${newCode}` : '❌ Failed to reset invite link.');
        return true;
      }
    }

    // ═══════════════════════════════════════════════
    // SUPER ADMIN COMMANDS (87–100)
    // ═══════════════════════════════════════════════

    // 87. BOT STATS
    if (cmd === 'stats' && superAdmin) {
      const [users, sessions] = await Promise.all([getAllUsers(), getAllSessions()]);
      const liveBots          = getAllActiveBots();
      await reply(
        `╔══════════════════════╗\n` +
        `║ 📊 BOT STATS          ║\n` +
        `╠══════════════════════╣\n` +
        `║ 👤 Total Users: ${users.length}\n` +
        `║ ✅ Approved: ${users.filter(u => u.status === 'approved').length}\n` +
        `║ ⏳ Pending: ${users.filter(u => u.status === 'pending').length}\n` +
        `║ 🤖 Sessions: ${sessions.length}\n` +
        `║ 🟢 Live Bots: ${liveBots.length}\n` +
        `║ 🔢 Commands: 100\n` +
        `╚══════════════════════╝`
      );
      return true;
    }

    // 88. BROADCAST
    if (cmd === 'broadcast' && superAdmin) {
      if (!text) return reply(`❌ Usage: ${prefix}broadcast <message>`);
      const sessions = await getAllSessions();
      let sent = 0;
      for (const s of sessions) {
        try {
          const sessionSock = getBotInstance(s.sessionId)?.sock;
          if (!sessionSock) continue;
          await sessionSock.sendMessage(s.whatsappNumber + '@s.whatsapp.net', {
            text: `📢 *Announcement from Sahil Hacker 804:*\n\n${text}`,
          });
          sent++;
        } catch (_) {}
      }
      await reply(`✅ Broadcast sent to ${sent}/${sessions.length} sessions.`);
      return true;
    }

    // 89. LIST ALL USERS (super admin)
    if (cmd === 'users' && superAdmin) {
      const users = await getAllUsers();
      if (!users.length) return reply('📋 No users found.');
      const page = Math.max(1, parseInt(args[0]) || 1);
      const limit = 15;
      const start = (page - 1) * limit;
      const pageUsers = users.slice(start, start + limit);
      if (!pageUsers.length) return reply(`❌ No users on page ${page}.`);
      const totalPages = Math.ceil(users.length / limit);
      const list = pageUsers.map((u, i) => `${start + i + 1}. ${u.name} — ${u.status} — ${u.plan}`).join('\n');
      await reply(`╔══════════════════════╗\n║ 👥 USER LIST (${page}/${totalPages})    ║\n╠══════════════════════╣\n${list}\n╚══════════════════════╝`);
      return true;
    }
    
    // 90. LIST ALL SESSIONS (super admin)
    if (cmd === 'sessions' && superAdmin) {
      const sessions = await getAllSessions();
      const liveBots = getAllActiveBots();
      if (!sessions.length) return reply('📋 No sessions found.');
      const page = Math.max(1, parseInt(args[0]) || 1);
      const limit = 10;
      const start = (page - 1) * limit;
      const pageSessions = sessions.slice(start, start + limit);
      if (!pageSessions.length) return reply(`❌ No sessions on page ${page}.`);
      const totalPages = Math.ceil(sessions.length / limit);
      const list = pageSessions.map((s, i) => `${start + i + 1}. ${s.sessionId} | ${s.status} | Live: ${liveBots.some(b => b.sessionId === s.sessionId) ? '✅' : '❌'}`).join('\n');
      await reply(`╔══════════════════════╗\n║ 🤖 SESSIONS (${page}/${totalPages})      ║\n╠══════════════════════╣\n${list}\n╚══════════════════════╝`);
      return true;
    }

    // 91. BOT MEMORY USAGE (super admin)
    if (cmd === 'memory' && superAdmin) {
      const mem = process.memoryUsage();
      await reply(
        `╔══════════════════════╗\n` +
        `║ 💾 MEMORY USAGE       ║\n` +
        `╠══════════════════════╣\n` +
        `║ 📦 RSS: ${(mem.rss / 1024 / 1024).toFixed(2)} MB\n` +
        `║ 🔧 Heap Used: ${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB\n` +
        `║ 📊 Heap Total: ${(mem.heapTotal / 1024 / 1024).toFixed(2)} MB\n` +
        `║ ⏱️ Uptime: ${formatUptime(Date.now() - BOT_START_TIME)}\n` +
        `╚══════════════════════╝`
      );
      return true;
    }

    // 92. SERVER UPTIME (super admin)
    if (cmd === 'serverinfo' && superAdmin) {
      await reply(
        `╔══════════════════════╗\n` +
        `║ 🖥️ SERVER INFO        ║\n` +
        `╠══════════════════════╣\n` +
        `║ 🤖 Bot: ${config.bot.name}\n` +
        `║ 📋 Version: v${config.bot.version}\n` +
        `║ ⏱️ Bot Uptime: ${formatUptime(Date.now() - BOT_START_TIME)}\n` +
        `║ 🖥️ Process Uptime: ${formatUptime(process.uptime() * 1000)}\n` +
        `║ 🟢 Live Bots: ${getAllActiveBots().length}\n` +
        `║ 📦 Node: ${process.version}\n` +
        `╚══════════════════════╝`
      );
      return true;
    }

    // 93. REPEAT / ECHO (super admin)
    if (cmd === 'say' && superAdmin) {
      if (!text) return reply(`❌ Usage: ${prefix}say <message>`);
      await sock.sendMessage(from, { text });
      return true;
    }

    // 94. CLEAR CHAT (super admin, group only)
    if (cmd === 'clearchat' && superAdmin && isGroup) {
      await reply('🗑️ Chat clearing is not supported by WhatsApp API directly. Use the WhatsApp app to clear chat.');
      return true;
    }

    // 95. POLL / VOTE (group)
    if (cmd === 'poll') {
      if (!text || !text.includes('|')) return reply(`❌ Usage: ${prefix}poll <question> | <option1> | <option2>\n💡 Example: ${prefix}poll Favorite color? | Red | Blue | Green`);
      const [question, ...options] = text.split('|').map(s => s.trim().slice(0, 100));
      if (options.length < 2) return reply('❌ Need at least 2 options. Separate with |');
      const pollText = options.map((o, i) => `${i + 1}️⃣ ${o}`).join('\n');
      await reply(`📊 *POLL:* ${question}\n\n${pollText}\n\nReply with the number to vote! 🗳️`);
      return true;
    }

    // 96. REMIND (simple — sends a delayed message)
    if (cmd === 'remind') {
      const [minutesStr, ...msgParts] = text.split(' ');
      const minutes = parseInt(minutesStr);
      const remindMsg = msgParts.join(' ');
      if (!minutes || isNaN(minutes) || !remindMsg) return reply(`❌ Usage: ${prefix}remind <minutes> <message>\n💡 Example: ${prefix}remind 5 Take a break!`);
      if (minutes < 1) return reply('❌ 𝑴𝒊𝒏𝒊𝒎𝒖𝒎 𝒓𝒆𝒎𝒊𝒏𝒅𝒆𝒓 𝒕𝒊𝒎𝒆 𝒊𝒔 𝟏 𝒎𝒊𝒏𝒖𝒕𝒆.');
      if (minutes > 60) return reply('❌ Maximum reminder time is 60 minutes.');
      await reply(`✅ Reminder set! I will remind you in *${minutes} minute(s)*. ⏰`);
      setTimeout(async () => {
        await sock.sendMessage(from, {
          text: `⏰ *REMINDER!*\n\n@${sender.replace('@s.whatsapp.net', '')} — ${remindMsg}`,
          mentions: [sender],
        }).catch(() => {});
      }, minutes * 60 * 1000);
      return true;
    }

    // 97. RANDOM EMOJI COMBO
    if (cmd === 'emoji') {
      const emojis = ['😀','😂','🥰','😎','🤩','🎉','🔥','💎','⚡','🌟','🚀','💪','🏆','👑','✨','💫','🎯','💥','🎊','🌈'];
      const combo  = Array.from({ length: 6 }, () => emojis[Math.floor(Math.random() * emojis.length)]).join(' ');
      await reply(`✨ *Random Emoji Combo:*\n\n${combo}`);
      return true;
    }

    // 98. REPEAT TEXT AS STICKER-STYLE (fancy text)
    if (cmd === 'fancy') {
      if (!text) return reply(`❌ Usage: ${prefix}fancy <text>`);
      const chars = { a:'𝕒',b:'𝕓',c:'𝕔',d:'𝕕',e:'𝕖',f:'𝕗',g:'𝕘',h:'𝕙',i:'𝕚',j:'𝕛',k:'𝕜',l:'𝕝',m:'𝕞',n:'𝕟',o:'𝕠',p:'𝕡',q:'𝕢',r:'𝕣',s:'𝕤',t:'𝕥',u:'𝕦',v:'𝕧',w:'𝕨',x:'𝕩',y:'𝕪',z:'𝕫',A:'𝔸',B:'𝔹',C:'ℂ',D:'𝔻',E:'𝔼',F:'𝔽',G:'𝔾',H:'ℍ',I:'𝕀',J:'𝕁',K:'𝕂',L:'𝕃',M:'𝕄',N:'ℕ',O:'𝕆',P:'ℙ',Q:'ℚ',R:'ℝ',S:'𝕊',T:'𝕋',U:'𝕌',V:'𝕍',W:'𝕎',X:'𝕏',Y:'𝕐',Z:'ℤ',' ':' '};
      const fancy = text.split('').map(c => chars[c] || c).join('');
      await reply(`✨ *Fancy Text:*\n\n${fancy}`);
      return true;
    }

    // 99. ASCII TEXT
    if (cmd === 'big') {
      if (!text) return reply(`❌ Usage: ${prefix}big <text>`);
      const bigText = text.toUpperCase().split('').join('  ');
      await reply(`🔠 *Big Text:*\n\n[ ${bigText} ]`);
      return true;
    }

    // 100. HELP FOR SPECIFIC COMMAND
    if (cmd === 'howto') {
      if (!text) return reply(`❌ Usage: ${prefix}howto <command>\n💡 Example: ${prefix}howto weather`);
      const helpMap = {
        weather:   `🌤️ ${prefix}weather <city>\nExample: ${prefix}weather Karachi`,
        crypto:    `💹 ${prefix}crypto <coin>\nExample: ${prefix}crypto bitcoin`,
        quran:     `📖 ${prefix}quran <surah>:<ayah>\nExample: ${prefix}quran 2:255`,
        translate: `🌍 ${prefix}translate <text>\nFor specific lang: ${prefix}translate fr Hello`,
        ytmp3:     `🎵 ${prefix}ytmp3 <youtube-url>\nExample: ${prefix}ytmp3 https://youtube.com/watch?v=...`,
        tiktok:    `🎬 ${prefix}tiktok <tiktok-url>`,
        currency:  `💱 ${prefix}currency <amount> <from> <to>\nExample: ${prefix}currency 100 USD PKR`,
        bmi:       `⚖️ ${prefix}bmi <weight_kg> <height_cm>\nExample: ${prefix}bmi 70 175`,
        age:       `🎂 ${prefix}age <YYYY-MM-DD>\nExample: ${prefix}age 2000-04-15`,
        password:  `🔑 ${prefix}password <length>\nExample: ${prefix}password 16`,
        remind:    `⏰ ${prefix}remind <minutes> <message>\nExample: ${prefix}remind 10 Drink water`,
        poll:      `📊 ${prefix}poll <question> | <opt1> | <opt2>\nExample: ${prefix}poll Best fruit? | Apple | Mango`,
        morse:     `📡 ${prefix}morse <text>\nDecode: ${prefix}unmorse <code>`,
        binary:    `💻 ${prefix}binary <text>\nDecode: ${prefix}unbinary <code>`,
        love:      `💕 ${prefix}love <name1> & <name2>`,
        horoscope: `🔮 ${prefix}horoscope <sign>\nExample: ${prefix}horoscope leo`,
        movie:     `🎬 ${prefix}movie <title>\nExample: ${prefix}movie Inception`,
        github:    `🐙 ${prefix}github <username>`,
        ip:        `🌐 ${prefix}ip <ip-address>`,
        country:   `🌍 ${prefix}country <name>\nExample: ${prefix}country Pakistan`,
        lyrics:    `🎵 ${prefix}lyrics <artist> - <song>\nExample: ${prefix}lyrics Eminem - Lose Yourself`,
      };
      const help = helpMap[text.toLowerCase()];
      await reply(help ? `📋 *How to use ${prefix}${text}:*\n\n${help}` : `❌ No help found for "${text}". Use ${prefix}menu to see all commands.`);
      return true;
    }

    // ═══════════════════════════════════════════════
    // 101. TTS — TEXT TO SPEECH
    // ═══════════════════════════════════════════════
    if (cmd === 'tts') {
      if (!text) return reply(`❌ Usage: ${prefix}𝒕𝒕𝒔 <text>`);
      if (text.length > 500) return reply('❌ 𝑻𝒆𝒙𝒕 𝒕𝒐𝒐 𝒍𝒐𝒏𝒈! 𝑴𝒂𝒙𝒊𝒎𝒖𝒎 𝟓𝟎𝟎 𝒄𝒉𝒂𝒓𝒂𝒄𝒕𝒆𝒓𝒔 𝒂𝒍𝒍𝒐𝒘𝒆𝒅.');
      const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=en&client=tw-ob&q=${encodeURIComponent(text)}`;
      await reply('🎵 𝑮𝒆𝒏𝒆𝒓𝒂𝒕𝒊𝒏𝒈 𝒗𝒐𝒊𝒄𝒆...');
      await sock.sendMessage(from, {
        audio: { url: ttsUrl },
        mimetype: 'audio/mpeg',
        ptt: true,
      }, { quoted: msg });
      return true;
    }

    // ═══════════════════════════════════════════════
    // 102. STICKER
    // ═══════════════════════════════════════════════
    if (cmd === 'sticker' || cmd === 's') {
      const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (!quoted?.imageMessage && !quoted?.videoMessage) {
        return reply(
          `╔══════════════════════╗\n` +
          `║ 🎭 𝑺𝑻𝑰𝑪𝑲𝑬𝑹 𝑴𝑨𝑲𝑬𝑹    ║\n` +
          `╠══════════════════════╣\n` +
          `║ 📸 𝑹𝒆𝒑𝒍𝒚 𝒕𝒐 𝒂𝒏 𝒊𝒎𝒂𝒈𝒆\n` +
          `║ 𝒘𝒊𝒕𝒉 ${prefix}𝒔𝒕𝒊𝒄𝒌𝒆𝒓\n` +
          `╚══════════════════════╝`
        );
      }
      await reply('⏳ 𝑪𝒓𝒆𝒂𝒕𝒊𝒏𝒈 𝒔𝒕𝒊𝒄𝒌𝒆𝒓...');
      try {
        const { downloadMediaMessage } = await getBaileys();
        const msgToDownload = { message: quoted, key: msg.key };
        if (quoted.imageMessage) {
          const buffer = await downloadMediaMessage(msgToDownload, 'buffer', {});
          await sock.sendMessage(from, { sticker: buffer }, { quoted: msg });
        } else if (quoted.videoMessage) {
          const buffer = await downloadMediaMessage(msgToDownload, 'buffer', {});
          await sock.sendMessage(from, { sticker: buffer }, { quoted: msg });
        }
      } catch {
        await reply('❌ 𝑺𝒕𝒊𝒄𝒌𝒆𝒓 𝒄𝒓𝒆𝒂𝒕𝒊𝒐𝒏 𝒇𝒂𝒊𝒍𝒆𝒅. 𝑻𝒓𝒚 𝒂𝒏𝒐𝒕𝒉𝒆𝒓 𝒊𝒎𝒂𝒈𝒆.');
      }
      return true;
    }

    // ═══════════════════════════════════════════════
    // 103. TOIMG — STICKER TO IMAGE
    // ═══════════════════════════════════════════════
    if (cmd === 'toimg') {
      const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (!quoted?.stickerMessage) {
        return reply(`❌ 𝑹𝒆𝒑𝒍𝒚 𝒕𝒐 𝒂 𝒔𝒕𝒊𝒄𝒌𝒆𝒓 𝒘𝒊𝒕𝒉 ${prefix}𝒕𝒐𝒊𝒎𝒈`);
      }
      await reply('⏳ 𝑪𝒐𝒏𝒗𝒆𝒓𝒕𝒊𝒏𝒈...');
      try {
        await sock.sendMessage(from, {
          image: { url: quoted.stickerMessage.url },
          caption: '✅ 𝑺𝒕𝒊𝒄𝒌𝒆𝒓 𝒄𝒐𝒏𝒗𝒆𝒓𝒕𝒆𝒅 𝒕𝒐 𝒊𝒎𝒂𝒈𝒆!',
        }, { quoted: msg });
      } catch {
        await reply('❌ 𝑪𝒐𝒏𝒗𝒆𝒓𝒔𝒊𝒐𝒏 𝒇𝒂𝒊𝒍𝒆𝒅.');
      }
      return true;
    }

    // ═══════════════════════════════════════════════
    // 104. REVERSE TEXT
    // ═══════════════════════════════════════════════
    if (cmd === 'reverse') {
      if (!text) return reply(`❌ Usage: ${prefix}𝒓𝒆𝒗𝒆𝒓𝒔𝒆 <text>`);
      const reversed = text.split('').reverse().join('');
      await reply(
        `╔══════════════════════╗\n` +
        `║ 🔄 𝑹𝑬𝑽𝑬𝑹𝑺𝑬𝑫 𝑻𝑬𝑿𝑻    ║\n` +
        `╠══════════════════════╣\n` +
        `║ 📝 ${text}\n` +
        `║ 🔄 ${reversed}\n` +
        `╚══════════════════════╝`
      );
      return true;
    }

    // ═══════════════════════════════════════════════
    // 105. REPEAT
    // ═══════════════════════════════════════════════
    if (cmd === 'repeat') {
      const [times, ...words] = args;
      const repeatText = words.join(' ');
      if (!times || !repeatText || isNaN(times)) {
        return reply(`❌ Usage: ${prefix}𝒓𝒆𝒑𝒆𝒂𝒕 <times> <text>`);
      }
      const count = Math.min(parseInt(times), 10);
      const result = Array(count).fill(repeatText).join('\n');
      await reply(`🔁 *𝑹𝒆𝒑𝒆𝒂𝒕𝒆𝒅 ${count}x:*\n\n${result}`);
      return true;
    }

    // ═══════════════════════════════════════════════
    // 106. UPPERCASE
    // ═══════════════════════════════════════════════
    if (cmd === 'upper') {
      if (!text) return reply(`❌ Usage: ${prefix}𝒖𝒑𝒑𝒆𝒓 <text>`);
      await reply(`🔠 *𝑼𝑷𝑷𝑬𝑹𝑪𝑨𝑺𝑬:*\n\n${text.toUpperCase()}`);
      return true;
    }

    // ═══════════════════════════════════════════════
    // 107. LOWERCASE
    // ═══════════════════════════════════════════════
    if (cmd === 'lower') {
      if (!text) return reply(`❌ Usage: ${prefix}𝒍𝒐𝒘𝒆𝒓 <text>`);
      await reply(`🔡 *𝑳𝑶𝑾𝑬𝑹𝑪𝑨𝑺𝑬:*\n\n${text.toLowerCase()}`);
      return true;
    }

    // ═══════════════════════════════════════════════
    // 108. PING WITH TIMESTAMP
    // ═══════════════════════════════════════════════
    if (cmd === 'speed') {
      const start = Date.now();
      const ms = Math.abs(start - msg.messageTimestamp * 1000);
      await reply(
        `╔══════════════════════╗\n` +
        `║ ⚡ 𝑺𝑷𝑬𝑬𝑫 𝑻𝑬𝑺𝑻        ║\n` +
        `╠══════════════════════╣\n` +
        `║ 🏓 𝑷𝒐𝒏𝒈!\n` +
        `║ ⏱️ 𝑳𝒂𝒕𝒆𝒏𝒄𝒚: ${ms}𝒎𝒔\n` +
        `║ 🚀 𝑺𝒕𝒂𝒕𝒖𝒔: ${ms < 500 ? '𝑬𝒙𝒄𝒆𝒍𝒍𝒆𝒏𝒕 ✅' : ms < 1000 ? '𝑮𝒐𝒐𝒅 🟡' : '𝑺𝒍𝒐𝒘 🔴'}\n` +
        `╚══════════════════════╝`
      );
      return true;
    }

    // ═══════════════════════════════════════════════
    // 109. QUOTE REPLY AS IMAGE
    // ═══════════════════════════════════════════════
    if (cmd === 'quotely' || cmd === 'qt') {
      const quoted = msg.message?.extendedTextMessage?.contextInfo;
      if (!quoted?.quotedMessage) {
        return reply(`❌ 𝑹𝒆𝒑𝒍𝒚 𝒕𝒐 𝒂 𝒎𝒆𝒔𝒔𝒂𝒈𝒆 𝒘𝒊𝒕𝒉 ${prefix}𝒒𝒕`);
      }
      const quotedText =
        quoted.quotedMessage?.conversation ||
        quoted.quotedMessage?.extendedTextMessage?.text ||
        'Media Message';
      const quotedName = quoted.pushName || quoted.participant?.replace('@s.whatsapp.net', '') || 'Unknown';
      await reply(
        `╔══════════════════════╗\n` +
        `║ 💬 𝑸𝑼𝑶𝑻𝑬𝑫 𝑴𝑬𝑺𝑺𝑨𝑮𝑬  ║\n` +
        `╠══════════════════════╣\n` +
        `║ 👤 ${quotedName}\n` +
        `║ 💬 ${quotedText.slice(0, 100)}\n` +
        `╚══════════════════════╝`
      );
      return true;
    }

    // ═══════════════════════════════════════════════
    // 110. BOT INFO
    // ═══════════════════════════════════════════════
    if (cmd === 'botinfo') {
      const uptime = formatUptime(Date.now() - BOT_START_TIME);
      const mem = process.memoryUsage();
      await reply(
        `╔══════════════════════════════╗\n` +
        `║ 🤖 𝑩𝑶𝑻 𝑰𝑵𝑭𝑶               ║\n` +
        `╠══════════════════════════════╣\n` +
        `║ 📛 𝑵𝒂𝒎𝒆: ${config.bot.name}\n` +
        `║ 📋 𝑽𝒆𝒓𝒔𝒊𝒐𝒏: v${config.bot.version}\n` +
        `║ ⏱️ 𝑼𝒑𝒕𝒊𝒎𝒆: ${uptime}\n` +
        `║ 💾 𝑴𝒆𝒎𝒐𝒓𝒚: ${(mem.heapUsed/1024/1024).toFixed(2)} MB\n` +
        `║ 🔢 𝑪𝒐𝒎𝒎𝒂𝒏𝒅𝒔: 110+\n` +
        `║ 👑 𝑶𝒘𝒏𝒆𝒓: 𝑳𝒆𝒈𝒆𝒏𝒅 𝑺𝒂𝒉𝒊𝒍 𝑯𝒂𝒄𝒌𝒆𝒓 𝟖𝟎𝟒\n` +
        `║ 📢 ${config.owner.channel}\n` +
        `╚══════════════════════════════╝`
      );
      return true;
    }

    // ═══════════════════════════════════════════════
    // 111. BOT ON
    // ═══════════════════════════════════════════════
    if (cmd === 'boton') {
      if (!authorized) return reply('❌ 𝑶𝒏𝒍𝒚 𝑩𝒐𝒕 𝑶𝒘𝒏𝒆𝒓 𝒄𝒂𝒏 𝒖𝒔𝒆 𝒕𝒉𝒊𝒔!');
      config.chatbotSessions = config.chatbotSessions || new Map();
      config.chatbotSessions.set(sessionId, true);
      await reply(
        `╔══════════════════════════════╗\n` +
        `║ 🤖 𝑪𝑯𝑨𝑻𝑩𝑶𝑻 𝑬𝑵𝑨𝑩𝑳𝑬𝑫 ✅      ║\n` +
        `╠══════════════════════════════╣\n` +
        `║ ⚡ 𝑩𝒐𝒕 𝒊𝒔 𝒏𝒐𝒘 𝒂𝒄𝒕𝒊𝒗𝒆!\n` +
        `║ 💬 𝑾𝒊𝒍𝒍 𝒓𝒆𝒑𝒍𝒚 𝒕𝒐 𝒎𝒆𝒔𝒔𝒂𝒈𝒆𝒔\n` +
        `║ 🔴 𝑻𝒐 𝒔𝒕𝒐𝒑: ${prefix}𝒃𝒐𝒕𝒐𝒇𝒇\n` +
        `╚══════════════════════════════╝`
      );
      return true;
    }

    // ═══════════════════════════════════════════════
    // 112. BOT OFF
    // ═══════════════════════════════════════════════
    if (cmd === 'botoff') {
      if (!authorized) return reply('❌ 𝑶𝒏𝒍𝒚 𝑩𝒐𝒕 𝑶𝒘𝒏𝒆𝒓 𝒄𝒂𝒏 𝒖𝒔𝒆 𝒕𝒉𝒊𝒔!');
      config.chatbotSessions = config.chatbotSessions || new Map();
      config.chatbotSessions.set(sessionId, false);
      await reply(
        `╔══════════════════════════════╗\n` +
        `║ 🤖 𝑪𝑯𝑨𝑻𝑩𝑶𝑻 𝑫𝑰𝑺𝑨𝑩𝑳𝑬𝑫 🔴     ║\n` +
        `╠══════════════════════════════╣\n` +
        `║ 😴 𝑩𝒐𝒕 𝒊𝒔 𝒏𝒐𝒘 𝒔𝒊𝒍𝒆𝒏𝒕!\n` +
        `║ 🟢 𝑻𝒐 𝒆𝒏𝒂𝒃𝒍𝒆: ${prefix}𝒃𝒐𝒕𝒐𝒏\n` +
        `╚══════════════════════════════╝`
      );
      return true;
    }

    // ═══════════════════════════════════════════════
    // 113. SETTINGS
    // ═══════════════════════════════════════════════
    if (cmd === 'settings') {
      if (!authorized) return reply('❌ 𝑶𝒏𝒍𝒚 𝑩𝒐𝒕 𝑶𝒘𝒏𝒆𝒓 𝒄𝒂𝒏 𝒖𝒔𝒆 𝒕𝒉𝒊𝒔!');
      const f = config.features;
      const chatOn = config.chatbotSessions?.get(sessionId) ? '✅' : '❌';
      await reply(
        `╔══════════════════════════════╗\n` +
        `║ ⚙️ 𝑩𝑶𝑻 𝑺𝑬𝑻𝑻𝑰𝑵𝑮𝑺            ║\n` +
        `╠══════════════════════════════╣\n` +
        `║ 🤖 𝑪𝒉𝒂𝒕𝒃𝒐𝒕:      ${chatOn}\n` +
        `║ ❤️ 𝑨𝒖𝒕𝒐 𝑹𝒆𝒂𝒄𝒕:   ${f.autoReact ? '✅' : '❌'}\n` +
        `║ 💬 𝑨𝒖𝒕𝒐 𝑹𝒆𝒑𝒍𝒚:   ${f.autoReply ? '✅' : '❌'}\n` +
        `║ 👁️ 𝑨𝒖𝒕𝒐 𝑹𝒆𝒂𝒅:    ${f.autoRead ? '✅' : '❌'}\n` +
        `║ 🗑️ 𝑨𝒏𝒕𝒊 𝑫𝒆𝒍𝒆𝒕𝒆:  ${f.antiDelete ? '✅' : '❌'}\n` +
        `║ 👋 𝑾𝒆𝒍𝒄𝒐𝒎𝒆 𝑴𝒔𝒈:  ${f.welcomeMsg ? '✅' : '❌'}\n` +
        `║ 🚫 𝑨𝒏𝒕𝒊 𝑺𝒑𝒂𝒎:    ${f.antiSpam ? '✅' : '❌'}\n` +
        `║ 🔗 𝑨𝒏𝒕𝒊 𝑳𝒊𝒏𝒌:    ${f.antiLink ? '✅' : '❌'}\n` +
        `║ 🤬 𝑨𝒏𝒕𝒊 𝑩𝒂𝒅𝑾𝒐𝒓𝒅: ${f.antiBadWord ? '✅' : '❌'}\n` +
        `╠══════════════════════════════╣\n` +
        `║ 💡 𝑼𝒔𝒆 ${prefix}𝒃𝒐𝒕𝒐𝒏 / ${prefix}𝒃𝒐𝒕𝒐𝒇𝒇\n` +
        `║ 𝒕𝒐 𝒕𝒐𝒈𝒈𝒍𝒆 𝒄𝒉𝒂𝒕𝒃𝒐𝒕 𝒎𝒐𝒅𝒆!\n` +
        `╚══════════════════════════════╝`
      );
      return true;
    }

    return false;
  } catch (err) {
    const { logger } = require('../utils/helpers');
    logger.error(`[Commands] Error in handleCommand:`, err.message);
    return false;
  }
}

module.exports = { handleCommand };
        
