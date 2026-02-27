const express = require('express');
const session = require('express-session');
const axios   = require('axios');
const path    = require('path');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();

const GUILD_ID      = '1421088112808951852';
const STAFF_ROLE_ID = '1471530512622555297';
const ADMIN_ROLE_ID = '1471922925681639625';

const RP_ROLES = {
  '1471551621337972938': { name: 'وزير العدل',        icon: '⚖️',  color: '#ff9900' },
  '1474275740756480389': { name: 'قائد قطاع CIA',     icon: '🕵️', color: '#00c8ff' },
  '1471575274222125236': { name: 'قائد الشرطة',       icon: '👮',  color: '#4a90d9' },
  '1474276207225733170': { name: 'أعضاء CIA',          icon: '🔵',  color: '#0099cc' },
  '1471908537331617976': { name: 'أعضاء LSPD',         icon: '🚔',  color: '#2266cc' },
  '1471915477063176467': { name: 'وزير الدفاع المدني', icon: '🛡️', color: '#33aa55' },
  '1471916760826511524': { name: 'وزير الصحة',         icon: '🏥',  color: '#ff5555' },
  '1472606415892774972': { name: 'المجرمون',            icon: '💀',  color: '#aa0000' },
};

const CIA_ROLE_IDS  = ['1474275740756480389', '1474276207225733170'];
const LSPD_ROLE_IDS = ['1471575274222125236', '1471908537331617976'];

// ── Webhooks ──────────────────────────────────────────────────
const WH_LOGIN        = 'https://discord.com/api/webhooks/1477005402397737112/kTgSPRMiM-RjGygKYmstFoERZl-IDro83Inhy9_iSuOPNHYO0q2imUNAxKAQfgTFycGR';
const WH_ANNOUNCEMENT = 'https://discord.com/api/webhooks/1477037146727514314/EnsU8mfgA4f-Z_HLbIZMmtcFkFi_t_ZfhCkBkl7HEr8ynugPZelL-eJxEr1nkt_r4QCV';

// ── CONFIG ───────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

function getBaseUrl() {
  if (process.env.REDIRECT_URI)          return process.env.REDIRECT_URI.replace('/auth/callback', '');
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  if (process.env.RAILWAY_STATIC_URL)    return process.env.RAILWAY_STATIC_URL;
  return `http://localhost:${PORT}`;
}

const BASE_URL    = getBaseUrl();
const REDIRECT_URI = `${BASE_URL}/auth/callback`;

console.log('🌐 BASE_URL:', BASE_URL);
console.log('🔗 REDIRECT_URI:', REDIRECT_URI);

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
  const p = new URLSearchParams({
    client_id:     CONFIG.CLIENT_ID,
    redirect_uri:  REDIRECT_URI,
    response_type: 'code',
    scope:         SCOPES,
  });
  return `https://discord.com/oauth2/authorize?${p.toString()}`;
}

// ══════════════════════════════════════════════════════════════
//  WEBHOOK HELPERS
// ══════════════════════════════════════════════════════════════

// 🔐 لوق تسجيل الدخول
async function sendLoginWebhook(user) {
  try {
    const avatar = user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
      : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(user.id) % 5n)}.png`;

    const now = new Date();
    const timeStr = now.toLocaleString('ar-SA', {
      timeZone: 'Asia/Riyadh',
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });

    await axios.post(WH_LOGIN, {
      username:   'Live Zone | سجل الدخول',
      avatar_url: avatar,
      embeds: [{
        title:     '🔐 تسجيل دخول جديد',
        color:     0x00c8ff,
        thumbnail: { url: avatar },
        fields: [
          { name: '👤 الاسم',        value: `\`${user.global_name || user.username}\``, inline: true  },
          { name: '🏷️ المعرّف',     value: `\`@${user.username}\``,                     inline: true  },
          { name: '🆔 Discord ID',   value: `\`${user.id}\``,                            inline: true  },
          { name: '📧 البريد',       value: user.email ? `\`${user.email}\`` : '`—`',    inline: true  },
          { name: '✅ تحقق البريد',  value: user.verified ? '`نعم ✅`' : '`لا ❌`',      inline: true  },
          { name: '💎 Nitro',        value: user.premium_type ? '`مشترك ✨`' : '`لا`',   inline: true  },
          { name: '🕐 وقت الدخول',  value: `\`${timeStr}\``,                             inline: false },
        ],
        footer: {
          text:      'Live Zone Website • سجل الدخول',
          icon_url:  avatar,
        },
        timestamp: now.toISOString(),
      }],
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 5000 });

    console.log(`📨 Login webhook sent: ${user.username}`);
  } catch(e) {
    console.error('❌ Login webhook error:', e.response?.data || e.message);
  }
}

// 📢 ويبهوك الإعلانات مع @everyone
async function sendAnnouncementWebhook(title, content, icon, postedBy) {
  try {
    const now = new Date();
    const timeStr = now.toLocaleString('ar-SA', {
      timeZone: 'Asia/Riyadh',
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    await axios.post(WH_ANNOUNCEMENT, {
      content:    '@everyone',   // منشن ايفري ون
      username:   'Live Zone | الإعلانات',
      avatar_url: 'https://cdn.discordapp.com/embed/avatars/5.png',
      embeds: [{
        title:       `${icon || '📢'}  ${title}`,
        description: content,
        color:       0xffc832,
        fields: [
          { name: '👤 نُشر بواسطة', value: `\`${postedBy || 'الإدارة'}\``, inline: true  },
          { name: '🕐 وقت النشر',   value: `\`${timeStr}\``,                inline: true  },
        ],
        footer: {
          text: 'Live Zone Website • قسم الإعلانات',
        },
        timestamp: now.toISOString(),
      }],
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 5000 });

    console.log(`📢 Announcement webhook sent: ${title}`);
  } catch(e) {
    console.error('❌ Announcement webhook error:', e.response?.data || e.message);
  }
}

// ── MongoDB ──────────────────────────────────────────────────
let ratingsCol, announcementsCol, rpCacheCol;

async function connectMongo() {
  try {
    const client = new MongoClient(CONFIG.MONGO_URI, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
    });
    await client.connect();
    const db     = client.db('islam-bot');
    ratingsCol       = db.collection('website_ratings');
    announcementsCol = db.collection('website_announcements');
    rpCacheCol       = db.collection('rp_members_cache');
    console.log('✅ MongoDB connected');
    setTimeout(() => syncRpMembers(), 5000);
  } catch(e) {
    console.error('❌ MongoDB error:', e.message);
  }
}

async function fetchAllMembers() {
  if (!CONFIG.BOT_TOKEN) return [];
  let allMembers = [], lastId = null;
  while (true) {
    const url = lastId
      ? `${DISCORD_API}/guilds/${GUILD_ID}/members?limit=1000&after=${lastId}`
      : `${DISCORD_API}/guilds/${GUILD_ID}/members?limit=1000`;
    const r = await axios.get(url, { headers: { Authorization: `Bot ${CONFIG.BOT_TOKEN}` } });
    allMembers = allMembers.concat(r.data);
    if (r.data.length < 1000) break;
    lastId = r.data[r.data.length - 1].user.id;
  }
  return allMembers;
}

async function syncRpMembers() {
  if (!rpCacheCol || !CONFIG.BOT_TOKEN) return;
  try {
    console.log('🔄 Syncing RP members...');
    const allMembers = await fetchAllMembers();
    const rpData = {};
    for (const rid of Object.keys(RP_ROLES)) rpData[rid] = [];

    for (const m of allMembers) {
      if (m.user.bot) continue;
      const memberRoles = m.roles || [];
      const isCIA = memberRoles.some(r => CIA_ROLE_IDS.includes(r));
      for (const roleId of Object.keys(RP_ROLES)) {
        if (!memberRoles.includes(roleId)) continue;
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
    await rpCacheCol.replaceOne(
      { _id: 'rp_cache' },
      { _id: 'rp_cache', data: rpData, updatedAt: new Date() },
      { upsert: true }
    );
    console.log('✅ RP synced');
  } catch(e) {
    console.error('❌ RP sync error:', e.message);
  }
}

setInterval(() => syncRpMembers(), 7 * 24 * 60 * 60 * 1000);

// ── MIDDLEWARE ───────────────────────────────────────────────
app.set('trust proxy', true);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Debug log
app.use((req, res, next) => {
  if (req.path.startsWith('/auth')) {
    console.log(`[${req.method}] ${req.path} | user=${!!req.session?.user}`);
  }
  next();
});

// ── PAGES ────────────────────────────────────────────────────
app.get('/', (req, res) => {
  if (req.session?.user) return res.redirect('/dashboard');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard', (req, res) => {
  if (!req.session?.user) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// ── AUTH ─────────────────────────────────────────────────────
app.get('/auth/discord', (req, res) => {
  const url = buildOAuthUrl();
  console.log('🔀 OAuth redirect:', url);
  res.redirect(url);
});

app.get('/auth/callback', async (req, res) => {
  const { code, error, error_description } = req.query;
  console.log('📥 Callback:', { code: !!code, error, error_description });

  if (error || !code) {
    console.error('❌ OAuth error:', error, error_description);
    return res.redirect('/?error=' + encodeURIComponent(error || 'no_code'));
  }

  try {
    // 1. Exchange code for token
    const tokenRes = await axios.post(
      `${DISCORD_API}/oauth2/token`,
      new URLSearchParams({
        client_id:     CONFIG.CLIENT_ID,
        client_secret: CONFIG.CLIENT_SECRET,
        grant_type:    'authorization_code',
        code,
        redirect_uri:  REDIRECT_URI,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    // 2. Get user info
    const userRes = await axios.get(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
    });

    console.log('✅ User:', userRes.data.username);

    // 3. Save session
    req.session.user   = userRes.data;
    req.session.tokens = {
      access_token:  tokenRes.data.access_token,
      refresh_token: tokenRes.data.refresh_token,
      expires_in:    tokenRes.data.expires_in,
    };

    await new Promise((resolve, reject) =>
      req.session.save(err => err ? reject(err) : resolve())
    );

    // 4. إرسال لوق تسجيل الدخول (لا يوقف العملية لو فشل)
    sendLoginWebhook(userRes.data);

    res.redirect('/dashboard');
  } catch(e) {
    const errData = e.response?.data || e.message;
    console.error('❌ Auth error:', JSON.stringify(errData));
    res.redirect('/?error=' + encodeURIComponent(JSON.stringify(errData).slice(0, 100)));
  }
});

app.get('/auth/user', (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'not authenticated' });
  res.json(req.session.user);
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
});

app.get('/auth/debug', (req, res) => {
  res.json({
    sessionID:   req.sessionID,
    hasUser:     !!req.session?.user,
    username:    req.session?.user?.username,
    BASE_URL,
    REDIRECT_URI,
    isProduction,
    CLIENT_ID:   CONFIG.CLIENT_ID,
    hasSecret:   !!CONFIG.CLIENT_SECRET,
    nodeEnv:     process.env.NODE_ENV,
  });
});

// ── API: Guild ────────────────────────────────────────────────
app.get('/api/guild', async (req, res) => {
  try {
    const r = await axios.get(`${DISCORD_API}/guilds/${GUILD_ID}?with_counts=true`,
      { headers: { Authorization: `Bot ${CONFIG.BOT_TOKEN}` } });
    res.json({
      approximate_member_count:   r.data.approximate_member_count,
      approximate_presence_count: r.data.approximate_presence_count,
    });
  } catch(e) { res.json({}); }
});

// ── API: Member ───────────────────────────────────────────────
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
      .map(r => ({ id: r.id, name: r.name, color: r.color ? '#' + r.color.toString(16).padStart(6,'0') : null }));
    const isWebAdmin      = memberRoleIds.includes(ADMIN_ROLE_ID);
    const isDiscordAdmin  = memberRoleIds.some(rid => {
      const role = guildRoles.find(r => r.id === rid);
      return role && (role.permissions & 0x8) === 0x8;
    });
    res.json({ roles, isAdmin: isWebAdmin || isDiscordAdmin, isWebAdmin });
  } catch(e) { res.json({ roles: [], isAdmin: false, isWebAdmin: false }); }
});

// ── API: Staff ────────────────────────────────────────────────
app.get('/api/staff', async (req, res) => {
  try {
    const rRes     = await axios.get(`${DISCORD_API}/guilds/${GUILD_ID}/roles`, { headers: { Authorization: `Bot ${CONFIG.BOT_TOKEN}` } });
    const staffRole = rRes.data.find(r => r.id === STAFF_ROLE_ID);
    const allMembers = await fetchAllMembers();
    const staff = allMembers
      .filter(m => m.roles.includes(STAFF_ROLE_ID) && !m.user.bot)
      .map(m => ({
        id:     m.user.id,
        name:   m.nick || m.user.global_name || m.user.username,
        role:   staffRole?.name || 'الفريق',
        avatar: m.user.avatar
          ? `https://cdn.discordapp.com/avatars/${m.user.id}/${m.user.avatar}.png?size=64`
          : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(m.user.id) % 5n)}.png`,
      }));
    res.json(staff);
  } catch(e) { res.json([]); }
});

// ── API: RP Members ───────────────────────────────────────────
app.get('/api/rp-members', async (req, res) => {
  try {
    if (!rpCacheCol) return res.json({ data: {}, updatedAt: null, roles: RP_ROLES });
    const cache = await rpCacheCol.findOne({ _id: 'rp_cache' });
    res.json({ data: cache?.data || {}, updatedAt: cache?.updatedAt || null, roles: RP_ROLES });
  } catch(e) { res.json({ data: {}, updatedAt: null, roles: RP_ROLES }); }
});

app.post('/api/rp-sync', requireAuth, async (req, res) => {
  try {
    const mRes = await axios.get(`${DISCORD_API}/guilds/${GUILD_ID}/members/${req.session.user.id}`,
      { headers: { Authorization: `Bot ${CONFIG.BOT_TOKEN}` } });
    if (!mRes.data.roles.includes(ADMIN_ROLE_ID)) return res.status(403).json({ error: 'forbidden' });
    await syncRpMembers();
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── API: Ratings ──────────────────────────────────────────────
app.get('/api/ratings', async (req, res) => {
  try {
    if (!ratingsCol) return res.json([]);
    const data = await ratingsCol.find().sort({ createdAt: -1 }).limit(50).toArray();
    res.json(data);
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
    await ratingsCol.insertOne({
      userId,
      username: username || req.session.user.username,
      avatar:   avatar || '',
      stars,
      text:     text || '',
      createdAt: new Date(),
    });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/ratings/:id', requireAuth, async (req, res) => {
  try {
    const mRes = await axios.get(`${DISCORD_API}/guilds/${GUILD_ID}/members/${req.session.user.id}`,
      { headers: { Authorization: `Bot ${CONFIG.BOT_TOKEN}` } });
    if (!mRes.data.roles.includes(ADMIN_ROLE_ID)) return res.status(403).json({ error: 'forbidden' });
    await ratingsCol.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── API: Announcements ────────────────────────────────────────
app.get('/api/announcements', async (req, res) => {
  try {
    if (!announcementsCol) return res.json([]);
    const data = await announcementsCol.find().sort({ createdAt: -1 }).limit(20).toArray();
    res.json(data);
  } catch(e) { res.json([]); }
});

app.post('/api/announcements', requireAuth, async (req, res) => {
  try {
    const mRes = await axios.get(`${DISCORD_API}/guilds/${GUILD_ID}/members/${req.session.user.id}`,
      { headers: { Authorization: `Bot ${CONFIG.BOT_TOKEN}` } });
    if (!mRes.data.roles.includes(ADMIN_ROLE_ID)) return res.status(403).json({ error: 'forbidden' });

    const { title, content, icon } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'missing fields' });

    // حفظ في قاعدة البيانات
    await announcementsCol.insertOne({ title, content, icon: icon || '📢', createdAt: new Date() });

    // إرسال الويبهوك مع @everyone
    const postedBy = req.session.user.global_name || req.session.user.username;
    sendAnnouncementWebhook(title, content, icon, postedBy);

    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/announcements/:id', requireAuth, async (req, res) => {
  try {
    const mRes = await axios.get(`${DISCORD_API}/guilds/${GUILD_ID}/members/${req.session.user.id}`,
      { headers: { Authorization: `Bot ${CONFIG.BOT_TOKEN}` } });
    if (!mRes.data.roles.includes(ADMIN_ROLE_ID)) return res.status(403).json({ error: 'forbidden' });
    await announcementsCol.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── BOT: Announcement (من البوت مباشرة) ──────────────────────
app.post('/bot/announcement', async (req, res) => {
  if (req.headers['x-bot-secret'] !== CONFIG.BOT_SECRET) return res.status(401).json({ error: 'unauthorized' });
  const { title, content, icon } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'missing fields' });
  try {
    if (announcementsCol) await announcementsCol.insertOne({ title, content, icon: icon || '📢', createdAt: new Date() });
    // إرسال الويبهوك من البوت أيضاً
    sendAnnouncementWebhook(title, content, icon, 'البوت');
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── HEALTH ────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// ── HELPER ───────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session?.user) return next();
  res.status(401).json({ error: 'unauthorized' });
}

// ── START ────────────────────────────────────────────────────
(async () => {
  await connectMongo();
  app.listen(PORT, () => {
    console.log(`\n🚀 Server running on port ${PORT}`);
    console.log(`🌐 BASE_URL:      ${BASE_URL}`);
    console.log(`🔗 REDIRECT_URI:  ${REDIRECT_URI}`);
    console.log(`🔑 CLIENT_SECRET: ${CONFIG.CLIENT_SECRET ? '✅ set' : '❌ MISSING!'}`);
    console.log(`🤖 BOT_TOKEN:     ${CONFIG.BOT_TOKEN ? '✅ set' : '⚠️  missing'}\n`);
  });
})();
