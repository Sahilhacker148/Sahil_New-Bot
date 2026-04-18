const axios  = require('axios');
const config = require('../config/config');
const { logger, isValidUrl, truncate } = require('../utils/helpers');

// ─── AXIOS INSTANCE ───────────────────────────────────────
const api = axios.create({ timeout: config.apis.timeout || 15000 });

// ─── YOUTUBE MP3 ──────────────────────────────────────────
async function downloadYouTubeMP3(url) {
  try {
    if (!isValidUrl(url)) throw new Error('Invalid URL');
    const videoId = url.match(/(?:v=|youtu\.be\/)([^&\s]+)/)?.[1];
    if (!videoId) throw new Error('Invalid YouTube URL');
    if (!config.apis.rapidApiKey) throw new Error('RAPIDAPI_KEY not configured');
    const res = await api.get(
      `https://${config.apis.youtubeHost}/get_mp3_download_link/${videoId}`,
      {
        params: { quality: 'low', wait_until_the_file_is_ready: 'false' },
        headers: { 'x-rapidapi-host': config.apis.youtubeHost, 'x-rapidapi-key': config.apis.rapidApiKey }
      }
    );
    return res.data;
  } catch (err) { logger.error('YT MP3 error:', err.message); return null; }
}

// ─── YOUTUBE VIDEO INFO ───────────────────────────────────
async function getYouTubeInfo(url) {
  try {
    if (!isValidUrl(url)) throw new Error('Invalid URL');
    const videoId = url.match(/(?:v=|youtu\.be\/)([^&\s]+)/)?.[1];
    if (!videoId) throw new Error('Invalid YouTube URL');
    const res = await api.get(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    return {
      title:    res.data.title || 'Unknown',
      author:   res.data.author_name || 'Unknown',
      thumbnail: res.data.thumbnail_url || '',
    };
  } catch (err) { logger.error('YT Info error:', err.message); return null; }
}

// ─── TIKTOK DOWNLOADER ────────────────────────────────────
async function downloadTikTok(url) {
  try {
    if (!isValidUrl(url)) throw new Error('Invalid TikTok URL');
    const res = await api.post('https://www.tikwm.com/api/', new URLSearchParams({ url, hd: '0' }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const d = res.data?.data;
    if (!d) return null;
    return { videoUrl: d.play || d.wmplay, title: d.title || '', author: d.author?.nickname || '', duration: d.duration || 0 };
  } catch (err) { logger.error('TikTok error:', err.message); return null; }
}

// ─── WEATHER ──────────────────────────────────────────────
async function getWeather(city) {
  try {
    const res = await api.get(`${config.apis.weather}/${encodeURIComponent(city)}?format=j1`);
    const d   = res.data.current_condition[0];
    return {
      temp: d.temp_C, feels: d.FeelsLikeC, desc: d.weatherDesc[0].value,
      humidity: d.humidity, wind: d.windspeedKmph, visibility: d.visibility, uvIndex: d.uvIndex,
    };
  } catch (err) { logger.error('Weather error:', err.message); return null; }
}

// ─── QURAN ────────────────────────────────────────────────
async function getQuran(surah, ayah) {
  try {
    const [arRes, enRes] = await Promise.all([
      api.get(`${config.apis.quran}/ayah/${surah}:${ayah}/ar`),
      api.get(`${config.apis.quran}/ayah/${surah}:${ayah}/en.asad`),
    ]);
    let urduText = '';
    try { const u = await api.get(`${config.apis.quran}/ayah/${surah}:${ayah}/ur.junagarhi`); urduText = u.data.data.text; }
    catch { urduText = '(Urdu unavailable)'; }
    return {
      arabic: arRes.data.data.text, urdu: urduText, english: enRes.data.data.text,
      surahName: arRes.data.data.surah.englishName, number: `${surah}:${ayah}`, juz: arRes.data.data.juz,
    };
  } catch (err) { logger.error('Quran error:', err.message); return null; }
}

// ─── QURAN SURAH INFO ─────────────────────────────────────
async function getQuranSurah(surahNum) {
  try {
    const res = await api.get(`${config.apis.quran}/surah/${surahNum}`);
    const d   = res.data.data;
    return { name: d.englishName, arabicName: d.name, meaning: d.englishNameTranslation, ayahs: d.numberOfAyahs, revelationType: d.revelationType };
  } catch (err) { logger.error('Surah error:', err.message); return null; }
}

// ─── PRAYER TIMES ─────────────────────────────────────────
async function getPrayerTimes(city, country = 'Pakistan') {
  try {
    const res = await api.get(`${config.apis.prayer}?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&method=1`);
    return res.data.data.timings;
  } catch (err) { logger.error('Prayer error:', err.message); return null; }
}

// ─── DUA ──────────────────────────────────────────────────
async function getRandomDua() {
  try {
    const res  = await api.get(config.apis.dua);
    const duas = res.data;
    if (!Array.isArray(duas) || !duas.length) return null;
    const dua = duas[Math.floor(Math.random() * duas.length)];
    if (typeof dua === 'string') return dua;
    return dua.dua || dua.text || dua.arabic || JSON.stringify(dua).slice(0, 400);
  } catch (err) { logger.error('Dua error:', err.message); return null; }
}

// ─── HADITH ───────────────────────────────────────────────
async function getRandomHadith() {
  try {
    if (!config.apis.hadithApiKey) return null;
    const res  = await api.get(`${config.apis.hadith}?apiKey=${config.apis.hadithApiKey}&limit=10`);
    const list = res.data?.hadiths?.data;
    if (!list || !list.length) return null;
    const h = list[Math.floor(Math.random() * list.length)];
    return { book: h.book?.bookName || 'Unknown', number: h.hadithNumber || '', text: truncate(h.hadithEnglish || '', 600) };
  } catch (err) { logger.error('Hadith error:', err.message); return null; }
}

// ─── TRANSLATE ────────────────────────────────────────────
async function translateText(text, targetLang = 'en') {
  try {
    const url = `${config.apis.translate}${encodeURIComponent(text)}&tl=${targetLang}`;
    const res = await api.get(url);
    return res.data?.[0]?.map?.(s => s?.[0]).filter(Boolean).join('') || null;
  } catch (err) { logger.error('Translate error:', err.message); return null; }
}

// ─── URL SHORTENER ────────────────────────────────────────
async function shortenUrl(url) {
  try {
    if (!isValidUrl(url)) return null;
    const res = await api.get(`${config.apis.urlShorten}${encodeURIComponent(url)}`);
    return typeof res.data === 'string' ? res.data.trim() : null;
  } catch (err) { logger.error('URL shorten error:', err.message); return null; }
}

// ─── CRYPTO ───────────────────────────────────────────────
async function getCryptoPrice(coin) {
  try {
    const res  = await api.get(`${config.apis.crypto}?ids=${encodeURIComponent(coin)}&vs_currencies=usd,pkr&include_24hr_change=true`);
    const data = res.data[coin];
    if (!data) return null;
    return { usd: data.usd, pkr: data.pkr, change24h: (data.usd_24h_change || 0).toFixed(2) };
  } catch (err) { logger.error('Crypto error:', err.message); return null; }
}

// ─── TOP CRYPTOS ──────────────────────────────────────────
async function getTopCryptos() {
  try {
    const res = await api.get('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1');
    return res.data.map(c => ({ name: c.name, symbol: c.symbol.toUpperCase(), price: c.current_price, change: c.price_change_percentage_24h?.toFixed(2) }));
  } catch (err) { logger.error('Top crypto error:', err.message); return null; }
}

// ─── CURRENCY RATES ───────────────────────────────────────
async function getCurrencyRates(baseCurrency = 'USD') {
  try {
    const res = await api.get(`${config.apis.currency}${baseCurrency.toUpperCase()}`);
    return res.data?.rates || null;
  } catch (err) { logger.error('Currency error:', err.message); return null; }
}

// ─── WIKIPEDIA ────────────────────────────────────────────
async function getWikipedia(query) {
  try {
    const res  = await api.get(`${config.apis.wikipedia}${encodeURIComponent(query)}`);
    const data = res.data;
    if (!data || data.type?.includes('not_found')) return null;
    return { title: data.title, summary: truncate(data.extract, 600), url: data.content_urls?.desktop?.page || '' };
  } catch (err) { logger.error('Wikipedia error:', err.message); return null; }
}

// ─── DICTIONARY ───────────────────────────────────────────
async function getDictionary(word) {
  try {
    const res     = await api.get(`${config.apis.dictionary}${encodeURIComponent(word)}`);
    const data    = res.data?.[0];
    if (!data) return null;
    const meaning = data.meanings?.[0];
    const def     = meaning?.definitions?.[0];
    return {
      word: data.word, phonetic: data.phonetic || '',
      partOfSpeech: meaning?.partOfSpeech || '', meaning: def?.definition || '',
      example: def?.example || '', synonyms: (def?.synonyms || []).slice(0, 5).join(', ') || 'N/A',
    };
  } catch (err) { logger.error('Dictionary error:', err.message); return null; }
}

// ─── NEWS ─────────────────────────────────────────────────
async function getNews() {
  try {
    const res = await api.get(config.apis.news);
    return (res.data?.items || []).slice(0, 5).filter(a => a.title).map(a => ({ title: a.title, link: a.link || '' }));
  } catch (err) { logger.error('News error:', err.message); return []; }
}

// ─── SIM INFO ─────────────────────────────────────────────
async function getSimInfo(number) {
  try {
    const clean = number.replace(/[^0-9]/g, '');
    const res   = await api.get(`${config.apis.simDb}${clean}`);
    return res.data || null;
  } catch (err) { logger.error('SIM info error:', err.message); return null; }
}

// ─── GITHUB USER ──────────────────────────────────────────
async function getGithubUser(username) {
  try {
    const res = await api.get(`https://api.github.com/users/${encodeURIComponent(username)}`);
    const d   = res.data;
    return {
      name: d.name || d.login, login: d.login, bio: d.bio || 'No bio',
      repos: d.public_repos, followers: d.followers, following: d.following,
      location: d.location || 'Unknown', url: d.html_url,
    };
  } catch (err) { logger.error('GitHub error:', err.message); return null; }
}

// ─── NPM PACKAGE INFO ─────────────────────────────────────
async function getNpmPackage(pkg) {
  try {
    const res = await api.get(`https://registry.npmjs.org/${encodeURIComponent(pkg)}/latest`);
    const d   = res.data;
    return { name: d.name, version: d.version, description: truncate(d.description || '', 200), author: d.author?.name || 'Unknown', license: d.license || 'N/A' };
  } catch (err) { logger.error('NPM error:', err.message); return null; }
}

// ─── IP INFO ──────────────────────────────────────────────
async function getIpInfo(ip) {
  try {
    const res = await api.get(`https://ipapi.co/${encodeURIComponent(ip)}/json/`);
    const d   = res.data;
    if (d.error) return null;
    return { ip: d.ip, city: d.city, region: d.region, country: d.country_name, org: d.org, timezone: d.timezone };
  } catch (err) { logger.error('IP info error:', err.message); return null; }
}

// ─── COVID STATS ──────────────────────────────────────────
async function getCovidStats(country = 'Pakistan') {
  try {
    const res = await api.get(`https://disease.sh/v3/covid-19/countries/${encodeURIComponent(country)}`);
    const d   = res.data;
    return { country: d.country, cases: d.cases?.toLocaleString(), deaths: d.deaths?.toLocaleString(), recovered: d.recovered?.toLocaleString(), active: d.active?.toLocaleString(), todayCases: d.todayCases?.toLocaleString() };
  } catch (err) { logger.error('COVID error:', err.message); return null; }
}

// ─── JOKE API ─────────────────────────────────────────────
async function getOnlineJoke() {
  try {
    const res = await api.get('https://v2.jokeapi.dev/joke/Any?blacklistFlags=nsfw,racist,sexist&type=twopart');
    if (res.data.type === 'twopart') return `${res.data.setup}\n\n${res.data.delivery}`;
    return res.data.joke || null;
  } catch (err) { logger.error('Joke API error:', err.message); return null; }
}

// ─── RANDOM QUOTE API ─────────────────────────────────────
async function getOnlineQuote() {
  try {
    const res = await api.get('https://api.quotable.io/random');
    return { text: res.data.content, author: res.data.author };
  } catch (err) { logger.error('Quote API error:', err.message); return null; }
}

// ─── ADVICE ───────────────────────────────────────────────
async function getAdvice() {
  try {
    const res = await api.get('https://api.adviceslip.com/advice');
    return res.data?.slip?.advice || null;
  } catch (err) { logger.error('Advice error:', err.message); return null; }
}

// ─── CAT FACT ─────────────────────────────────────────────
async function getCatFact() {
  try {
    const res = await api.get('https://catfact.ninja/fact');
    return res.data?.fact || null;
  } catch (err) { logger.error('Cat fact error:', err.message); return null; }
}

// ─── DOG FACT ─────────────────────────────────────────────
async function getDogFact() {
  try {
    const res = await api.get('https://dogapi.dog/api/v2/facts?limit=1');
    return res.data?.data?.[0]?.attributes?.body || null;
  } catch (err) { logger.error('Dog fact error:', err.message); return null; }
}

// ─── COUNTRY INFO ─────────────────────────────────────────
async function getCountryInfo(country) {
  try {
    const res = await api.get(`https://restcountries.com/v3.1/name/${encodeURIComponent(country)}?fullText=false`);
    const d   = res.data[0];
    return {
      name: d.name.common, capital: d.capital?.[0] || 'N/A',
      population: d.population?.toLocaleString(), region: d.region,
      currency: Object.values(d.currencies || {})[0]?.name || 'N/A',
      languages: Object.values(d.languages || {}).join(', '),
      flag: d.flag || '',
    };
  } catch (err) { logger.error('Country error:', err.message); return null; }
}

// ─── MOVIE INFO ───────────────────────────────────────────
async function getMovieInfo(title) {
  try {
    const omdbKey = config.apis.omdbApiKey || process.env.OMDB_API_KEY;
    if (!omdbKey) return null;
    const res = await api.get(`https://www.omdbapi.com/?t=${encodeURIComponent(title)}&apikey=${omdbKey}`);
    const d   = res.data;
    if (d.Response === 'False') return null;
    return { title: d.Title, year: d.Year, genre: d.Genre, director: d.Director, rating: d.imdbRating, plot: truncate(d.Plot, 300), runtime: d.Runtime };
  } catch (err) { logger.error('Movie error:', err.message); return null; }
}

// ─── PROGRAMMING JOKE ─────────────────────────────────────
async function getProgrammingJoke() {
  try {
    const res = await api.get('https://v2.jokeapi.dev/joke/Programming?type=twopart');
    return res.data.type === 'twopart' ? `${res.data.setup}\n\n${res.data.delivery}` : res.data.joke;
  } catch (err) { logger.error('Programming joke error:', err.message); return null; }
}

// ─── RANDOM WORD ──────────────────────────────────────────
async function getRandomWord() {
  try {
    const res = await api.get('https://random-word-api.herokuapp.com/word?number=1');
    return res.data?.[0] || null;
  } catch (err) { logger.error('Random word error:', err.message); return null; }
}

// ─── RIDDLE ───────────────────────────────────────────────
async function getRiddle() {
  try {
    const res = await api.get('https://riddles-api.vercel.app/random');
    return { question: res.data.riddle, answer: res.data.answer };
  } catch (err) { logger.error('Riddle error:', err.message); return null; }
}

// ─── USELESS FACT ─────────────────────────────────────────
async function getUselessFact() {
  try {
    const res = await api.get('https://uselessfacts.jsph.pl/api/v2/facts/random');
    return res.data?.text || null;
  } catch (err) { logger.error('Useless fact error:', err.message); return null; }
}

// ─── NUMBER FACT ──────────────────────────────────────────
async function getNumberFact(num) {
  try {
    const res = await api.get(`http://numbersapi.com/${num}`);
    return typeof res.data === 'string' ? res.data : null;
  } catch (err) { logger.error('Number fact error:', err.message); return null; }
}

// ─── AGE CALCULATOR ───────────────────────────────────────
function calculateAge(birthdate) {
  const birth = new Date(birthdate);
  if (isNaN(birth.getTime())) return null;
  const now   = new Date();
  let years   = now.getFullYear() - birth.getFullYear();
  let months  = now.getMonth() - birth.getMonth();
  let days    = now.getDate() - birth.getDate();
  if (days < 0)   { months--; days += new Date(now.getFullYear(), now.getMonth(), 0).getDate(); }
  if (months < 0) { years--;  months += 12; }
  const totalDays = Math.floor((now - birth) / (1000 * 60 * 60 * 24));
  return { years, months, days, totalDays };
}

// ─── BMI CALCULATOR ───────────────────────────────────────
function calculateBMI(weightKg, heightCm) {
  const h   = heightCm / 100;
  const bmi = (weightKg / (h * h)).toFixed(1);
  let category = '';
  if      (bmi < 18.5) category = 'Underweight 🔵';
  else if (bmi < 25)   category = 'Normal ✅';
  else if (bmi < 30)   category = 'Overweight 🟡';
  else                 category = 'Obese 🔴';
  return { bmi, category };
}

// ─── PASSWORD GENERATOR ───────────────────────────────────
function generatePassword(length = 12) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  const bytes = require('crypto').randomBytes(Math.min(length, 32));
  return Array.from(bytes).map(b => chars[b % chars.length]).join('');
}

// ─── BASE64 ENCODE/DECODE ─────────────────────────────────
function encodeBase64(text) { try { return Buffer.from(text).toString('base64'); } catch { return null; } }
function decodeBase64(text) { try { return Buffer.from(text, 'base64').toString('utf-8'); } catch { return null; } }

// ─── COLOR INFO ───────────────────────────────────────────
async function getColorInfo(hex) {
  try {
    const clean = hex.replace('#', '');
    const res   = await api.get(`https://www.thecolorapi.com/id?hex=${clean}`);
    const d     = res.data;
    return { name: d.name.value, hex: d.hex.value, rgb: `${d.rgb.r}, ${d.rgb.g}, ${d.rgb.b}`, hsl: `${d.hsl.h}°, ${d.hsl.s}%, ${d.hsl.l}%` };
  } catch (err) { logger.error('Color error:', err.message); return null; }
}

// ─── MORSE CODE ───────────────────────────────────────────
function toMorse(text) {
  const map = {
    A:'.-',B:'-...',C:'-.-.',D:'-..',E:'.',F:'..-.',G:'--.',H:'....',I:'..',J:'.---',K:'-.-',
    L:'.-..',M:'--',N:'-.',O:'---',P:'.--.',Q:'--.-',R:'.-.',S:'...',T:'-',U:'..-',V:'...-',
    W:'.--',X:'-..-',Y:'-.--',Z:'--..',
    '0':'-----','1':'.----','2':'..---','3':'...--','4':'....-','5':'.....',
    '6':'-....','7':'--...','8':'---..','9':'----.',
    ' ':'/','.':'.-.-.-',',':'--..--','?':'..--..','!':'-.-.--',
  };
  return text.toUpperCase().split('').map(c => map[c] || '?').join(' ');
}

function fromMorse(morse) {
  const map = {
    '.-':'A','-...':'B','-.-.':'C','-..':'D','.':'E','..-.':'F','--.':'G','....':'H','..':'I',
    '.---':'J','-.-':'K','.-..':'L','--':'M','-.':'N','---':'O','.--.':'P','--.-':'Q','.-.':'R',
    '...':'S','-':'T','..-':'U','...-':'V','.--':'W','-..-':'X','-.--':'Y','--..':'Z',
    '-----':'0','.----':'1','..---':'2','...--':'3','....-':'4','.....':'5',
    '-....':'6','--...':'7','---..':'8','----.':'9','/':' ',
  };
  return morse.split(' ').map(c => map[c] || '?').join('');
}

// ─── BINARY ENCODE/DECODE ─────────────────────────────────
function toBinary(text) {
  return text.split('').map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' ');
}
function fromBinary(bin) {
  try { return bin.split(' ').map(b => String.fromCharCode(parseInt(b, 2))).join(''); }
  catch { return null; }
}

// ─── LOVE METER ───────────────────────────────────────────
function getLoveMeter(name1, name2) {
  const combined = (name1 + name2).toLowerCase().replace(/\s/g, '');
  let seed = 0;
  for (const c of combined) seed += c.charCodeAt(0);
  const percent = (seed % 71) + 30; // 30–100
  let emoji = percent >= 80 ? '💞 Perfect Match!' : percent >= 60 ? '💕 Good Match!' : '💔 Needs Work!';
  return { percent, emoji };
}

// ─── HOROSCOPE ────────────────────────────────────────────
function getHoroscope(sign) {
  const signs = {
    aries:       '🐏 Aries (Mar 21 – Apr 19)',
    taurus:      '🐂 Taurus (Apr 20 – May 20)',
    gemini:      '👯 Gemini (May 21 – Jun 20)',
    cancer:      '🦀 Cancer (Jun 21 – Jul 22)',
    leo:         '🦁 Leo (Jul 23 – Aug 22)',
    virgo:       '🌾 Virgo (Aug 23 – Sep 22)',
    libra:       '⚖️ Libra (Sep 23 – Oct 22)',
    scorpio:     '🦂 Scorpio (Oct 23 – Nov 21)',
    sagittarius: '🏹 Sagittarius (Nov 22 – Dec 21)',
    capricorn:   '🐐 Capricorn (Dec 22 – Jan 19)',
    aquarius:    '🏺 Aquarius (Jan 20 – Feb 18)',
    pisces:      '🐟 Pisces (Feb 19 – Mar 20)',
  };
  const readings = [
    'Today brings positive energy your way. Trust your instincts. 🌟',
    'Focus on your goals. Hard work will pay off this week. 💪',
    'A surprise is coming. Stay open to new opportunities. 🎁',
    'Relationships are your strength today. Connect with loved ones. 💕',
    'Financial decisions need careful thought. Patience is key. 💰',
    'Your creativity is at a peak. Use it wisely. 🎨',
    'Take a step back and rest. Your energy needs recharging. 🌙',
    'Bold moves lead to great rewards today. Be brave. 🔥',
  ];
  const s = sign.toLowerCase();
  if (!signs[s]) return null;
  return { sign: signs[s], reading: readings[Math.floor(Math.random() * readings.length)] };
}

// ─── ZODIAC SIGN ──────────────────────────────────────────
function getZodiacSign(day, month) {
  const d = parseInt(day), m = parseInt(month);
  if ((m === 3 && d >= 21) || (m === 4 && d <= 19)) return 'Aries ♈';
  if ((m === 4 && d >= 20) || (m === 5 && d <= 20)) return 'Taurus ♉';
  if ((m === 5 && d >= 21) || (m === 6 && d <= 20)) return 'Gemini ♊';
  if ((m === 6 && d >= 21) || (m === 7 && d <= 22)) return 'Cancer ♋';
  if ((m === 7 && d >= 23) || (m === 8 && d <= 22)) return 'Leo ♌';
  if ((m === 8 && d >= 23) || (m === 9 && d <= 22)) return 'Virgo ♍';
  if ((m === 9 && d >= 23) || (m === 10 && d <= 22)) return 'Libra ♎';
  if ((m === 10 && d >= 23) || (m === 11 && d <= 21)) return 'Scorpio ♏';
  if ((m === 11 && d >= 22) || (m === 12 && d <= 21)) return 'Sagittarius ♐';
  if ((m === 12 && d >= 22) || (m === 1 && d <= 19)) return 'Capricorn ♑';
  if ((m === 1 && d >= 20) || (m === 2 && d <= 18)) return 'Aquarius ♒';
  return 'Pisces ♓';
}

// ─── WORLD TIME ───────────────────────────────────────────
async function getWorldTime(timezone) {
  try {
    const res = await api.get(`https://worldtimeapi.org/api/timezone/${encodeURIComponent(timezone)}`);
    const d   = res.data;
    return { timezone: d.timezone, datetime: d.datetime?.slice(0, 19).replace('T', ' '), utcOffset: d.utc_offset, dayOfWeek: d.day_of_week };
  } catch (err) { logger.error('World time error:', err.message); return null; }
}

// ─── LYRICS SEARCH (no-key API) ───────────────────────────
async function getLyrics(artist, title) {
  try {
    const res = await api.get(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`);
    return res.data?.lyrics ? truncate(res.data.lyrics, 800) : null;
  } catch (err) { logger.error('Lyrics error:', err.message); return null; }
}

module.exports = {
  downloadYouTubeMP3, getYouTubeInfo, downloadTikTok,
  getWeather, getQuran, getQuranSurah, getPrayerTimes, getRandomDua, getRandomHadith,
  translateText, shortenUrl, getCryptoPrice, getTopCryptos, getCurrencyRates,
  getWikipedia, getDictionary, getNews, getSimInfo,
  getGithubUser, getNpmPackage, getIpInfo, getCovidStats,
  getOnlineJoke, getOnlineQuote, getAdvice, getCatFact, getDogFact,
  getCountryInfo, getMovieInfo, getProgrammingJoke, getRandomWord,
  getRiddle, getUselessFact, getNumberFact,
  calculateAge, calculateBMI, generatePassword,
  encodeBase64, decodeBase64, toBinary, fromBinary, toMorse, fromMorse,
  getColorInfo, getLoveMeter, getHoroscope, getZodiacSign,
  getWorldTime, getLyrics,
};
