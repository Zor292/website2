const express  = require('express');
const session  = require('express-session');
const axios    = require('axios');
const path     = require('path');
const multer   = require('multer');
const fs       = require('fs');
const { MongoClient, ObjectId } = require('mongodb');
const http             = require('http');
const { Server: SIO }  = require('socket.io');

const app        = express();
const httpSrv    = http.createServer(app);
const io         = new SIO(httpSrv, { cors: { origin: '*' } });

// ─────────────────────────────────────────────
//  CONSTANTS
// ─────────────────────────────────────────────
const GUILD_ID       = '1421088112808951852';
const STAFF_ROLE_ID  = '1471530512622555297';
const ADMIN_ROLE_ID  = '1471922925681639625';
const ALLOWED_TWEET_ROLE = '1471546898794942646'; // فقط من لديه هذه الرتبة يستطيع التغريد

// ترتيب الفريق الإداري حسب الرتبة
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

// Webhooks
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
//  FILE UPLOAD (multer - memory storage)
// ─────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'));
  },
});

// ─────────────────────────────────────────────
//  MONGODB
// ─────────────────────────────────────────────
let db, ratingsCol, announcementsCol, rpCacheCol, tweetsCol, commentsCol;
let cnGamesCol, cnStatsCol;

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
    cnGamesCol       = db.collection('codenames_games');
    cnStatsCol       = db.collection('codenames_stats');

    // Indexes
    await tweetsCol.createIndex({ createdAt: -1 });
    await commentsCol.createIndex({ tweetId: 1, createdAt: 1 });
    await cnGamesCol.createIndex({ status: 1, createdAt: -1 });
    await cnStatsCol.createIndex({ userId: 1 }, { unique: true });

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
    const rpData = {};
    for (const rid of Object.keys(RP_ROLES)) rpData[rid] = [];
    for (const m of all) {
      if (m.user.bot) continue;
      const roles = m.roles || [];
      const isCIA = roles.some(r => CIA_ROLE_IDS.includes(r));
      for (const roleId of Object.keys(RP_ROLES)) {
        if (!roles.includes(roleId)) continue;
        if (isCIA && LSPD_ROLE_IDS.includes(roleId)) continue;
        rpData[roleId].push({
          id:     m.user.id,
          name:   m.nick || m.user.global_name || m.user.username,
          avatar: m.user.avatar
            ? `https://cdn.discordapp.com/avatars/${m.user.id}/${m.user.avatar}.png?size=64`
            : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(m.user.id) % 5n)}.png`,
        });
      }
    }
    await rpCacheCol.replaceOne({ _id: 'rp_cache' }, { _id: 'rp_cache', data: rpData, updatedAt: new Date() }, { upsert: true });
    console.log('RP members synced');
  } catch(e) { console.error('RP sync error:', e.message); }
}

setInterval(() => syncRpMembers(), 7 * 24 * 60 * 60 * 1000);

// ─────────────────────────────────────────────
//  WEBHOOK SENDERS
// ─────────────────────────────────────────────
async function sendLoginWebhook(user) {
  try {
    const avatar = user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
      : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(user.id) % 5n)}.png`;
    const now = new Date();
    const timeStr = now.toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    await axios.post(WH_LOGIN, {
      username: 'Live Zone - سجل الدخول',
      avatar_url: avatar,
      embeds: [{
        title: 'تسجيل دخول جديد',
        color: 0x00c8ff,
        thumbnail: { url: avatar },
        fields: [
          { name: 'الاسم',       value: `\`${user.global_name || user.username}\``, inline: true },
          { name: 'المعرف',      value: `\`@${user.username}\``,                    inline: true },
          { name: 'Discord ID',  value: `\`${user.id}\``,                            inline: true },
          { name: 'البريد',      value: user.email ? `\`${user.email}\`` : '`—`',   inline: true },
          { name: 'تحقق البريد', value: user.verified ? 'نعم' : 'لا',               inline: true },
          { name: 'Nitro',       value: user.premium_type ? 'مشترك' : 'لا',         inline: true },
          { name: 'وقت الدخول', value: `\`${timeStr}\``,                            inline: false },
        ],
        footer: { text: 'Live Zone Website' },
        timestamp: now.toISOString(),
      }],
    }, { timeout: 5000 });
  } catch(e) { console.error('Login webhook error:', e.message); }
}

async function sendAnnouncementWebhook(title, content, icon, imageUrl, postedBy) {
  try {
    const now = new Date();
    const timeStr = now.toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const embed = {
      title: `${icon || ''} ${title}`.trim(),
      description: content,
      color: 0xffc832,
      fields: [
        { name: 'بواسطة', value: `\`${postedBy || 'الادارة'}\``, inline: true },
        { name: 'وقت النشر', value: `\`${timeStr}\``,             inline: true },
      ],
      footer: { text: 'Live Zone Website - الاعلانات' },
      timestamp: now.toISOString(),
    };
    if (imageUrl) embed.image = { url: imageUrl };
    await axios.post(WH_ANNOUNCEMENT, {
      content: '@everyone',
      username: 'Live Zone - الاعلانات',
      avatar_url: 'https://cdn.discordapp.com/embed/avatars/5.png',
      embeds: [embed],
    }, { timeout: 5000 });
  } catch(e) { console.error('Announcement webhook error:', e.message); }
}

async function sendTweetWebhook(tweet, tweetId) {
  try {
    const now = new Date(tweet.createdAt);
    const embed = {
      description: tweet.content,
      color: 0x1da1f2,
      author: {
        name: tweet.username,
        icon_url: tweet.avatar,
      },
      footer: { text: `Live Zone - تويتر | ID: ${tweetId}` },
      timestamp: now.toISOString(),
    };
    if (tweet.image) embed.image = { url: tweet.image };

    // Action buttons via components
    await axios.post(WH_TWEET, {
      username: 'Live Zone - تويتر',
      avatar_url: tweet.avatar,
      content: '',
      embeds: [embed],
      components: [{
        type: 1,
        components: [
          { type: 2, style: 2, label: `اعجاب  ${tweet.likes || 0}`,    custom_id: `like_${tweetId}`,   emoji: { name: '❤️' } },
          { type: 2, style: 2, label: `اعادة نشر  ${tweet.reposts || 0}`, custom_id: `repost_${tweetId}`, emoji: { name: '🔁' } },
          { type: 2, style: 5, label: 'عرض على الموقع', url: `${BASE_URL}/dashboard`, emoji: { name: '🔗' } },
        ],
      }],
    }, { timeout: 5000 });
  } catch(e) { console.error('Tweet webhook error:', e.message); }
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
    maxAge:   7 * 24 * 60 * 60 * 1000,
  },
}));

app.use(express.static(path.join(__dirname, 'public')));

// Serve uploaded images from memory — store in /tmp
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
    sendLoginWebhook(userRes.data);
    res.redirect('/dashboard');
  } catch(e) {
    console.error('Auth error:', e.response?.data || e.message);
    res.redirect('/?error=auth_failed');
  }
});

app.get('/auth/user',   (req, res) => req.session?.user ? res.json(req.session.user) : res.status(401).json({ error: 'not authenticated' }));
app.get('/auth/logout', (req, res) => req.session.destroy(() => res.redirect('/')));
app.get('/auth/debug',  (req, res) => res.json({ hasUser: !!req.session?.user, BASE_URL, REDIRECT_URI, isProduction, hasSecret: !!CONFIG.CLIENT_SECRET }));

// ─────────────────────────────────────────────
//  IMAGE UPLOAD
// ─────────────────────────────────────────────
app.post('/api/upload', requireAuth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image' });
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${req.file.mimetype.split('/')[1]}`;
    const filepath = path.join(uploadDir, filename);
    fs.writeFileSync(filepath, req.file.buffer);
    res.json({ url: `/uploads/${filename}` });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────
//  GUILD
// ─────────────────────────────────────────────
app.get('/api/guild', async (req, res) => {
  try {
    const r = await axios.get(`${DISCORD_API}/guilds/${GUILD_ID}?with_counts=true`, { headers: { Authorization: `Bot ${CONFIG.BOT_TOKEN}` } });
    res.json({ approximate_member_count: r.data.approximate_member_count, approximate_presence_count: r.data.approximate_presence_count });
  } catch(e) { res.json({}); }
});

// ─────────────────────────────────────────────
//  MEMBER / PROFILE
// ─────────────────────────────────────────────
app.get('/api/member/:userId', requireAuth, async (req, res) => {
  try {
    const [mRes, rRes] = await Promise.all([
      axios.get(`${DISCORD_API}/guilds/${GUILD_ID}/members/${req.params.userId}`, { headers: { Authorization: `Bot ${CONFIG.BOT_TOKEN}` } }),
      axios.get(`${DISCORD_API}/guilds/${GUILD_ID}/roles`,                         { headers: { Authorization: `Bot ${CONFIG.BOT_TOKEN}` } }),
    ]);
    const guildRoles    = rRes.data;
    const memberRoleIds = mRes.data.roles || [];
    const roles = memberRoleIds
      .map(id => guildRoles.find(r => r.id === id))
      .filter(r => r && r.name !== '@everyone')
      .sort((a, b) => b.position - a.position)
      .map(r => ({ id: r.id, name: r.name, color: r.color ? '#' + r.color.toString(16).padStart(6,'0') : null }));
    const isWebAdmin     = memberRoleIds.includes(ADMIN_ROLE_ID);
    const isDiscordAdmin = memberRoleIds.some(rid => { const role = guildRoles.find(r => r.id === rid); return role && (role.permissions & 0x8) === 0x8; });
    const nick = mRes.data.nick || mRes.data.user?.global_name || mRes.data.user?.username;
    res.json({ roles, isAdmin: isWebAdmin || isDiscordAdmin, isWebAdmin, nick, joinedAt: mRes.data.joined_at });
  } catch(e) { res.json({ roles: [], isAdmin: false, isWebAdmin: false }); }
});

// Profile popup data
app.get('/api/profile/:userId', requireAuth, async (req, res) => {
  try {
    const [mRes, rRes] = await Promise.all([
      axios.get(`${DISCORD_API}/guilds/${GUILD_ID}/members/${req.params.userId}`, { headers: { Authorization: `Bot ${CONFIG.BOT_TOKEN}` } }),
      axios.get(`${DISCORD_API}/guilds/${GUILD_ID}/roles`,                         { headers: { Authorization: `Bot ${CONFIG.BOT_TOKEN}` } }),
    ]);
    const u = mRes.data.user;
    const guildRoles    = rRes.data;
    const memberRoleIds = mRes.data.roles || [];
    const roles = memberRoleIds
      .map(id => guildRoles.find(r => r.id === id))
      .filter(r => r && r.name !== '@everyone')
      .sort((a, b) => b.position - a.position)
      .map(r => ({ id: r.id, name: r.name, color: r.color ? '#' + r.color.toString(16).padStart(6,'0') : '#5865f2' }));
    const topRole    = roles[0] || null;
    const avatar     = u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128` : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(u.id) % 5n)}.png`;
    const banner     = u.banner ? `https://cdn.discordapp.com/banners/${u.id}/${u.banner}.png?size=480` : null;
    const accentColor = u.accent_color ? '#' + u.accent_color.toString(16).padStart(6,'0') : '#0c1118';
    // Count tweets and ratings
    const tweetCount  = tweetsCol  ? await tweetsCol.countDocuments({ userId: u.id }) : 0;
    const hasRating   = ratingsCol ? await ratingsCol.findOne({ userId: u.id }) : null;
    res.json({
      id:          u.id,
      username:    u.username,
      globalName:  u.global_name || u.username,
      nick:        mRes.data.nick || u.global_name || u.username,
      avatar,
      banner,
      accentColor,
      roles,
      topRole,
      joinedAt:    mRes.data.joined_at,
      accountCreatedAt: new Date(Number((BigInt(u.id) >> 22n) + 1420070400000n)).toISOString(),
      premiumType: u.premium_type,
      tweetCount,
      hasRating:   !!hasRating,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────
//  STAFF (ordered)
// ─────────────────────────────────────────────
app.get('/api/staff', async (req, res) => {
  try {
    const allMembers = await fetchAllMembers();
    const result = [];
    const seenIds = new Set();

    for (const tier of STAFF_ORDER) {
      let members;
      if (tier.isUser) {
        members = allMembers.filter(m => m.user.id === tier.id && !m.user.bot);
      } else {
        members = allMembers.filter(m => m.roles.includes(tier.id) && !m.user.bot);
      }
      for (const m of members) {
        if (seenIds.has(m.user.id)) continue;
        seenIds.add(m.user.id);
        result.push({
          id:         m.user.id,
          name:       m.nick || m.user.global_name || m.user.username,
          tierId:     tier.id,
          tierName:   tier.name,
          tierColor:  tier.color,
          avatar:     m.user.avatar
            ? `https://cdn.discordapp.com/avatars/${m.user.id}/${m.user.avatar}.png?size=64`
            : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(m.user.id) % 5n)}.png`,
        });
      }
    }
    res.json(result);
  } catch(e) { res.json([]); }
});

// ─────────────────────────────────────────────
//  RP MEMBERS
// ─────────────────────────────────────────────
app.get('/api/rp-members', async (req, res) => {
  try {
    if (!rpCacheCol) return res.json({ data: {}, updatedAt: null, roles: RP_ROLES });
    const cache = await rpCacheCol.findOne({ _id: 'rp_cache' });
    res.json({ data: cache?.data || {}, updatedAt: cache?.updatedAt || null, roles: RP_ROLES });
  } catch(e) { res.json({ data: {}, updatedAt: null, roles: RP_ROLES }); }
});

app.post('/api/rp-sync', requireAuth, async (req, res) => {
  try {
    const roles = await getMemberRoles(req.session.user.id);
    if (!roles.includes(ADMIN_ROLE_ID)) return res.status(403).json({ error: 'forbidden' });
    await syncRpMembers();
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────
//  RATINGS
// ─────────────────────────────────────────────
app.get('/api/ratings', async (req, res) => {
  try {
    if (!ratingsCol) return res.json([]);
    res.json(await ratingsCol.find().sort({ createdAt: -1 }).limit(50).toArray());
  } catch(e) { res.json([]); }
});

app.post('/api/ratings', requireAuth, async (req, res) => {
  const { stars, text, username, avatar } = req.body;
  if (!stars || stars < 1 || stars > 5) return res.status(400).json({ error: 'invalid stars' });
  if (!ratingsCol) return res.status(500).json({ error: 'db not connected' });
  try {
    const userId   = req.session.user.id;
    const existing = await ratingsCol.findOne({ userId });
    if (existing) {
      await ratingsCol.updateOne({ userId }, { $set: { stars, text: text || '', updatedAt: new Date() } });
      return res.json({ ok: true, updated: true });
    }
    await ratingsCol.insertOne({ userId, username: username || req.session.user.username, avatar: avatar || '', stars, text: text || '', createdAt: new Date() });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/ratings/:id', requireAuth, async (req, res) => {
  try {
    const roles = await getMemberRoles(req.session.user.id);
    if (!roles.includes(ADMIN_ROLE_ID)) return res.status(403).json({ error: 'forbidden' });
    await ratingsCol.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────
//  ANNOUNCEMENTS
// ─────────────────────────────────────────────
app.get('/api/announcements', async (req, res) => {
  try {
    if (!announcementsCol) return res.json([]);
    res.json(await announcementsCol.find().sort({ createdAt: -1 }).limit(20).toArray());
  } catch(e) { res.json([]); }
});

app.post('/api/announcements', requireAuth, async (req, res) => {
  try {
    const roles = await getMemberRoles(req.session.user.id);
    if (!roles.includes(ADMIN_ROLE_ID)) return res.status(403).json({ error: 'forbidden' });
    const { title, content, icon, image } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'missing fields' });
    await announcementsCol.insertOne({ title, content, icon: icon || '', image: image || '', createdAt: new Date() });
    const postedBy = req.session.user.global_name || req.session.user.username;
    sendAnnouncementWebhook(title, content, icon, image ? `${BASE_URL}${image}` : null, postedBy);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/announcements/:id', requireAuth, async (req, res) => {
  try {
    const roles = await getMemberRoles(req.session.user.id);
    if (!roles.includes(ADMIN_ROLE_ID)) return res.status(403).json({ error: 'forbidden' });
    await announcementsCol.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// BOT endpoint
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
    // فقط من لديه الرتبة المحددة يستطيع التغريد
    const roles = await getMemberRoles(req.session.user.id);
    if (!roles.includes(ALLOWED_TWEET_ROLE)) return res.status(403).json({ error: 'no_tweet_permission' });

    const { content, image } = req.body;
    if (!content || content.trim().length < 1) return res.status(400).json({ error: 'empty content' });
    if (content.length > 280) return res.status(400).json({ error: 'too long' });

    const u = req.session.user;
    const avatar = u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64` : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(u.id) % 5n)}.png`;

    const tweet = {
      userId:    u.id,
      username:  u.global_name || u.username,
      handle:    u.username,
      avatar,
      content:   content.trim(),
      image:     image || '',
      likes:     [],
      reposts:   [],
      comments:  0,
      createdAt: new Date(),
    };

    const result = await tweetsCol.insertOne(tweet);
    tweet._id = result.insertedId;

    // Send to Discord webhook
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

// Like / Unlike
app.post('/api/tweets/:id/like', requireAuth, async (req, res) => {
  try {
    const id  = req.params.id;
    const uid = req.session.user.id;
    const tweet = await tweetsCol.findOne({ _id: new ObjectId(id) });
    if (!tweet) return res.status(404).json({ error: 'not found' });
    const liked = (tweet.likes || []).includes(uid);
    if (liked) {
      await tweetsCol.updateOne({ _id: new ObjectId(id) }, { $pull: { likes: uid } });
    } else {
      await tweetsCol.updateOne({ _id: new ObjectId(id) }, { $addToSet: { likes: uid } });
    }
    const updated = await tweetsCol.findOne({ _id: new ObjectId(id) });
    res.json({ liked: !liked, count: updated.likes.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Repost / Un-repost
app.post('/api/tweets/:id/repost', requireAuth, async (req, res) => {
  try {
    const id  = req.params.id;
    const uid = req.session.user.id;
    const tweet = await tweetsCol.findOne({ _id: new ObjectId(id) });
    if (!tweet) return res.status(404).json({ error: 'not found' });
    const reposted = (tweet.reposts || []).includes(uid);
    if (reposted) {
      await tweetsCol.updateOne({ _id: new ObjectId(id) }, { $pull: { reposts: uid } });
    } else {
      await tweetsCol.updateOne({ _id: new ObjectId(id) }, { $addToSet: { reposts: uid } });
    }
    const updated = await tweetsCol.findOne({ _id: new ObjectId(id) });
    res.json({ reposted: !reposted, count: updated.reposts.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Comments
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
    const comment = {
      tweetId:   req.params.id,
      userId:    u.id,
      username:  u.global_name || u.username,
      handle:    u.username,
      avatar,
      content:   content.trim().slice(0, 280),
      createdAt: new Date(),
    };
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

// Discord interaction webhook (like/repost from Discord)
app.post('/bot/interaction', async (req, res) => {
  // Verify from Discord (basic)
  res.json({ type: 1 }); // pong first
  const { type, data } = req.body;
  if (type !== 3) return; // only buttons
  const customId = data?.custom_id || '';
  const [action, tweetId] = customId.split('_');
  if (!tweetId) return;
  try {
    if (action === 'like') {
      // We can't know who from Discord without oauth, just increment
      await tweetsCol.updateOne({ _id: new ObjectId(tweetId) }, { $inc: { discordLikes: 1 } });
    } else if (action === 'repost') {
      await tweetsCol.updateOne({ _id: new ObjectId(tweetId) }, { $inc: { discordReposts: 1 } });
    }
  } catch(e) {}
});

// ═══════════════════════════════════════════════════════
//  CODENAMES
// ═══════════════════════════════════════════════════════

// ── كلمات اللعبة (250+ كلمة عربية)
const CN_WORDS = [
  'لايف زون','فراس',
  'أسد','نمر','فيل','زرافة','حصان','ذئب','ثعلب','أرنب','قط','كلب',
  'دب','قرد','طاووس','نسر','دلفين','قرش','تمساح','ثعبان','عقرب','نحلة',
  'أخطبوط','كنغر','ببغاء','خروف','جمل','حمار','ديك','بطة','سلحفاة','فهد',
  'جبل','بحر','نهر','صحراء','غابة','شلال','بركان','كهف','جزيرة','قمر',
  'شمس','نجمة','سحابة','مطر','ثلج','برق','ريح','رعد','طوفان','زلزال',
  'صخرة','رمل','طين','جليد','ضباب','قوس قزح','شهاب','مذنب','كوكب','نيزك',
  'رياض','مكة','دبي','القاهرة','بغداد','دمشق','بيروت','عمان','الكويت','الدوحة',
  'أبوظبي','مسقط','صنعاء','لندن','باريس','طوكيو','موسكو','روما','برلين','مدريد',
  'تمر','قهوة','شاي','رز','خبز','لحم','سمك','فواكه','عسل','زيتون',
  'تفاح','برتقال','موز','عنب','رمان','مانجو','كنافة','بقلاوة','برغر','بيتزا',
  'شوكولاتة','آيسكريم','حليب','جبن','بيض','فلافل','كباب','مندي','هريس','مضبي',
  'طبيب','مهندس','معلم','شرطي','جندي','قاضي','محامي','صياد','فلاح','تاجر',
  'رئيس','وزير','أمير','ملك','فارس','شاعر','فنان','لاعب','مدرب','حكم',
  'مخرج','ممثل','مغني','رسام','نحات','كاتب','صحفي','طيار','بحار','عالم',
  'سيف','رمح','درع','خنجر','قوس','سهم','مفتاح','قفل','كتاب','قلم',
  'ساعة','مرآة','شمعة','خيمة','سفينة','طائرة','سيارة','دراجة','قطار','صاروخ',
  'مطرقة','مسمار','حبل','سكين','ملعقة','طاولة','كرسي','سرير','خزانة','نافذة',
  'حاسوب','هاتف','إنترنت','برنامج','شبكة','ذكاء','روبوت','كاميرا','شاشة','لوحة',
  'ذاكرة','معالج','بيانات','تشفير','اختراق','فيروس','دفاع','نظام','تطبيق','رمز',
  'حلم','أمل','خوف','شجاعة','وفاء','خيانة','صداقة','عداوة','حب','كره',
  'سلام','حرب','عدل','ظلم','حقيقة','كذب','سر','خطر','فوز','هزيمة',
  'غضب','فرح','حزن','ملل','دهشة','خجل','فخر','ندم','أمان','وحدة',
  'كرة','سباحة','جري','تسلق','ملاكمة','مصارعة','تنس','جولف','ركوب','تزلج',
  'بطولة','كأس','ميدالية','بطل','منافس','فريق','هدف','مباراة','مدرج','تدريب',
  'قصر','برج','جسر','معبد','مسجد','كنيسة','سوق','مستشفى','مدرسة','مكتبة',
  'ميناء','مطار','فندق','ملعب','مسرح','سينما','متحف','حديقة','شارع','ساحة',
  'ذهب','فضة','ماس','لؤلؤ','زمرد','ياقوت','نحاس','حديد','فولاذ','خشب',
  'نار','ماء','هواء','تراب','ضوء','ظلام','صوت','صمت','حركة','سكون',
];

// ── توليد لوحة 5×5
function cnMakeBoard() {
  const words = [...CN_WORDS].sort(() => Math.random() - 0.5).slice(0, 25);
  // الأزرق يبدأ → 9 ، أحمر 8 ، محايد 7 ، قاتل 1
  const types = [
    ...Array(9).fill('blue'), ...Array(8).fill('red'),
    ...Array(7).fill('neutral'), 'assassin',
  ].sort(() => Math.random() - 0.5);
  return words.map((w, i) => ({ word: w, type: types[i], revealed: false, by: null }));
}

// ── قاموس تلميحات AI
const CN_HINT_DB = [
  { h:'مائي',    w:['بحر','نهر','شلال','دلفين','قرش','أخطبوط','سمك','بطة','ميناء','طوفان','سفينة'] },
  { h:'بري',     w:['غابة','أسد','نمر','ذئب','ثعلب','دب','فيل','زرافة','حصان','جمل','أرنب','فهد','كنغر'] },
  { h:'طائر',    w:['طائرة','صاروخ','نسر','طاووس','ببغاء','ديك','شمس','قمر','نجمة','شهاب','مذنب','كوكب'] },
  { h:'قتال',    w:['سيف','رمح','درع','خنجر','قوس','سهم','مطرقة','حرب','جندي','شرطي','ملاكمة','مصارعة'] },
  { h:'حلو',     w:['تمر','عسل','كنافة','بقلاوة','شوكولاتة','آيسكريم','تفاح','برتقال','موز','عنب','رمان','مانجو'] },
  { h:'مشروب',   w:['قهوة','شاي','حليب','ماء','عصير','كوكا'] },
  { h:'تقنية',   w:['حاسوب','هاتف','إنترنت','برنامج','شبكة','روبوت','كاميرا','شاشة','معالج','تشفير','تطبيق','ذكاء'] },
  { h:'مدينة',   w:['رياض','مكة','دبي','القاهرة','بغداد','دمشق','بيروت','الكويت','الدوحة','لندن','باريس','طوكيو'] },
  { h:'مشاعر',   w:['حلم','أمل','خوف','شجاعة','حب','كره','فرح','حزن','غضب','فخر','ندم','أمان','وحدة'] },
  { h:'قيادة',   w:['رئيس','وزير','أمير','ملك','قاضي','محامي','مدرب','حكم'] },
  { h:'رياضة',   w:['كرة','سباحة','جري','تسلق','تنس','جولف','بطولة','كأس','ميدالية','مباراة','مدرج'] },
  { h:'فن',      w:['شاعر','فنان','مغني','رسام','نحات','كاتب','مخرج','ممثل','مسرح','سينما','موسيقى'] },
  { h:'بناء',    w:['قصر','برج','جسر','معبد','مسجد','كنيسة','مستشفى','مدرسة','فندق','ملعب','متحف'] },
  { h:'ظاهرة',   w:['برق','رعد','طوفان','زلزال','بركان','ضباب','قوس قزح','شهاب','عاصفة','ثلج'] },
  { h:'سفر',     w:['طائرة','سفينة','قطار','سيارة','دراجة','مطار','ميناء','فندق'] },
  { h:'معدن',    w:['ذهب','فضة','ماس','لؤلؤ','زمرد','ياقوت','نحاس','حديد','فولاذ'] },
  { h:'صغير',    w:['أرنب','قط','نحلة','عقرب','فأر','دودة','ببغاء','بطة'] },
  { h:'خطر',     w:['أسد','نمر','ذئب','قرش','تمساح','ثعبان','عقرب','بركان','فيروس','اختراق'] },
  { h:'أدوات',   w:['مفتاح','قفل','مطرقة','مسمار','حبل','سكين','ملعقة','مرآة','شمعة'] },
  { h:'طبيعة',   w:['جبل','بحر','نهر','صحراء','غابة','كهف','جزيرة','صخرة','رمل','طين','جليد'] },
];

// ── منطق تلميح AI (يحاول تغطية أكبر عدد بدون لمس كلمات الخصم أو القاتل)
function cnAIHint(board, team) {
  const mine   = board.filter(c => c.type === team && !c.revealed).map(c => c.word);
  const danger = board.filter(c => !c.revealed && c.type !== team && c.type !== 'neutral').map(c => c.word);
  if (!mine.length) return { word: 'عبور', count: 0 };

  let best = null, bestScore = 0;
  for (const entry of CN_HINT_DB) {
    const myHits     = entry.w.filter(w => mine.includes(w));
    const dangerHit  = entry.w.some(w => danger.includes(w));
    if (dangerHit || myHits.length === 0) continue;
    // بونص إذا كان التلميح يغطي 2+ كلمات
    const score = myHits.length * 10 - (dangerHit ? 100 : 0);
    if (score > bestScore) { bestScore = score; best = { word: entry.h, count: Math.min(myHits.length, 3), targets: myHits }; }
  }

  if (!best) {
    // fallback: اسم الكلمة الأولى مقطوع حرف
    const w = mine[Math.floor(Math.random() * mine.length)];
    return { word: w.length > 2 ? w.slice(0, -1) : 'إشارة', count: 1 };
  }
  return best;
}

// ── تخمين AI (يطابق كلمات الـ targets أولاً ثم عشوائي)
function cnAIPick(board, team, hint) {
  const mine = board.filter(c => c.type === team && !c.revealed);
  if (!mine.length) return null;
  // حاول تطابق targets من قاموس التلميح
  const entry = CN_HINT_DB.find(e => e.h === hint?.word);
  if (entry) {
    const match = mine.find(c => entry.w.includes(c.word));
    if (match) return match.word;
  }
  return mine[Math.floor(Math.random() * mine.length)].word;
}

// ── معالجة تخمين (مشترك)
async function cnDoGuess(gameId, game, word, playerName) {
  const idx  = game.board.findIndex(c => c.word === word && !c.revealed);
  if (idx < 0) return null;
  const card      = game.board[idx];
  const team      = game.currentTurn;
  let blueLeft    = game.blueLeft;
  let redLeft     = game.redLeft;
  let guessesLeft = game.guessesLeft - 1;
  let nextTurn    = team;
  let nextPhase   = 'guess';
  let winner      = null;

  if (card.type === 'assassin') {
    winner = team === 'blue' ? 'red' : 'blue';
  } else {
    if (card.type === 'blue')  blueLeft--;
    if (card.type === 'red')   redLeft--;
    if      (blueLeft <= 0)  winner = 'blue';
    else if (redLeft  <= 0)  winner = 'red';
    else if (card.type !== team || guessesLeft <= 0) {
      nextTurn  = team === 'blue' ? 'red' : 'blue';
      nextPhase = 'hint';
      guessesLeft = 0;
    }
  }

  const log = { type:'guess', team, player: playerName, word, cardType: card.type, correct: card.type === team, t: new Date() };
  const $s  = {
    [`board.${idx}.revealed`]: true, [`board.${idx}.by`]: playerName,
    blueLeft, redLeft, guessesLeft,
    currentTurn: winner ? team : nextTurn,
    currentPhase: winner ? 'over' : nextPhase,
    updatedAt: new Date(),
  };
  if (nextPhase === 'hint' && !winner) $s.currentHint = null;
  if (winner) { $s.winner = winner; $s.status = 'finished'; }

  await cnGamesCol.updateOne({ _id: new ObjectId(gameId) }, { $set: $s, $push: { log } });
  io.to('cn:' + gameId).emit('cn:update');
  if (winner) { await cnGivePoints(game, winner); io.to('cn:lobby').emit('cn:lobby'); }
  return { card, winner, nextTurn: $s.currentTurn, nextPhase: $s.currentPhase };
}

async function cnGivePoints(game, winner) {
  if (!cnStatsCol) return;
  const team = winner === 'blue' ? ['blueSpy','blueOp'] : ['redSpy','redOp'];
  for (const key of team) {
    const p = game.players[key];
    if (!p || p.isAI) continue;
    await cnStatsCol.updateOne({ userId: p.id },
      { $inc: { points: 1, wins: 1 }, $set: { username: p.username, avatar: p.avatar, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true });
  }
}

// ── دور AI كامل
async function cnAIHintTurn(gameId) {
  try {
    const g = await cnGamesCol.findOne({ _id: new ObjectId(gameId) });
    if (!g || g.status !== 'active' || g.currentTurn !== 'red' || g.currentPhase !== 'hint') return;
    const hint = cnAIHint(g.board, 'red');
    await cnGamesCol.updateOne({ _id: new ObjectId(gameId) }, {
      $set: { currentHint: hint, currentPhase: 'guess', guessesLeft: hint.count + 1, updatedAt: new Date() },
      $push: { log: { type:'hint', team:'red', player:'🤖 AI', word: hint.word, count: hint.count, t: new Date() } },
    });
    io.to('cn:' + gameId).emit('cn:hint_popup', { team:'red', player:'🤖 AI', word: hint.word, count: hint.count });
    io.to('cn:' + gameId).emit('cn:update');
    setTimeout(() => cnAIGuessTurn(gameId), 2200);
  } catch(e) { console.error('cnAIHintTurn', e.message); }
}

async function cnAIGuessTurn(gameId) {
  try {
    const g = await cnGamesCol.findOne({ _id: new ObjectId(gameId) });
    if (!g || g.status !== 'active' || g.currentTurn !== 'red' || g.currentPhase !== 'guess') return;
    if (g.guessesLeft <= 0) { await cnPassTurn(gameId, g); return; }
    const pick = cnAIPick(g.board, 'red', g.currentHint);
    if (!pick) { await cnPassTurn(gameId, g); return; }
    const res = await cnDoGuess(gameId, g, pick, '🤖 AI');
    if (res && !res.winner && res.nextTurn === 'red' && res.nextPhase === 'guess')
      setTimeout(() => cnAIGuessTurn(gameId), 2000);
  } catch(e) { console.error('cnAIGuessTurn', e.message); }
}

async function cnPassTurn(gameId, game) {
  const next = game.currentTurn === 'blue' ? 'red' : 'blue';
  await cnGamesCol.updateOne({ _id: new ObjectId(gameId) }, {
    $set: { currentTurn: next, currentPhase: 'hint', currentHint: null, guessesLeft: 0, updatedAt: new Date() },
    $push: { log: { type:'pass', team: game.currentTurn, player: game.currentTurn === 'red' ? '🤖 AI' : '?', t: new Date() } },
  });
  io.to('cn:' + gameId).emit('cn:update');
}

// ── Routes

app.get('/api/cn/games', requireAuth, async (req, res) => {
  try {
    const gs = await cnGamesCol.find({}, { projection:{ board:0 } }).sort({ status:1, createdAt:-1 }).limit(50).toArray();
    res.json(gs);
  } catch(e) { res.json([]); }
});

app.get('/api/cn/leaderboard', async (req, res) => {
  try {
    if (!cnStatsCol) return res.json([]);
    res.json(await cnStatsCol.find().sort({ points:-1 }).limit(10).toArray());
  } catch(e) { res.json([]); }
});

app.post('/api/cn/create', requireAuth, async (req, res) => {
  try {
    const { vsAI, myRole } = req.body;
    const u  = req.session.user;
    const me = {
      id:       u.id,
      username: u.global_name || u.username,
      avatar:   u.avatar
        ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64`
        : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(u.id) % 5n)}.png`,
    };
    const roles   = ['blueSpy','blueOp','redSpy','redOp'];
    const role    = roles.includes(myRole) ? myRole : 'blueSpy';
    const players = { blueSpy:null, blueOp:null, redSpy:null, redOp:null };
    if (vsAI) {
      players.redSpy = { id:'AI', username:'🤖 AI', avatar:null, isAI:true };
      players.redOp  = { id:'AI', username:'🤖 AI', avatar:null, isAI:true };
    }
    players[role] = { ...me, role };
    const ready = roles.every(r => players[r] !== null);
    const game  = {
      status:'waiting', vsAI:!!vsAI, board: cnMakeBoard(), players,
      currentTurn:'blue', currentPhase:'hint', currentHint:null, guessesLeft:0,
      blueLeft:9, redLeft:8, winner:null, log:[], createdAt:new Date(), updatedAt:new Date(),
    };
    if (ready) game.status = 'active';
    const r = await cnGamesCol.insertOne(game);
    io.to('cn:lobby').emit('cn:lobby');
    res.json({ ok:true, gameId: r.insertedId });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cn/join/:id', requireAuth, async (req, res) => {
  try {
    const { role } = req.body;
    const roles    = ['blueSpy','blueOp','redSpy','redOp'];
    if (!roles.includes(role)) return res.status(400).json({ error:'bad role' });
    const g = await cnGamesCol.findOne({ _id: new ObjectId(req.params.id) });
    if (!g)                       return res.status(404).json({ error:'not found' });
    if (g.status !== 'waiting')   return res.status(400).json({ error:'started' });
    if (g.players[role])          return res.status(400).json({ error:'taken' });
    if (roles.some(r => g.players[r]?.id === req.session.user.id))
      return res.status(400).json({ error:'already in' });
    const u  = req.session.user;
    const me = {
      id:       u.id, username: u.global_name || u.username, role,
      avatar:   u.avatar
        ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64`
        : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(u.id) % 5n)}.png`,
    };
    const upd   = { ...g.players, [role]: me };
    const ready = roles.every(r => upd[r] !== null);
    await cnGamesCol.updateOne({ _id: new ObjectId(req.params.id) },
      { $set: { [`players.${role}`]: me, status: ready ? 'active' : 'waiting', updatedAt: new Date() } });
    io.to('cn:' + req.params.id).emit('cn:update');
    io.to('cn:lobby').emit('cn:lobby');
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/cn/game/:id', requireAuth, async (req, res) => {
  try {
    const g = await cnGamesCol.findOne({ _id: new ObjectId(req.params.id) });
    if (!g) return res.status(404).json({ error:'not found' });
    const uid  = req.session.user.id;
    const isSpy = g.players.blueSpy?.id === uid || g.players.redSpy?.id === uid;
    const out  = JSON.parse(JSON.stringify(g));
    if (!isSpy) out.board = out.board.map(c => ({ ...c, type: c.revealed ? c.type : 'hidden' }));
    res.json(out);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cn/game/:id/hint', requireAuth, async (req, res) => {
  try {
    const { word, count } = req.body;
    if (!word || !count || count < 1 || count > 9) return res.status(400).json({ error:'invalid' });
    const g = await cnGamesCol.findOne({ _id: new ObjectId(req.params.id) });
    if (!g || g.status !== 'active')  return res.status(400).json({ error:'not active' });
    if (g.currentPhase !== 'hint')     return res.status(400).json({ error:'not hint phase' });
    const spyKey = g.currentTurn === 'blue' ? 'blueSpy' : 'redSpy';
    if (g.players[spyKey]?.id !== req.session.user.id) return res.status(403).json({ error:'not your turn' });
    const w = word.trim();
    if (g.board.some(c => c.word.toLowerCase() === w.toLowerCase()))
      return res.status(400).json({ error:'word is on board' });
    const hintObj = { word: w, count: parseInt(count), team: g.currentTurn };
    await cnGamesCol.updateOne({ _id: new ObjectId(req.params.id) }, {
      $set: { currentHint: hintObj, currentPhase:'guess', guessesLeft: parseInt(count)+1, updatedAt: new Date() },
      $push: { log: { type:'hint', team: g.currentTurn, player: g.players[spyKey].username, word:w, count: parseInt(count), t: new Date() } },
    });
    io.to('cn:' + req.params.id).emit('cn:hint_popup', { team: g.currentTurn, player: g.players[spyKey].username, word:w, count: parseInt(count) });
    io.to('cn:' + req.params.id).emit('cn:update');
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cn/game/:id/guess', requireAuth, async (req, res) => {
  try {
    const { word } = req.body;
    const g = await cnGamesCol.findOne({ _id: new ObjectId(req.params.id) });
    if (!g || g.status !== 'active')  return res.status(400).json({ error:'not active' });
    if (g.currentPhase !== 'guess')    return res.status(400).json({ error:'not guess phase' });
    const opKey = g.currentTurn === 'blue' ? 'blueOp' : 'redOp';
    if (g.players[opKey]?.id !== req.session.user.id) return res.status(403).json({ error:'not your turn' });
    const result = await cnDoGuess(req.params.id, g, word, g.players[opKey].username);
    if (!result) return res.status(400).json({ error:'invalid word' });
    res.json({ ok:true, cardType: result.card.type, winner: result.winner });
    if (!result.winner && result.nextTurn === 'red' && g.vsAI) {
      if (result.nextPhase === 'hint')  setTimeout(() => cnAIHintTurn(req.params.id), 1600);
      if (result.nextPhase === 'guess') setTimeout(() => cnAIGuessTurn(req.params.id), 1600);
    }
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cn/game/:id/pass', requireAuth, async (req, res) => {
  try {
    const g = await cnGamesCol.findOne({ _id: new ObjectId(req.params.id) });
    if (!g || g.status !== 'active')  return res.status(400).json({ error:'not active' });
    if (g.currentPhase !== 'guess')    return res.status(400).json({ error:'not guess phase' });
    const opKey = g.currentTurn === 'blue' ? 'blueOp' : 'redOp';
    if (g.players[opKey]?.id !== req.session.user.id) return res.status(403).json({ error:'not your turn' });
    await cnPassTurn(req.params.id, g);
    res.json({ ok:true });
    if (g.vsAI && g.currentTurn === 'blue') setTimeout(() => cnAIHintTurn(req.params.id), 1400);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Socket.IO rooms
io.on('connection', socket => {
  socket.on('cn:lobby',      ()  => socket.join('cn:lobby'));
  socket.on('cn:join',       id  => socket.join('cn:' + id));
  socket.on('cn:leave',      id  => socket.leave('cn:' + id));
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
  httpSrv.listen(PORT, () => {
    console.log(`Server on port ${PORT}`);
    console.log(`BASE_URL: ${BASE_URL}`);
    console.log(`CLIENT_SECRET: ${CONFIG.CLIENT_SECRET ? 'set' : 'MISSING'}`);
  });
})();
