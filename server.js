const express  = require('express');
const session  = require('express-session');
const axios    = require('axios');
const path     = require('path');
const multer   = require('multer');
const fs       = require('fs');
const http     = require('http');
const { Server } = require('socket.io');
const { MongoClient, ObjectId } = require('mongodb');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

// ─────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────
const GUILD_ID       = '1421088112808951852';
const STAFF_ROLE_ID  = '1471530512622555297';
const ADMIN_ROLE_ID  = '1471922925681639625';
const ALLOWED_TWEET_ROLE = '1471546898794942646';
const TOP_CODENAMES_ROLE = '1481684788996739143';

const STAFF_ORDER = [
  { id: '1419397797504880842', name: 'مالك السيرفر',          isUser: true,  color: '#ffd700' },
  { id: '1471245881243210049', name: 'مسؤولون Live Zone',     isUser: false, color: '#ff4444' },
  { id: '1471922925681639625', name: 'مسؤول طاقم البرمجة',   isUser: false, color: '#00c8ff' },
  { id: '1473438259374985286', name: 'طاقم البرمجة',          isUser: false, color: '#7289da' },
  { id: '1471539929501925560', name: 'رئيس الادارة',          isUser: false, color: '#ff9900' },
  { id: STAFF_ROLE_ID,         name: 'فريق الادارة',          isUser: false, color: '#23a55a' },
];

const RP_ROLES = {
  '1471551621337972938': { name: 'وزير العدل',        color: '#ff9900' },
  '1474275740756480389': { name: 'قائد قطاع CIA',     color: '#00c8ff' },
  '1471575274222125236': { name: 'قائد الشرطة',       color: '#4a90d9' },
  '1474276207225733170': { name: 'أعضاء CIA',          color: '#0099cc' },
  '1471908537331617976': { name: 'أعضاء LSPD',         color: '#2266cc' },
  '1471915477063176467': { name: 'وزير الدفاع المدني', color: '#33aa55' },
  '1471916760826511524': { name: 'وزير الصحة',         color: '#ff5555' },
  '1472606415892774972': { name: 'المجرمون',            color: '#aa0000' },
};

const CIA_ROLE_IDS  = ['1474275740756480389', '1474276207225733170'];
const LSPD_ROLE_IDS = ['1471575274222125236', '1471908537331617976'];

const WH_LOGIN        = 'https://discord.com/api/webhooks/1477005402397737112/kTgSPRMiM-RjGygKYmstFoERZl-IDro83Inhy9_iSuOPNHYO0q2imUNAxKAQfgTFycGR';
const WH_ANNOUNCEMENT = 'https://discord.com/api/webhooks/1477037146727514314/EnsU8mfgA4f-Z_HLbIZMmtcFkFi_t_ZfhCkBkl7HEr8ynugPZelL-eJxEr1nkt_r4QCV';
const WH_TWEET        = 'https://discord.com/api/webhooks/1477197386177581251/PAPrerLB2K4gvSmE5fPMX23bkI6ljAu_pvRU-PI5K-ujdg4L_T-e1djsHnEAwIIYBZR8';

// ─────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

function getBaseUrl() {
  if (process.env.REDIRECT_URI)          return process.env.REDIRECT_URI.replace('/auth/callback', '');
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  if (process.env.RAILWAY_STATIC_URL)    return process.env.RAILWAY_STATIC_URL;
  return `http://localhost:${PORT}`;
}

const BASE_URL     = getBaseUrl();
const REDIRECT_URI = `${BASE_URL}/auth/callback`;

const CONFIG = {
  CLIENT_ID:      process.env.CLIENT_ID      || '1476983875598024824',
  CLIENT_SECRET:  process.env.CLIENT_SECRET  || '',
  SESSION_SECRET: process.env.SESSION_SECRET || 'live-zone-secret-2024-xyz',
  BOT_TOKEN:      process.env.BOT_TOKEN      || '',
  BOT_SECRET:     process.env.BOT_SECRET     || 'bot-secret-change-this',
  MONGO_URI:      process.env.MONGO_URI      || 'mongodb+srv://jp1_2026:zoro_amak3@cluster0.gzhivoi.mongodb.net/islam-bot',
  PORT,
};

const DISCORD_API = 'https://discord.com/api/v10';
const SCOPES      = 'identify email guilds';

function buildOAuthUrl() {
  const p = new URLSearchParams({ client_id: CONFIG.CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: 'code', scope: SCOPES });
  return `https://discord.com/oauth2/authorize?${p}`;
}

// ─────────────────────────────────────────────
//  FILE UPLOAD
// ─────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'));
  },
});

// ─────────────────────────────────────────────
//  MONGODB
// ─────────────────────────────────────────────
let db, ratingsCol, announcementsCol, rpCacheCol, tweetsCol, commentsCol;
let ipSessionsCol, codenamesGamesCol, codenamesStatsCol;

async function connectMongo() {
  try {
    const client = new MongoClient(CONFIG.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
    await client.connect();
    db               = client.db('islam-bot');
    ratingsCol       = db.collection('website_ratings');
    announcementsCol = db.collection('website_announcements');
    rpCacheCol       = db.collection('rp_members_cache');
    tweetsCol        = db.collection('website_tweets');
    commentsCol      = db.collection('website_comments');
    ipSessionsCol    = db.collection('ip_sessions');
    codenamesGamesCol = db.collection('codenames_games');
    codenamesStatsCol = db.collection('codenames_stats');

    await tweetsCol.createIndex({ createdAt: -1 });
    await commentsCol.createIndex({ tweetId: 1, createdAt: 1 });
    await ipSessionsCol.createIndex({ ip: 1 });
    await ipSessionsCol.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await codenamesGamesCol.createIndex({ status: 1, createdAt: -1 });
    await codenamesStatsCol.createIndex({ userId: 1 }, { unique: true });

    console.log('MongoDB connected');
    setTimeout(() => syncRpMembers(), 5000);
  } catch(e) {
    console.error('MongoDB error:', e.message);
  }
}

// ─────────────────────────────────────────────
//  DISCORD HELPERS
// ─────────────────────────────────────────────
async function fetchAllMembers() {
  if (!CONFIG.BOT_TOKEN) return [];
  let all = [], lastId = null;
  while (true) {
    const url = lastId
      ? `${DISCORD_API}/guilds/${GUILD_ID}/members?limit=1000&after=${lastId}`
      : `${DISCORD_API}/guilds/${GUILD_ID}/members?limit=1000`;
    const r = await axios.get(url, { headers: { Authorization: `Bot ${CONFIG.BOT_TOKEN}` } });
    all = all.concat(r.data);
    if (r.data.length < 1000) break;
    lastId = r.data[r.data.length - 1].user.id;
  }
  return all;
}

async function getMemberRoles(userId) {
  if (!CONFIG.BOT_TOKEN) return [];
  try {
    const r = await axios.get(`${DISCORD_API}/guilds/${GUILD_ID}/members/${userId}`,
      { headers: { Authorization: `Bot ${CONFIG.BOT_TOKEN}` } });
    return r.data.roles || [];
  } catch { return []; }
}

async function syncRpMembers() {
  if (!rpCacheCol || !CONFIG.BOT_TOKEN) return;
  try {
    const all = await fetchAllMembers();
    const rpMembers = [];
    for (const m of all) {
      const roles = m.roles || [];
      for (const [roleId, roleInfo] of Object.entries(RP_ROLES)) {
        if (roles.includes(roleId)) {
          const u = m.user;
          rpMembers.push({
            userId: u.id,
            username: m.nick || u.global_name || u.username,
            avatar: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64` : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(u.id) % 5n)}.png`,
            roleId,
            roleName: roleInfo.name,
            roleColor: roleInfo.color,
          });
          break;
        }
      }
    }
    await rpCacheCol.deleteMany({});
    if (rpMembers.length > 0) await rpCacheCol.insertMany(rpMembers);
    console.log(`RP cache updated: ${rpMembers.length} members`);
  } catch(e) { console.error('syncRpMembers error:', e.message); }
}

// ─────────────────────────────────────────────
//  WEBHOOKS
// ─────────────────────────────────────────────
async function sendLoginWebhook(user) {
  try {
    const avatar = user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : null;
    await axios.post(WH_LOGIN, {
      embeds: [{
        title: '🔐 تسجيل دخول جديد',
        color: 0x00c8ff,
        thumbnail: avatar ? { url: avatar } : undefined,
        fields: [
          { name: 'المستخدم', value: user.global_name || user.username, inline: true },
          { name: 'المعرف', value: user.id, inline: true },
        ],
        timestamp: new Date().toISOString(),
      }],
    });
  } catch(e) {}
}

async function sendAnnouncementWebhook(title, content, icon, image, postedBy) {
  try {
    await axios.post(WH_ANNOUNCEMENT, {
      embeds: [{
        title: `${icon || '📢'} ${title}`,
        description: content,
        color: 0x00c8ff,
        image: image ? { url: image } : undefined,
        footer: { text: `بواسطة: ${postedBy}` },
        timestamp: new Date().toISOString(),
      }],
    });
  } catch(e) {}
}

async function sendTweetWebhook(tweet, tweetId) {
  try {
    await axios.post(WH_TWEET, {
      embeds: [{
        author: { name: tweet.username, icon_url: tweet.avatar },
        description: tweet.content,
        color: 0x1d9bf0,
        image: tweet.image ? { url: tweet.image } : undefined,
        footer: { text: `تغريدة #${tweetId}` },
        timestamp: new Date().toISOString(),
      }],
    });
  } catch(e) {}
}

// ─────────────────────────────────────────────
//  IP SESSION HELPERS
// ─────────────────────────────────────────────
function getClientIp(req) {
  return (req.headers['x-forwarded-for'] || req.connection.remoteAddress || '').split(',')[0].trim();
}

async function saveIpSession(ip, user, tokens) {
  if (!ipSessionsCol) return;
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  await ipSessionsCol.updateOne(
    { ip },
    { $set: { ip, user, tokens, updatedAt: new Date(), expiresAt } },
    { upsert: true }
  );
}

async function getIpSession(ip) {
  if (!ipSessionsCol) return null;
  const doc = await ipSessionsCol.findOne({ ip, expiresAt: { $gt: new Date() } });
  return doc;
}

async function deleteIpSession(ip) {
  if (!ipSessionsCol) return;
  await ipSessionsCol.deleteOne({ ip });
}

// ─────────────────────────────────────────────
//  CODENAMES WORD LIST (200+ Arabic words)
// ─────────────────────────────────────────────
const CODENAMES_WORDS = [
  // Special words
  'لايف زون', 'فراس',
  // Animals
  'أسد', 'نمر', 'فيل', 'زرافة', 'حصان', 'ذئب', 'ثعلب', 'أرنب', 'قط', 'كلب',
  'دب', 'قرد', 'طاووس', 'نسر', 'دلفين', 'قرش', 'تمساح', 'ثعبان', 'عقرب', 'نحلة',
  // Nature
  'جبل', 'بحر', 'نهر', 'صحراء', 'غابة', 'شلال', 'بركان', 'كهف', 'جزيرة', 'قمر',
  'شمس', 'نجمة', 'سحابة', 'مطر', 'ثلج', 'برق', 'ريح', 'رعد', 'طوفان', 'زلزال',
  // Cities & Places
  'رياض', 'مكة', 'دبي', 'القاهرة', 'بغداد', 'دمشق', 'بيروت', 'عمان', 'الكويت', 'الدوحة',
  'أبوظبي', 'مسقط', 'صنعاء', 'خرطوم', 'تونس', 'الجزائر', 'الرباط', 'طرابلس', 'مدريد', 'باريس',
  // Food
  'تمر', 'قهوة', 'شاي', 'رز', 'خبز', 'لحم', 'سمك', 'فواكه', 'خضار', 'حليب',
  'عسل', 'زيتون', 'تفاح', 'برتقال', 'موز', 'عنب', 'رمان', 'مانجو', 'كنافة', 'بقلاوة',
  // Jobs & People
  'طبيب', 'مهندس', 'معلم', 'شرطي', 'جندي', 'قاضي', 'محامي', 'صياد', 'فلاح', 'تاجر',
  'رئيس', 'وزير', 'أمير', 'ملك', 'فارس', 'شاعر', 'فنان', 'لاعب', 'مدرب', 'حكم',
  // Objects
  'سيف', 'رمح', 'درع', 'خنجر', 'قوس', 'سهم', 'مفتاح', 'قفل', 'كتاب', 'قلم',
  'ساعة', 'مرآة', 'شمعة', 'خيمة', 'سفينة', 'طائرة', 'سيارة', 'دراجة', 'قطار', 'صاروخ',
  // Actions
  'قفز', 'ركض', 'سبح', 'طار', 'حارب', 'هرب', 'بنى', 'هدم', 'زرع', 'حصد',
  'غنى', 'رقص', 'ضحك', 'بكى', 'نام', 'صحا', 'أكل', 'شرب', 'قرأ', 'كتب',
  // Abstract
  'حلم', 'أمل', 'خوف', 'شجاعة', 'وفاء', 'خيانة', 'صداقة', 'عداوة', 'حب', 'كره',
  'سلام', 'حرب', 'عدل', 'ظلم', 'حقيقة', 'كذب', 'سر', 'خطر', 'فوز', 'هزيمة',
  // Technology
  'حاسوب', 'هاتف', 'إنترنت', 'برنامج', 'شبكة', 'ذكاء', 'روبوت', 'كاميرا', 'شاشة', 'لوحة',
  'ذاكرة', 'معالج', 'بيانات', 'تشفير', 'اختراق', 'فيروس', 'دفاع', 'نظام', 'مستخدم', 'كلمة سر',
  // Misc
  'طريق', 'جسر', 'باب', 'نافذة', 'سور', 'برج', 'قصر', 'معبد', 'مسجد', 'كنيسة',
  'سوق', 'مستشفى', 'مدرسة', 'جامعة', 'ميدان', 'ملعب', 'مسرح', 'سينما', 'مكتبة', 'متحف',
  'خريطة', 'بوصلة', 'كنز', 'لغز', 'رموز', 'شفرة', 'رسالة', 'طابع', 'ورقة', 'حبر',
  'ضوء', 'ظلام', 'لون', 'صوت', 'صمت', 'حركة', 'سكون', 'حرارة', 'برودة', 'قوة',
  'ضعف', 'سرعة', 'بطء', 'كبير', 'صغير', 'قديم', 'جديد', 'أول', 'آخر', 'وسط',
];

// ─────────────────────────────────────────────
//  CODENAMES GAME ENGINE
// ─────────────────────────────────────────────
function generateBoard() {
  const shuffled = [...CODENAMES_WORDS].sort(() => Math.random() - 0.5).slice(0, 25);
  // 9 blue, 8 red, 1 assassin, 7 neutral
  const assignments = [
    ...Array(9).fill('blue'),
    ...Array(8).fill('red'),
    ...Array(1).fill('assassin'),
    ...Array(7).fill('neutral'),
  ].sort(() => Math.random() - 0.5);

  return shuffled.map((word, i) => ({
    word,
    team: assignments[i],
    revealed: false,
    revealedBy: null,
  }));
}

// AI spymaster logic
function aiGenerateHint(board, team) {
  const myWords = board.filter(c => c.team === team && !c.revealed).map(c => c.word);
  const badWords = board.filter(c => (c.team !== team && c.team !== 'neutral') && !c.revealed).map(c => c.word);

  // Simple: pick a random word from our team and use it as hint with count 1-2
  if (myWords.length === 0) return { word: 'انتهى', count: 0 };

  const hints = [
    { word: 'مائي', matches: ['بحر', 'نهر', 'شلال', 'دلفين', 'سمك', 'طوفان', 'سباحة'] },
    { word: 'حيوان', matches: ['أسد', 'نمر', 'فيل', 'حصان', 'ذئب', 'ثعلب', 'أرنب', 'قط', 'كلب', 'دب', 'قرد', 'نسر', 'قرش', 'تمساح', 'ثعبان'] },
    { word: 'مدينة', matches: ['رياض', 'مكة', 'دبي', 'القاهرة', 'بغداد', 'دمشق', 'بيروت', 'عمان', 'الكويت', 'الدوحة'] },
    { word: 'طبيعة', matches: ['جبل', 'بحر', 'نهر', 'صحراء', 'غابة', 'شلال', 'بركان', 'كهف', 'جزيرة'] },
    { word: 'قتال', matches: ['سيف', 'رمح', 'درع', 'خنجر', 'قوس', 'سهم', 'حرب', 'جندي', 'شرطي'] },
    { word: 'تقنية', matches: ['حاسوب', 'هاتف', 'إنترنت', 'برنامج', 'شبكة', 'ذكاء', 'روبوت', 'كاميرا'] },
    { word: 'طعام', matches: ['تمر', 'قهوة', 'شاي', 'رز', 'خبز', 'لحم', 'سمك', 'فواكه', 'عسل'] },
    { word: 'مشاعر', matches: ['حلم', 'أمل', 'خوف', 'شجاعة', 'وفاء', 'حب', 'كره', 'سلام'] },
  ];

  let bestHint = null;
  let bestCount = 0;

  for (const hint of hints) {
    const matchingMine = hint.matches.filter(w => myWords.includes(w));
    const hitsBad = hint.matches.some(w => badWords.includes(w));
    if (matchingMine.length > bestCount && !hitsBad) {
      bestCount = matchingMine.length;
      bestHint = hint.word;
    }
  }

  if (!bestHint || bestCount === 0) {
    // fallback: just hint about 1 word
    const pick = myWords[Math.floor(Math.random() * myWords.length)];
    return { word: 'اكتشف', count: 1, targetWords: [pick] };
  }

  const targets = hints.find(h => h.word === bestHint).matches.filter(w => myWords.includes(w));
  return { word: bestHint, count: Math.min(bestCount, 3), targetWords: targets };
}

function aiGuess(board, team, hint, count) {
  // AI picks revealed cards matching the hint targets or random from team
  const myUnrevealed = board.filter(c => c.team === team && !c.revealed);
  if (myUnrevealed.length === 0) return null;

  // Pick random from our team
  const pick = myUnrevealed[Math.floor(Math.random() * myUnrevealed.length)];
  return pick.word;
}

// ─────────────────────────────────────────────
//  MIDDLEWARE
// ─────────────────────────────────────────────
app.set('trust proxy', true);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const isProduction = BASE_URL.startsWith('https://');

app.use(session({
  secret:            CONFIG.SESSION_SECRET,
  resave:            false,
  saveUninitialized: false,
  rolling:           true,
  cookie: {
    secure:   isProduction,
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge:   30 * 24 * 60 * 60 * 1000, // 30 days
  },
}));

// IP-based session auto-restore middleware
app.use(async (req, res, next) => {
  if (!req.session?.user && ipSessionsCol) {
    const ip = getClientIp(req);
    const ipSession = await getIpSession(ip).catch(() => null);
    if (ipSession) {
      req.session.user   = ipSession.user;
      req.session.tokens = ipSession.tokens;
    }
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

const uploadDir = '/tmp/uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));

// ─────────────────────────────────────────────
//  PAGES
// ─────────────────────────────────────────────
app.get('/', (req, res) => {
  if (req.session?.user) return res.redirect('/dashboard');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/dashboard', (req, res) => {
  if (!req.session?.user) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});
app.get('/codenames', (req, res) => {
  if (!req.session?.user) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'codenames.html'));
});

// ─────────────────────────────────────────────
//  AUTH
// ─────────────────────────────────────────────
app.get('/auth/discord', (req, res) => res.redirect(buildOAuthUrl()));

app.get('/auth/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) return res.redirect('/?error=' + encodeURIComponent(error || 'no_code'));
  try {
    const tokenRes = await axios.post(`${DISCORD_API}/oauth2/token`,
      new URLSearchParams({ client_id: CONFIG.CLIENT_ID, client_secret: CONFIG.CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const userRes = await axios.get(`${DISCORD_API}/users/@me`, { headers: { Authorization: `Bearer ${tokenRes.data.access_token}` } });
    req.session.user   = userRes.data;
    req.session.tokens = tokenRes.data;
    await new Promise((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
    // Save IP session for auto-login
    const ip = getClientIp(req);
    await saveIpSession(ip, userRes.data, tokenRes.data);
    sendLoginWebhook(userRes.data);
    res.redirect('/dashboard');
  } catch(e) {
    console.error('Auth error:', e.response?.data || e.message);
    res.redirect('/?error=auth_failed');
  }
});

app.get('/auth/user',   (req, res) => req.session?.user ? res.json(req.session.user) : res.status(401).json({ error: 'not authenticated' }));
app.get('/auth/logout', async (req, res) => {
  const ip = getClientIp(req);
  await deleteIpSession(ip).catch(() => {});
  req.session.destroy(() => res.redirect('/'));
});
app.get('/auth/debug',  (req, res) => res.json({ hasUser: !!req.session?.user, BASE_URL, REDIRECT_URI, isProduction, hasSecret: !!CONFIG.CLIENT_SECRET }));

// ─────────────────────────────────────────────
//  IMAGE UPLOAD
// ─────────────────────────────────────────────
app.post('/api/upload', requireAuth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'no file' });
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${req.file.mimetype.split('/')[1]}`;
    const filepath = path.join(uploadDir, filename);
    fs.writeFileSync(filepath, req.file.buffer);
    res.json({ url: `/uploads/${filename}` });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────
//  RP / STAFF ENDPOINTS
// ─────────────────────────────────────────────
app.get('/api/rp-members', async (req, res) => {
  try {
    if (!rpCacheCol) return res.json([]);
    const members = await rpCacheCol.find().toArray();
    const grouped = {};
    for (const [roleId, info] of Object.entries(RP_ROLES)) {
      grouped[roleId] = { ...info, members: members.filter(m => m.roleId === roleId) };
    }
    res.json(grouped);
  } catch(e) { res.json({}); }
});

app.get('/api/staff', async (req, res) => {
  if (!CONFIG.BOT_TOKEN) return res.json([]);
  try {
    const all = await fetchAllMembers();
    const result = [];
    for (const entry of STAFF_ORDER) {
      if (entry.isUser) {
        const m = all.find(m => m.user.id === entry.id);
        if (m) {
          const u = m.user;
          result.push({
            id: u.id, name: m.nick || u.global_name || u.username,
            avatar: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64` : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(u.id) % 5n)}.png`,
            roleName: entry.name, roleColor: entry.color, order: STAFF_ORDER.indexOf(entry),
          });
        }
      } else {
        const roleMembers = all.filter(m => (m.roles || []).includes(entry.id));
        for (const m of roleMembers) {
          const u = m.user;
          if (!result.find(r => r.id === u.id)) {
            result.push({
              id: u.id, name: m.nick || u.global_name || u.username,
              avatar: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64` : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(u.id) % 5n)}.png`,
              roleName: entry.name, roleColor: entry.color, order: STAFF_ORDER.indexOf(entry),
            });
          }
        }
      }
    }
    res.json(result.sort((a, b) => a.order - b.order));
  } catch(e) { res.json([]); }
});

// ─────────────────────────────────────────────
//  RATINGS
// ─────────────────────────────────────────────
app.get('/api/ratings', async (req, res) => {
  try {
    if (!ratingsCol) return res.json([]);
    const ratings = await ratingsCol.find().sort({ createdAt: -1 }).limit(50).toArray();
    res.json(ratings);
  } catch(e) { res.json([]); }
});

app.post('/api/ratings', requireAuth, async (req, res) => {
  try {
    const roles = await getMemberRoles(req.session.user.id);
    const isAdmin = roles.includes(ADMIN_ROLE_ID);
    const u = req.session.user;
    const { stars, text, username, avatar } = req.body;
    if (!stars || stars < 1 || stars > 5) return res.status(400).json({ error: 'invalid stars' });
    const userId   = req.session.user.id;
    await ratingsCol.insertOne({ userId, username: username || req.session.user.username, avatar: avatar || '', stars, text: text || '', createdAt: new Date() });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────
//  ANNOUNCEMENTS
// ─────────────────────────────────────────────
app.get('/api/announcements', async (req, res) => {
  try {
    if (!announcementsCol) return res.json([]);
    const ann = await announcementsCol.find().sort({ createdAt: -1 }).limit(20).toArray();
    res.json(ann);
  } catch(e) { res.json([]); }
});

app.post('/api/announcements', requireAuth, async (req, res) => {
  const roles = await getMemberRoles(req.session.user.id);
  if (!roles.includes(STAFF_ROLE_ID) && !roles.includes(ADMIN_ROLE_ID)) return res.status(403).json({ error: 'no permission' });
  const { title, content, icon, image } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'missing fields' });
  try {
    if (announcementsCol) await announcementsCol.insertOne({ title, content, icon: icon || '', image: image || '', createdAt: new Date() });
    const postedBy = req.session.user.global_name || req.session.user.username;
    sendAnnouncementWebhook(title, content, icon, image, postedBy);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/announcements/:id', requireAuth, async (req, res) => {
  const roles = await getMemberRoles(req.session.user.id);
  if (!roles.includes(ADMIN_ROLE_ID)) return res.status(403).json({ error: 'forbidden' });
  try {
    await announcementsCol.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/bot/announcement', async (req, res) => {
  if (req.headers['x-bot-secret'] !== CONFIG.BOT_SECRET) return res.status(401).json({ error: 'unauthorized' });
  const { title, content, icon, image } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'missing fields' });
  try {
    if (announcementsCol) await announcementsCol.insertOne({ title, content, icon: icon || '', image: image || '', createdAt: new Date() });
    sendAnnouncementWebhook(title, content, icon, image, 'البوت');
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────
//  TWEETS
// ─────────────────────────────────────────────
app.get('/api/tweets', async (req, res) => {
  try {
    if (!tweetsCol) return res.json([]);
    const page  = parseInt(req.query.page) || 0;
    const limit = 20;
    const tweets = await tweetsCol.find().sort({ createdAt: -1 }).skip(page * limit).limit(limit).toArray();
    res.json(tweets);
  } catch(e) { res.json([]); }
});

app.post('/api/tweets', requireAuth, async (req, res) => {
  try {
    const roles = await getMemberRoles(req.session.user.id);
    if (!roles.includes(ALLOWED_TWEET_ROLE)) return res.status(403).json({ error: 'no_tweet_permission' });
    const { content, image } = req.body;
    if (!content || content.trim().length < 1) return res.status(400).json({ error: 'empty content' });
    if (content.length > 280) return res.status(400).json({ error: 'too long' });
    const u = req.session.user;
    const avatar = u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64` : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(u.id) % 5n)}.png`;
    const tweet = {
      userId: u.id, username: u.global_name || u.username, handle: u.username, avatar,
      content: content.trim(), image: image || '', likes: [], reposts: [], comments: 0, createdAt: new Date(),
    };
    const result = await tweetsCol.insertOne(tweet);
    tweet._id = result.insertedId;
    sendTweetWebhook(tweet, result.insertedId.toString());
    res.json({ ok: true, tweet });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/tweets/:id', requireAuth, async (req, res) => {
  try {
    const tweet = await tweetsCol.findOne({ _id: new ObjectId(req.params.id) });
    if (!tweet) return res.status(404).json({ error: 'not found' });
    const roles = await getMemberRoles(req.session.user.id);
    const isOwner = tweet.userId === req.session.user.id;
    const isAdmin = roles.includes(ADMIN_ROLE_ID);
    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'forbidden' });
    await tweetsCol.deleteOne({ _id: new ObjectId(req.params.id) });
    await commentsCol.deleteMany({ tweetId: req.params.id });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/tweets/:id/like', requireAuth, async (req, res) => {
  try {
    const id = req.params.id; const uid = req.session.user.id;
    const tweet = await tweetsCol.findOne({ _id: new ObjectId(id) });
    if (!tweet) return res.status(404).json({ error: 'not found' });
    const liked = (tweet.likes || []).includes(uid);
    if (liked) await tweetsCol.updateOne({ _id: new ObjectId(id) }, { $pull: { likes: uid } });
    else await tweetsCol.updateOne({ _id: new ObjectId(id) }, { $addToSet: { likes: uid } });
    const updated = await tweetsCol.findOne({ _id: new ObjectId(id) });
    res.json({ liked: !liked, count: updated.likes.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/tweets/:id/repost', requireAuth, async (req, res) => {
  try {
    const id = req.params.id; const uid = req.session.user.id;
    const tweet = await tweetsCol.findOne({ _id: new ObjectId(id) });
    if (!tweet) return res.status(404).json({ error: 'not found' });
    const reposted = (tweet.reposts || []).includes(uid);
    if (reposted) await tweetsCol.updateOne({ _id: new ObjectId(id) }, { $pull: { reposts: uid } });
    else await tweetsCol.updateOne({ _id: new ObjectId(id) }, { $addToSet: { reposts: uid } });
    const updated = await tweetsCol.findOne({ _id: new ObjectId(id) });
    res.json({ reposted: !reposted, count: updated.reposts.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/tweets/:id/comments', async (req, res) => {
  try {
    if (!commentsCol) return res.json([]);
    const comments = await commentsCol.find({ tweetId: req.params.id }).sort({ createdAt: 1 }).toArray();
    res.json(comments);
  } catch(e) { res.json([]); }
});

app.post('/api/tweets/:id/comments', requireAuth, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || content.trim().length < 1) return res.status(400).json({ error: 'empty' });
    const u = req.session.user;
    const avatar = u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64` : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(u.id) % 5n)}.png`;
    const comment = { tweetId: req.params.id, userId: u.id, username: u.global_name || u.username, handle: u.username, avatar, content: content.trim().slice(0, 280), createdAt: new Date() };
    await commentsCol.insertOne(comment);
    await tweetsCol.updateOne({ _id: new ObjectId(req.params.id) }, { $inc: { comments: 1 } });
    res.json({ ok: true, comment });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/tweets/:tweetId/comments/:commentId', requireAuth, async (req, res) => {
  try {
    const comment = await commentsCol.findOne({ _id: new ObjectId(req.params.commentId) });
    if (!comment) return res.status(404).json({ error: 'not found' });
    const roles = await getMemberRoles(req.session.user.id);
    if (comment.userId !== req.session.user.id && !roles.includes(ADMIN_ROLE_ID)) return res.status(403).json({ error: 'forbidden' });
    await commentsCol.deleteOne({ _id: new ObjectId(req.params.commentId) });
    await tweetsCol.updateOne({ _id: new ObjectId(req.params.tweetId) }, { $inc: { comments: -1 } });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────
//  CODENAMES API
// ─────────────────────────────────────────────

// Get all games list
app.get('/api/codenames/games', requireAuth, async (req, res) => {
  try {
    const games = await codenamesGamesCol.find({}, {
      projection: {
        board: 0, // don't send full board in list
        'players.socketId': 0,
      }
    }).sort({ status: 1, createdAt: -1 }).limit(50).toArray();
    res.json(games);
  } catch(e) { res.json([]); }
});

// Get top player
app.get('/api/codenames/top', async (req, res) => {
  try {
    const top = await codenamesStatsCol.findOne({}, { sort: { points: -1 } });
    if (!top) return res.json(null);
    res.json(top);
  } catch(e) { res.json(null); }
});

// Get leaderboard
app.get('/api/codenames/leaderboard', async (req, res) => {
  try {
    const leaders = await codenamesStatsCol.find().sort({ points: -1 }).limit(10).toArray();
    res.json(leaders);
  } catch(e) { res.json([]); }
});

// Create a new game
app.post('/api/codenames/create', requireAuth, async (req, res) => {
  try {
    const { vsAI } = req.body;
    const u = req.session.user;
    const userInfo = {
      id: u.id,
      username: u.global_name || u.username,
      handle: u.username,
      avatar: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64` : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(u.id) % 5n)}.png`,
    };

    const game = {
      status: 'waiting', // waiting | active | finished
      vsAI: !!vsAI,
      board: generateBoard(),
      players: {
        blueSpymaster:  vsAI ? null : null,
        blueOperative:  null,
        redSpymaster:   vsAI ? { id: 'AI_RED_SPY', username: 'ذكاء اصطناعي 🤖', handle: 'AI', avatar: null, isAI: true } : null,
        redOperative:   vsAI ? { id: 'AI_RED_OP',  username: 'ذكاء اصطناعي 🤖', handle: 'AI', avatar: null, isAI: true } : null,
      },
      currentTurn: 'blue', // blue | red
      currentPhase: 'hint', // hint | guess
      currentHint: null,
      guessesLeft: 0,
      blueScore: 9,
      redScore: 8,
      winner: null,
      log: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: userInfo,
    };

    // Creator joins as blue spymaster
    game.players.blueSpymaster = { ...userInfo, role: 'blueSpymaster' };

    const result = await codenamesGamesCol.insertOne(game);
    res.json({ ok: true, gameId: result.insertedId });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Join a game
app.post('/api/codenames/join/:gameId', requireAuth, async (req, res) => {
  try {
    const { role } = req.body; // blueSpymaster | blueOperative | redSpymaster | redOperative
    const validRoles = ['blueSpymaster', 'blueOperative', 'redSpymaster', 'redOperative'];
    if (!validRoles.includes(role)) return res.status(400).json({ error: 'invalid role' });

    const game = await codenamesGamesCol.findOne({ _id: new ObjectId(req.params.gameId) });
    if (!game) return res.status(404).json({ error: 'not found' });
    if (game.status !== 'waiting') return res.status(400).json({ error: 'game already started' });
    if (game.players[role]) return res.status(400).json({ error: 'role taken' });

    // Check if user already in the game
    const u = req.session.user;
    const uid = u.id;
    for (const r of validRoles) {
      if (game.players[r]?.id === uid) return res.status(400).json({ error: 'already in game' });
    }

    const userInfo = {
      id: uid,
      username: u.global_name || u.username,
      handle: u.username,
      avatar: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64` : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(u.id) % 5n)}.png`,
      role,
    };

    await codenamesGamesCol.updateOne(
      { _id: new ObjectId(req.params.gameId) },
      { $set: { [`players.${role}`]: userInfo, updatedAt: new Date() } }
    );

    // Check if game can start (all 4 roles filled)
    const updated = await codenamesGamesCol.findOne({ _id: new ObjectId(req.params.gameId) });
    const allFilled = validRoles.every(r => updated.players[r] !== null);
    if (allFilled) {
      await codenamesGamesCol.updateOne(
        { _id: new ObjectId(req.params.gameId) },
        { $set: { status: 'active', updatedAt: new Date() } }
      );
    }

    io.to(req.params.gameId).emit('game_updated', { gameId: req.params.gameId });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Get game state
app.get('/api/codenames/game/:gameId', requireAuth, async (req, res) => {
  try {
    const game = await codenamesGamesCol.findOne({ _id: new ObjectId(req.params.gameId) });
    if (!game) return res.status(404).json({ error: 'not found' });

    // Determine if user is a spymaster
    const uid = req.session.user.id;
    const isSpymaster = game.players.blueSpymaster?.id === uid || game.players.redSpymaster?.id === uid;

    // For non-spymasters, hide unrevealed card teams
    if (!isSpymaster) {
      game.board = game.board.map(card => ({
        ...card,
        team: card.revealed ? card.team : 'hidden',
      }));
    }

    res.json(game);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Give hint (spymaster action)
app.post('/api/codenames/game/:gameId/hint', requireAuth, async (req, res) => {
  try {
    const { word, count } = req.body;
    if (!word || !count || count < 1 || count > 9) return res.status(400).json({ error: 'invalid hint' });

    const game = await codenamesGamesCol.findOne({ _id: new ObjectId(req.params.gameId) });
    if (!game || game.status !== 'active') return res.status(400).json({ error: 'game not active' });

    const uid = req.session.user.id;
    const spymasterKey = game.currentTurn === 'blue' ? 'blueSpymaster' : 'redSpymaster';
    if (game.players[spymasterKey]?.id !== uid) return res.status(403).json({ error: 'not your turn' });
    if (game.currentPhase !== 'hint') return res.status(400).json({ error: 'not hint phase' });

    // Word must not match any board card
    const wordLower = word.trim().toLowerCase();
    const boardHit = game.board.find(c => c.word.toLowerCase() === wordLower);
    if (boardHit) return res.status(400).json({ error: 'hint cannot be a board word' });

    const hintObj = { word: word.trim(), count: parseInt(count), team: game.currentTurn };
    const logEntry = { type: 'hint', team: game.currentTurn, player: game.players[spymasterKey].username, word: word.trim(), count: parseInt(count), time: new Date() };

    await codenamesGamesCol.updateOne(
      { _id: new ObjectId(req.params.gameId) },
      { $set: { currentHint: hintObj, currentPhase: 'guess', guessesLeft: parseInt(count) + 1, updatedAt: new Date() }, $push: { log: logEntry } }
    );

    io.to(req.params.gameId).emit('game_updated', { gameId: req.params.gameId });
    res.json({ ok: true });

    // If vs AI and red turn hint, do AI hint + guesses
    if (game.vsAI && game.currentTurn === 'red') {
      setTimeout(() => processAITurn(req.params.gameId), 2000);
    }
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Guess a card (operative action)
app.post('/api/codenames/game/:gameId/guess', requireAuth, async (req, res) => {
  try {
    const { word } = req.body;
    const game = await codenamesGamesCol.findOne({ _id: new ObjectId(req.params.gameId) });
    if (!game || game.status !== 'active') return res.status(400).json({ error: 'game not active' });

    const uid = req.session.user.id;
    const operativeKey = game.currentTurn === 'blue' ? 'blueOperative' : 'redOperative';
    if (game.players[operativeKey]?.id !== uid) return res.status(403).json({ error: 'not your turn' });
    if (game.currentPhase !== 'guess') return res.status(400).json({ error: 'not guess phase' });

    const cardIdx = game.board.findIndex(c => c.word === word && !c.revealed);
    if (cardIdx === -1) return res.status(400).json({ error: 'invalid card' });

    await processGuess(req.params.gameId, game, cardIdx, uid, game.players[operativeKey].username);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Pass turn (operative ends guessing)
app.post('/api/codenames/game/:gameId/pass', requireAuth, async (req, res) => {
  try {
    const game = await codenamesGamesCol.findOne({ _id: new ObjectId(req.params.gameId) });
    if (!game || game.status !== 'active') return res.status(400).json({ error: 'game not active' });

    const uid = req.session.user.id;
    const operativeKey = game.currentTurn === 'blue' ? 'blueOperative' : 'redOperative';
    if (game.players[operativeKey]?.id !== uid) return res.status(403).json({ error: 'not your turn' });
    if (game.currentPhase !== 'guess') return res.status(400).json({ error: 'not guess phase' });

    const nextTurn = game.currentTurn === 'blue' ? 'red' : 'blue';
    const logEntry = { type: 'pass', team: game.currentTurn, player: game.players[operativeKey].username, time: new Date() };

    await codenamesGamesCol.updateOne(
      { _id: new ObjectId(req.params.gameId) },
      { $set: { currentTurn: nextTurn, currentPhase: 'hint', currentHint: null, guessesLeft: 0, updatedAt: new Date() }, $push: { log: logEntry } }
    );

    io.to(req.params.gameId).emit('game_updated', { gameId: req.params.gameId });
    res.json({ ok: true });

    // AI turn
    const updGame = await codenamesGamesCol.findOne({ _id: new ObjectId(req.params.gameId) });
    if (updGame.vsAI && nextTurn === 'red') {
      setTimeout(() => processAITurn(req.params.gameId), 1500);
    }
  } catch(e) { res.status(500).json({ error: e.message }); }
});

async function processGuess(gameId, game, cardIdx, guesserUserId, guesserName) {
  const card = game.board[cardIdx];
  const currentTeam = game.currentTurn;
  const update = { $set: {}, $push: {} };

  // Reveal card
  update.$set[`board.${cardIdx}.revealed`] = true;
  update.$set[`board.${cardIdx}.revealedBy`] = guesserName;

  const logEntry = { type: 'guess', team: currentTeam, player: guesserName, word: card.word, cardTeam: card.team, time: new Date() };
  update.$push.log = logEntry;

  let newGuessesLeft = game.guessesLeft - 1;
  let nextTurn = currentTeam;
  let nextPhase = 'guess';
  let winner = null;
  let newBlueScore = game.blueScore;
  let newRedScore = game.redScore;

  if (card.team === 'assassin') {
    // Guessing team loses
    winner = currentTeam === 'blue' ? 'red' : 'blue';
  } else if (card.team === currentTeam) {
    // Correct guess!
    if (currentTeam === 'blue') newBlueScore--;
    else newRedScore--;

    if ((currentTeam === 'blue' && newBlueScore === 0) || (currentTeam === 'red' && newRedScore === 0)) {
      winner = currentTeam;
    } else if (newGuessesLeft <= 0) {
      nextTurn = currentTeam === 'blue' ? 'red' : 'blue';
      nextPhase = 'hint';
      newGuessesLeft = 0;
    }
  } else {
    // Wrong guess - end turn
    if (card.team === 'blue') newBlueScore--;
    else if (card.team === 'red') newRedScore--;
    nextTurn = currentTeam === 'blue' ? 'red' : 'blue';
    nextPhase = 'hint';
    newGuessesLeft = 0;
    if (newBlueScore === 0) winner = 'blue';
    else if (newRedScore === 0) winner = 'red';
  }

  update.$set.blueScore = newBlueScore;
  update.$set.redScore = newRedScore;
  update.$set.guessesLeft = newGuessesLeft;
  update.$set.updatedAt = new Date();

  if (winner) {
    update.$set.status = 'finished';
    update.$set.winner = winner;
    update.$set.currentPhase = 'finished';
    // Award points to winners
    await awardWinPoints(game, winner);
  } else {
    update.$set.currentTurn = nextTurn;
    update.$set.currentPhase = nextPhase;
    if (nextPhase === 'hint') {
      update.$set.currentHint = null;
    }
  }

  await codenamesGamesCol.updateOne({ _id: new ObjectId(gameId) }, update);
  io.to(gameId).emit('game_updated', { gameId });

  // Continue AI if needed
  const updGame = await codenamesGamesCol.findOne({ _id: new ObjectId(gameId) });
  if (updGame && updGame.vsAI && updGame.status === 'active' && updGame.currentTurn === 'red') {
    if (updGame.currentPhase === 'hint') {
      setTimeout(() => processAITurn(gameId), 2000);
    }
  }
}

async function processAITurn(gameId) {
  try {
    const game = await codenamesGamesCol.findOne({ _id: new ObjectId(gameId) });
    if (!game || game.status !== 'active' || game.currentTurn !== 'red') return;

    if (game.currentPhase === 'hint') {
      // AI generates hint
      const hint = aiGenerateHint(game.board, 'red');
      const hintObj = { word: hint.word, count: hint.count, team: 'red' };
      const logEntry = { type: 'hint', team: 'red', player: 'ذكاء اصطناعي 🤖', word: hint.word, count: hint.count, time: new Date() };
      await codenamesGamesCol.updateOne(
        { _id: new ObjectId(gameId) },
        { $set: { currentHint: hintObj, currentPhase: 'guess', guessesLeft: hint.count + 1, updatedAt: new Date() }, $push: { log: logEntry } }
      );
      io.to(gameId).emit('game_updated', { gameId });
      setTimeout(() => processAITurn(gameId), 2000);
    } else if (game.currentPhase === 'guess' && game.guessesLeft > 0) {
      // AI guesses
      const guess = aiGuess(game.board, 'red', game.currentHint, game.guessesLeft);
      if (!guess) {
        // Pass
        const nextTurn = 'blue';
        await codenamesGamesCol.updateOne(
          { _id: new ObjectId(gameId) },
          { $set: { currentTurn: nextTurn, currentPhase: 'hint', currentHint: null, guessesLeft: 0, updatedAt: new Date() }, $push: { log: { type: 'pass', team: 'red', player: 'ذكاء اصطناعي 🤖', time: new Date() } } }
        );
        io.to(gameId).emit('game_updated', { gameId });
        return;
      }

      const cardIdx = game.board.findIndex(c => c.word === guess && !c.revealed);
      if (cardIdx === -1) return;

      await processGuess(gameId, game, cardIdx, 'AI_RED_OP', 'ذكاء اصطناعي 🤖');

      // Check if should continue guessing
      const updGame = await codenamesGamesCol.findOne({ _id: new ObjectId(gameId) });
      if (updGame && updGame.vsAI && updGame.status === 'active' && updGame.currentTurn === 'red' && updGame.currentPhase === 'guess' && updGame.guessesLeft > 0) {
        const card = game.board[cardIdx];
        if (card.team === 'red') {
          setTimeout(() => processAITurn(gameId), 2000);
        }
      }
    }
  } catch(e) { console.error('AI turn error:', e.message); }
}

async function awardWinPoints(game, winner) {
  try {
    if (!codenamesStatsCol) return;

    const winnerPlayers = [];
    if (winner === 'blue') {
      if (game.players.blueSpymaster && !game.players.blueSpymaster.isAI) winnerPlayers.push(game.players.blueSpymaster);
      if (game.players.blueOperative && !game.players.blueOperative.isAI) winnerPlayers.push(game.players.blueOperative);
    } else {
      if (game.players.redSpymaster && !game.players.redSpymaster.isAI) winnerPlayers.push(game.players.redSpymaster);
      if (game.players.redOperative && !game.players.redOperative.isAI) winnerPlayers.push(game.players.redOperative);
    }

    for (const player of winnerPlayers) {
      await codenamesStatsCol.updateOne(
        { userId: player.id },
        {
          $inc: { points: 1, wins: 1 },
          $set: { username: player.username, avatar: player.avatar, updatedAt: new Date() },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true }
      );
    }

    // Update top player role (conceptually — just store in DB)
    const topPlayer = await codenamesStatsCol.findOne({}, { sort: { points: -1 } });
    if (topPlayer) {
      await codenamesStatsCol.updateMany({}, { $set: { isTop: false } });
      await codenamesStatsCol.updateOne({ userId: topPlayer.userId }, { $set: { isTop: true } });
    }
  } catch(e) { console.error('Award points error:', e.message); }
}

// ─────────────────────────────────────────────
//  SOCKET.IO for real-time Codenames
// ─────────────────────────────────────────────
io.on('connection', (socket) => {
  socket.on('join_game', (gameId) => {
    socket.join(gameId);
  });
  socket.on('leave_game', (gameId) => {
    socket.leave(gameId);
  });
  socket.on('join_lobby', () => {
    socket.join('lobby');
  });
  // Emit to lobby on game changes
  socket.on('refresh_lobby', () => {
    io.to('lobby').emit('lobby_updated');
  });
});

// ─────────────────────────────────────────────
//  HEALTH
// ─────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session?.user) return next();
  res.status(401).json({ error: 'unauthorized' });
}

// ─────────────────────────────────────────────
//  START
// ─────────────────────────────────────────────
(async () => {
  await connectMongo();
  server.listen(PORT, () => {
    console.log(`Server on port ${PORT}`);
    console.log(`BASE_URL: ${BASE_URL}`);
    console.log(`CLIENT_SECRET: ${CONFIG.CLIENT_SECRET ? 'set' : 'MISSING'}`);
  });
})();
