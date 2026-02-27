const express = require('express');
const session = require('express-session');
const axios   = require('axios');
const path    = require('path');
const { MongoClient, ObjectId } = require('mongodb');

const app      = express();
const GUILD_ID      = '1421088112808951852';
const STAFF_ROLE_ID = '1471530512622555297';
const ADMIN_ROLE_ID = '1471922925681639625';

// ── مناصب الرول بلاي ──────────────────────────────────────────
const RP_ROLES = {
  '1471551621337972938': { name: 'وزير العدل',       icon: '⚖️',  color: '#ff9900' },
  '1474275740756480389': { name: 'قائد قطاع CIA',    icon: '🕵️', color: '#00c8ff' },
  '1471575274222125236': { name: 'قائد الشرطة',      icon: '👮',  color: '#4a90d9' },
  '1474276207225733170': { name: 'أعضاء CIA',         icon: '🔵',  color: '#0099cc' },
  '1471908537331617976': { name: 'أعضاء LSPD',        icon: '🚔',  color: '#2266cc' },
  '1471915477063176467': { name: 'وزير الدفاع المدني',icon: '🛡️', color: '#33aa55' },
  '1471916760826511524': { name: 'وزير الصحة',        icon: '🏥',  color: '#ff5555' },
  '1472606415892774972': { name: 'المجرمون',           icon: '💀',  color: '#aa0000' },
};

const CIA_ROLE_IDS  = ['1474275740756480389', '1474276207225733170'];
const LSPD_ROLE_IDS = ['1471575274222125236', '1471908537331617976'];

// ── CONFIG ───────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.REDIRECT_URI
  ? process.env.REDIRECT_URI.replace('/auth/callback', '')
  : (process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : `http://localhost:${PORT}`);

const CONFIG = {
  CLIENT_ID:      process.env.CLIENT_ID      || '1476983875598024824',
  CLIENT_SECRET:  process.env.CLIENT_SECRET  || '',
  REDIRECT_URI:   `${BASE_URL}/auth/callback`,
  SESSION_SECRET: process.env.SESSION_SECRET || 'change-this-secret',
  BOT_TOKEN:      process.env.BOT_TOKEN      || '',
  BOT_SECRET:     process.env.BOT_SECRET     || 'bot-secret-change-this',
  MONGO_URI:      process.env.MONGO_URI      || 'mongodb+srv://jp1_2026:zoro_amak3@cluster0.gzhivoi.mongodb.net/islam-bot',
  PORT,
};

const SCOPES      = 'identify email guilds';
const OAUTH_URL   = `https://discord.com/oauth2/authorize?client_id=${CONFIG.CLIENT_ID}&redirect_uri=${encodeURIComponent(CONFIG.REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(SCOPES)}`;
const DISCORD_API = 'https://discord.com/api/v10';

// ── MongoDB ──────────────────────────────────────────────────
let db, ratingsCol, announcementsCol, rpCacheCol;

async function connectMongo() {
  try {
    const client = new MongoClient(CONFIG.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
    await client.connect();
    db = client.db('islam-bot');
    ratingsCol       = db.collection('website_ratings');
    announcementsCol = db.collection('website_announcements');
    rpCacheCol       = db.collection('rp_members_cache');
    console.log('✅ MongoDB connected');
    setTimeout(() => syncRpMembers(), 3000);
  } catch(e) {
    console.error('❌ MongoDB connection failed:', e.message);
  }
}

async function fetchAllMembers() {
  if (!CONFIG.BOT_TOKEN) return [];
  let allMembers = [], lastId = null;
  while (true) {
    const url = lastId
      ? `${DISCORD_API}/guilds/${GUILD_ID}/members?limit=1000&after=${lastId}`
      : `${DISCORD_API}/guilds/${GUILD_ID}/members?limit=1000`;
    const batch = await axios.get(url, { headers: { Authorization: `Bot ${CONFIG.BOT_TOKEN}` } });
    allMembers = allMembers.concat(batch.data);
    if (batch.data.length < 1000) break;
    lastId = batch.data[batch.data.length - 1].user.id;
  }
  return allMembers;
}

async function syncRpMembers() {
  if (!rpCacheCol || !CONFIG.BOT_TOKEN) return;
  try {
    console.log('🔄 Syncing RP members...');
    const allMembers = await fetchAllMembers();
    const rpData = {};
    for (const roleId of Object.keys(RP_ROLES)) rpData[roleId] = [];

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
            : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(m.user.id) % 5n)}.png`
        });
      }
    }
    await rpCacheCol.replaceOne({ _id: 'rp_cache' }, { _id: 'rp_cache', data: rpData, updatedAt: new Date() }, { upsert: true });
    console.log('✅ RP members synced');
  } catch(e) {
    console.error('❌ RP sync error:', e.message);
  }
}

setInterval(() => syncRpMembers(), 7 * 24 * 60 * 60 * 1000);

// ── MIDDLEWARE ───────────────────────────────────────────────
app.set('trust proxy', 1);
app.use(express.json());
app.use(session({
  secret: CONFIG.SESSION_SECRET,
  resave: true,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true, sameSite: 'lax', maxAge: 86400000 * 7 }
}));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/dashboard', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

app.get('/auth/discord', (req, res) => res.redirect(OAUTH_URL));

app.get('/auth/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) return res.redirect('/?error=access_denied');
  try {
    const tokenRes = await axios.post(`${DISCORD_API}/oauth2/token`,
      new URLSearchParams({ client_id: CONFIG.CLIENT_ID, client_secret: CONFIG.CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: CONFIG.REDIRECT_URI }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const userRes = await axios.get(`${DISCORD_API}/users/@me`, { headers: { Authorization: `Bearer ${tokenRes.data.access_token}` } });
    req.session.user   = userRes.data;
    req.session.tokens = tokenRes.data;
    await new Promise((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
    res.redirect('/dashboard');
  } catch(e) {
    console.error('Auth error:', e.response?.data || e.message);
    res.redirect('/?error=auth_failed');
  }
});

app.get('/auth/user', requireAuth, (req, res) => res.json(req.session.user));
app.get('/auth/logout', (req, res) => req.session.destroy(() => res.redirect('/')));

app.get('/api/guild', async (req, res) => {
  try {
    const r = await axios.get(`${DISCORD_API}/guilds/${GUILD_ID}?with_counts=true`, { headers: { Authorization: `Bot ${CONFIG.BOT_TOKEN}` } });
    res.json({ approximate_member_count: r.data.approximate_member_count, approximate_presence_count: r.data.approximate_presence_count });
  } catch(e) { res.status(500).json({}); }
});

app.get('/api/member/:userId', requireAuth, async (req, res) => {
  try {
    const [memberRes, rolesRes] = await Promise.all([
      axios.get(`${DISCORD_API}/guilds/${GUILD_ID}/members/${req.params.userId}`, { headers: { Authorization: `Bot ${CONFIG.BOT_TOKEN}` } }),
      axios.get(`${DISCORD_API}/guilds/${GUILD_ID}/roles`, { headers: { Authorization: `Bot ${CONFIG.BOT_TOKEN}` } })
    ]);
    const guildRoles = rolesRes.data;
    const memberRoleIds = memberRes.data.roles || [];
    const roles = memberRoleIds.map(id => guildRoles.find(r => r.id === id)).filter(r => r && r.name !== '@everyone')
      .map(r => ({ id: r.id, name: r.name, color: r.color ? '#' + r.color.toString(16).padStart(6,'0') : null }));
    const isWebAdmin = memberRoleIds.includes(ADMIN_ROLE_ID);
    const isDiscordAdmin = memberRoleIds.some(rid => { const role = guildRoles.find(r => r.id === rid); return role && (role.permissions & 0x8) === 0x8; });
    res.json({ roles, isAdmin: isWebAdmin || isDiscordAdmin, isWebAdmin });
  } catch(e) { res.status(500).json({ roles: [], isAdmin: false, isWebAdmin: false }); }
});

app.get('/api/staff', async (req, res) => {
  try {
    const rolesRes = await axios.get(`${DISCORD_API}/guilds/${GUILD_ID}/roles`, { headers: { Authorization: `Bot ${CONFIG.BOT_TOKEN}` } });
    const staffRole = rolesRes.data.find(r => r.id === STAFF_ROLE_ID);
    const allMembers = await fetchAllMembers();
    const staff = allMembers.filter(m => m.roles.includes(STAFF_ROLE_ID) && !m.user.bot).map(m => ({
      id: m.user.id, name: m.nick || m.user.global_name || m.user.username,
      role: staffRole ? staffRole.name : 'الفريق',
      avatar: m.user.avatar ? `https://cdn.discordapp.com/avatars/${m.user.id}/${m.user.avatar}.png?size=64` : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(m.user.id) % 5n)}.png`
    }));
    res.json(staff);
  } catch(e) { res.status(500).json([]); }
});

app.get('/api/rp-members', async (req, res) => {
  try {
    if (!rpCacheCol) return res.json({ data: {}, updatedAt: null, roles: RP_ROLES });
    const cache = await rpCacheCol.findOne({ _id: 'rp_cache' });
    res.json({ data: cache?.data || {}, updatedAt: cache?.updatedAt || null, roles: RP_ROLES });
  } catch(e) { res.status(500).json({ data: {}, updatedAt: null, roles: RP_ROLES }); }
});

app.post('/api/rp-sync', requireAuth, async (req, res) => {
  try {
    const memberRes = await axios.get(`${DISCORD_API}/guilds/${GUILD_ID}/members/${req.session.user.id}`, { headers: { Authorization: `Bot ${CONFIG.BOT_TOKEN}` } });
    if (!memberRes.data.roles.includes(ADMIN_ROLE_ID)) return res.status(403).json({ error: 'forbidden' });
    await syncRpMembers();
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/ratings', async (req, res) => {
  try {
    if (!ratingsCol) return res.json([]);
    const data = await ratingsCol.find().sort({ createdAt: -1 }).limit(50).toArray();
    res.json(data);
  } catch(e) { res.status(500).json([]); }
});

app.post('/api/ratings', requireAuth, async (req, res) => {
  const { stars, text, username, avatar } = req.body;
  if (!stars || stars < 1 || stars > 5) return res.status(400).json({ error: 'invalid stars' });
  if (!ratingsCol) return res.status(500).json({ error: 'db not connected' });
  try {
    const userId = req.session.user.id;
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
    const memberRes = await axios.get(`${DISCORD_API}/guilds/${GUILD_ID}/members/${req.session.user.id}`, { headers: { Authorization: `Bot ${CONFIG.BOT_TOKEN}` } });
    if (!memberRes.data.roles.includes(ADMIN_ROLE_ID)) return res.status(403).json({ error: 'forbidden' });
    await ratingsCol.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/announcements', async (req, res) => {
  try {
    if (!announcementsCol) return res.json([]);
    const data = await announcementsCol.find().sort({ createdAt: -1 }).limit(20).toArray();
    res.json(data);
  } catch(e) { res.status(500).json([]); }
});

app.post('/api/announcements', requireAuth, async (req, res) => {
  try {
    const memberRes = await axios.get(`${DISCORD_API}/guilds/${GUILD_ID}/members/${req.session.user.id}`, { headers: { Authorization: `Bot ${CONFIG.BOT_TOKEN}` } });
    if (!memberRes.data.roles.includes(ADMIN_ROLE_ID)) return res.status(403).json({ error: 'forbidden' });
    const { title, content, icon } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'missing fields' });
    await announcementsCol.insertOne({ title, content, icon: icon || '📢', createdAt: new Date() });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/announcements/:id', requireAuth, async (req, res) => {
  try {
    const memberRes = await axios.get(`${DISCORD_API}/guilds/${GUILD_ID}/members/${req.session.user.id}`, { headers: { Authorization: `Bot ${CONFIG.BOT_TOKEN}` } });
    if (!memberRes.data.roles.includes(ADMIN_ROLE_ID)) return res.status(403).json({ error: 'forbidden' });
    await announcementsCol.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/bot/announcement', async (req, res) => {
  const secret = req.headers['x-bot-secret'];
  if (secret !== CONFIG.BOT_SECRET) return res.status(401).json({ error: 'unauthorized' });
  const { title, content, icon } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'missing fields' });
  try {
    if (announcementsCol) await announcementsCol.insertOne({ title, content, icon: icon || '📢', createdAt: new Date() });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

function requireAuth(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/');
}

(async () => {
  await connectMongo();
  app.listen(CONFIG.PORT, () => {
    console.log(`\n🚀 Server: http://localhost:${CONFIG.PORT}`);
    console.log(`🔗 Redirect URI: ${CONFIG.REDIRECT_URI}\n`);
  });
})();
