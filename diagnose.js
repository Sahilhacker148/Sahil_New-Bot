/**
 * ╔══════════════════════════════════════════════════════╗
 * ║       SAHIL 804 BOT — DIAGNOSTIC CHECKER v4.2        ║
 * ║     Run: node diagnose.js                            ║
 * ╚══════════════════════════════════════════════════════╝
 *
 * Checks:
 *  1. Node.js version
 *  2. package.json + dependencies
 *  3. Critical files
 *  4. Environment variables (Firebase + all required)
 *  5. Firebase connectivity test (actual Firestore ping)
 *  6. Auth folder (WhatsApp sessions)
 *  7. Baileys version
 */

require('dotenv').config();

const fs   = require('fs');
const path = require('path');

const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';

const PASS = `${GREEN}✅ PASS${RESET}`;
const FAIL = `${RED}❌ FAIL${RESET}`;
const WARN = `${YELLOW}⚠️  WARN${RESET}`;

let totalPass = 0, totalFail = 0, totalWarn = 0;

function log(status, label, detail = '') {
  const line = `  ${status}  ${BOLD}${label}${RESET}${detail ? `\n         ${CYAN}→ ${detail}${RESET}` : ''}`;
  console.log(line);
  if (status.includes('PASS')) totalPass++;
  else if (status.includes('FAIL')) totalFail++;
  else totalWarn++;
}

function section(title) {
  console.log(`\n${BOLD}${CYAN}━━━ ${title} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
}

function fileExists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

function readFile(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

console.log(`\n${BOLD}${CYAN}`);
console.log('╔══════════════════════════════════════════════════════╗');
console.log('║       SAHIL 804 BOT — DIAGNOSTIC CHECKER v4.2        ║');
console.log('╚══════════════════════════════════════════════════════╝');
console.log(RESET);

// ════════════════════════════════════════════════════════
// 1. NODE VERSION
// ════════════════════════════════════════════════════════
section('1. NODE.JS VERSION');
const nodeVer = process.versions.node;
const major   = parseInt(nodeVer.split('.')[0]);
if (major >= 18) log(PASS, `Node.js v${nodeVer}`, 'Required: v18+');
else             log(FAIL, `Node.js v${nodeVer}`, 'Upgrade to v18 or higher');

// ════════════════════════════════════════════════════════
// 2. CRITICAL FILES
// ════════════════════════════════════════════════════════
section('2. CRITICAL FILES');
const criticalFiles = [
  ['Firebase config',        'src/firebase/config.js'],
  ['Firebase auth state',    'src/utils/firebaseAuthState.js'],
  ['App config',             'src/config/config.js'],
  ['Bot launcher',           'src/bot/launcher.js'],
  ['Message handler',        'src/handlers/messageHandler.js'],
  ['Helpers',                'src/utils/helpers.js'],
  ['Auth middleware',        'src/middleware/auth.js'],
  ['Web server',             'web/server.js'],
  ['.env.example',           '.env.example'],
  ['package.json',           'package.json'],
];
for (const [label, rel] of criticalFiles) {
  const full = path.join(__dirname, rel);
  if (fileExists(full)) log(PASS, `${label}: ${rel}`);
  else                  log(FAIL, `${label} MISSING: ${rel}`, 'This file is required');
}

// ════════════════════════════════════════════════════════
// 3. DEPENDENCIES
// ════════════════════════════════════════════════════════
section('3. DEPENDENCIES');
const pkgPath = path.join(__dirname, 'package.json');
if (!fileExists(pkgPath)) {
  log(FAIL, 'package.json not found');
} else {
  const pkg = JSON.parse(readFile(pkgPath));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  const required = [
    '@whiskeysockets/baileys',
    'firebase-admin',
    'express',
    'express-session',
    'connect-session-firestore',
    'bcryptjs',
    'dotenv',
    'uuid',
    'helmet',
    'express-rate-limit',
    'qrcode',
    'ws',
  ];
  for (const dep of required) {
    const nodeModPath = path.join(__dirname, 'node_modules', dep);
    const inPkg       = !!deps[dep];
    const installed   = fileExists(nodeModPath);

    if (inPkg && installed)   log(PASS, `${dep}@${deps[dep]} — installed`);
    else if (inPkg)           log(FAIL, `${dep} in package.json but NOT installed`, 'Run: npm install');
    else                      log(FAIL, `${dep} MISSING from package.json`, `Run: npm install ${dep}`);
  }
}

// ════════════════════════════════════════════════════════
// 4. ENVIRONMENT VARIABLES
// ════════════════════════════════════════════════════════
section('4. ENVIRONMENT VARIABLES');

const requiredVars = [
  ['FIREBASE_PROJECT_ID',    'Firebase project ID'],
  ['FIREBASE_CLIENT_EMAIL',  'Firebase service account email'],
  ['FIREBASE_PRIVATE_KEY',   'Firebase service account private key'],
  ['FIREBASE_PRIVATE_KEY_ID','Firebase private key ID'],
  ['FIREBASE_CLIENT_ID',     'Firebase client ID'],
  ['FIREBASE_DATABASE_URL',  'Firebase Realtime DB URL'],
  ['SESSION_SECRET',         'Express session secret'],
  ['ADMIN_EMAIL',            'Admin panel email'],
  ['ADMIN_PASSWORD',         'Admin panel password'],
];

const optionalVars = [
  ['RAPIDAPI_KEY',    'YouTube/TikTok downloader'],
  ['HADITH_API_KEY',  'Hadith API'],
  ['OMDB_API_KEY',    'Movie info API'],
];

for (const [varName, desc] of requiredVars) {
  const val = process.env[varName];
  if (!val) {
    log(FAIL, `${varName} — NOT SET`, `Required for: ${desc}`);
  } else if (varName === 'FIREBASE_PRIVATE_KEY') {
    const cleaned = val.replace(/\\n/g, '\n').trim().replace(/^["']|["']$/g, '');
    if (cleaned.startsWith('-----BEGIN PRIVATE KEY-----')) {
      log(PASS, `${varName} — set and format looks correct`);
    } else {
      log(FAIL, `${varName} — WRONG FORMAT`, 'Must start with: -----BEGIN PRIVATE KEY-----');
    }
  } else if (varName === 'SESSION_SECRET' && val.length < 20) {
    log(WARN, `${varName} — too short`, 'Use at least 32 random characters for security');
  } else if (varName === 'FIREBASE_DATABASE_URL' && !val.includes('firebasedatabase.app')) {
    log(WARN, `${varName} — may be incorrect`, 'Expected: https://PROJECT-default-rtdb.REGION.firebasedatabase.app');
  } else {
    log(PASS, `${varName} — set`);
  }
}

console.log('');
for (const [varName, desc] of optionalVars) {
  if (process.env[varName]) log(PASS, `${varName} — set (optional)`);
  else                      log(WARN, `${varName} — not set`, `Optional: ${desc} commands will fail`);
}

// ════════════════════════════════════════════════════════
// 5. FIREBASE CONNECTIVITY TEST
// ════════════════════════════════════════════════════════
section('5. FIREBASE CONNECTIVITY TEST');

async function testFirebase() {
  try {
    const firebaseModule = require('./src/firebase/config');

    if (!firebaseModule.initOk) {
      log(FAIL, 'Firebase initialization failed', 'Check FIREBASE_* variables above');
      return;
    }

    log(PASS, 'Firebase Admin SDK initialized');

    // Test Firestore read
    try {
      const db   = firebaseModule.db;
      const ping = await db.collection('_health').doc('ping').get();
      log(PASS, 'Firestore connection — OK', `Latency test passed (doc exists: ${ping.exists})`);
    } catch (err) {
      if (err.code === 5 || err.message.includes('NOT_FOUND')) {
        // Document doesn't exist but connection works
        log(PASS, 'Firestore connection — OK', 'Connected (health collection not found — this is fine)');
      } else {
        log(FAIL, 'Firestore connection — FAILED', err.message);
      }
    }

    // Test RTDB
    try {
      const rtdb = firebaseModule.rtdb;
      await rtdb.ref('.info/connected').once('value');
      log(PASS, 'Realtime Database connection — OK');
    } catch (err) {
      log(WARN, 'Realtime Database connection — issue', err.message);
    }

    // Test session store
    try {
      const session = require('express-session');
      const ConnectSessionFirestore = require('connect-session-firestore')(session);
      const store = new ConnectSessionFirestore({
        database:   firebaseModule.db,
        collection: 'express_sessions',
      });
      log(PASS, 'connect-session-firestore — initialized successfully');
    } catch (err) {
      log(FAIL, 'connect-session-firestore — FAILED', err.message);
    }

  } catch (err) {
    log(FAIL, 'Firebase module load failed', err.message);
  }
}

// ════════════════════════════════════════════════════════
// 6. BAILEYS VERSION
// ════════════════════════════════════════════════════════
section('6. BAILEYS VERSION');
try {
  const pkgB = JSON.parse(readFile(
    path.join(__dirname, 'node_modules/@whiskeysockets/baileys/package.json')
  ));
  log(PASS, `Baileys v${pkgB.version} installed`);
} catch {
  log(FAIL, '@whiskeysockets/baileys not installed', 'Run: npm install');
}

// ════════════════════════════════════════════════════════
// 7. AUTH FOLDER STATUS
// ════════════════════════════════════════════════════════
section('7. AUTH_INFO_BAILEYS (Local Sessions)');
const authBase = path.join(__dirname, 'src', 'auth_info_baileys');
if (!fileExists(authBase)) {
  log(WARN, 'auth_info_baileys folder not found', 'Will be created on first bot start — OK for fresh deploy');
} else {
  const sessions = fs.readdirSync(authBase).filter(f =>
    fs.statSync(path.join(authBase, f)).isDirectory()
  );
  if (sessions.length === 0) {
    log(WARN, 'No session folders found', 'Bot will need QR/pair code on next start');
  } else {
    log(PASS, `${sessions.length} session folder(s) found`);
    for (const s of sessions) {
      const hasCreds = fileExists(path.join(authBase, s, 'creds.json'));
      if (hasCreds) log(PASS, `  ${s} — creds.json present`);
      else          log(WARN, `  ${s} — no creds.json (needs QR/pair code)`);
    }
  }
}

// ════════════════════════════════════════════════════════
// RUN ASYNC TEST + SUMMARY
// ════════════════════════════════════════════════════════
testFirebase().then(() => {
  console.log(`\n${BOLD}${CYAN}━━━ SUMMARY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  console.log(`  ${GREEN}✅ PASSED  : ${totalPass}${RESET}`);
  console.log(`  ${RED}❌ FAILED  : ${totalFail}${RESET}`);
  console.log(`  ${YELLOW}⚠️  WARNINGS: ${totalWarn}${RESET}`);

  if (totalFail === 0 && totalWarn <= 2) {
    console.log(`\n  ${GREEN}${BOLD}🎉 Bot is fully ready to run! → npm start${RESET}`);
  } else if (totalFail === 0) {
    console.log(`\n  ${YELLOW}${BOLD}⚠️  No critical errors — fix warnings for best performance.${RESET}`);
  } else {
    console.log(`\n  ${RED}${BOLD}🔴 Fix all ❌ FAILED checks before running the bot.${RESET}`);
  }
  console.log(`\n${CYAN}  Run anytime: ${BOLD}node diagnose.js${RESET}\n`);
  process.exit(totalFail > 0 ? 1 : 0);
}).catch(err => {
  console.error('\nDiagnostic error:', err.message);
  process.exit(1);
});
