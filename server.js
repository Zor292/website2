const express = require('express');
const session = require('express-session');
const axios   = require('axios');
const path    = require('path');

const app      = express();
const GUILD_ID      = '1421088112808951852';
const STAFF_ROLE_ID = '1471530512622555297';

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
  PORT,
};

const SCOPES      = 'identify email guilds';
const OAUTH_URL   = `https://discord.com/oauth2/authorize?client_id=${CONFIG.CLIENT_ID}&redirect_uri=${encodeURIComponent(CONFIG.REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(SCOPES)}`;
const DISCORD_API = 'https://discord.com/api/v10';

// ── IN-MEMORY STORAGE ────────────────────────────────────────
const ratings       = [];
const announcements = [];

// ── MIDDLEWARE ───────────────────────────────────────────────
app.set('trust proxy', 1);
app.use(express.json());
app.use(session({
  secret: CONFIG.SESSION_SECRET,
  resave: true,
  saveUninitialized: false,
  cookie: { secure: true, httpOnly: true, sameSite: 'lax', maxAge: 86400000 * 7 }
}));
app.use(express.static(path.join(__dirname, 'public')));

// ── PAGES ────────────────────────────────────────────────────
app.get('/', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// ── AUTH ─────────────────────────────────────────────────────
app.get('/auth/discord', (req, res) => {
  console.log('OAuth redirect ->', CONFIG.REDIRECT_URI);
  res.redirect(OAUTH_URL);
});

app.get('/auth/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) return res.redirect('/?error=access_denied');
  try {
    const tokenRes = await axios.post(
      `${DISCORD_API}/oauth2/token`,
      new URLSearchParams({
        client_id:     CONFIG.CLIENT_ID,
        client_secret: CONFIG.CLIENT_SECRET,
        grant_type:    'authorization_code',
        code,
        redirect_uri:  CONFIG.REDIRECT_URI,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const { access_token, refresh_token } = tokenRes.data;
    const userRes = await axios.get(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${access_token}` }
    });
    req.session.user   = userRes.data;
    req.session.tokens = { access_token, refresh_token };
    await new Promise((resolve, reject) =>
      req.session.save(err => err ? reject(err) : resolve())
    );
    console.log(`✅ Login: ${userRes.data.username}`);
    res.redirect('/dashboard');
  } catch(e) {
    console.error('Auth error:', e.response?.data || e.message);
    res.redirect('/?error=auth_failed');
  }
});

app.get('/auth/user',   requireAuth, (req, res) => res.json(req.session.user));
app.get('/auth/logout', (req, res) => req.session.destroy(() => res.redirect('/')));

// ── API: Guild Info ──────────────────────────────────────────
app.get('/api/guild', async (req, res) => {
  try {
    const r = await axios.get(`${DISCORD_API}/guilds/${GUILD_ID}?with_counts=true`,
      { headers: { Authorization: `Bot ${CONFIG.BOT_TOKEN}` } });
    res.json({
      approximate_member_count:   r.data.approximate_member_count,
      approximate_presence_count: r.data.approximate_presence_count,
    });
  } catch(e) { res.status(500).json({}); }
});

// ── API: Member Roles ────────────────────────────────────────
app.get('/api/member/:userId', requireAuth, async (req, res) => {
  try {
    const [memberRes, rolesRes] = await Promise.all([
      axios.get(`${DISCORD_API}/guilds/${GUILD_ID}/members/${req.params.userId}`,
        { headers: { Authorization: `Bot ${CONFIG.BOT_TOKEN}` } }),
      axios.get(`${DISCORD_API}/guilds/${GUILD_ID}/roles`,
        { headers: { Authorization: `Bot ${CONFIG.BOT_TOKEN}` } })
    ]);
    const guildRoles = rolesRes.data;
    const roles = (memberRes.data.roles || [])
      .map(id => guildRoles.find(r => r.id === id))
      .filter(r => r && r.name !== '@everyone')
      .map(r => ({ id: r.id, name: r.name, color: r.color ? '#' + r.color.toString(16).padStart(6,'0') : null }));
    const isAdmin = (memberRes.data.roles || []).some(rid => {
      const role = guildRoles.find(r => r.id === rid);
      return role && (role.permissions & 0x8) === 0x8;
    });
    res.json({ roles, isAdmin });
  } catch(e) { res.status(500).json({ roles: [], isAdmin: false }); }
});

// ── API: Staff (رتبة محددة) ──────────────────────────────────
app.get('/api/staff', async (req, res) => {
  try {
    const [membersRes, rolesRes] = await Promise.all([
      axios.get(`${DISCORD_API}/guilds/${GUILD_ID}/members?limit=100`,
        { headers: { Authorization: `Bot ${CONFIG.BOT_TOKEN}` } }),
      axios.get(`${DISCORD_API}/guilds/${GUILD_ID}/roles`,
        { headers: { Authorization: `Bot ${CONFIG.BOT_TOKEN}` } })
    ]);
    const staffRole = rolesRes.data.find(r => r.id === STAFF_ROLE_ID);
    const roleName  = staffRole ? staffRole.name : 'الفريق';
    const staff = membersRes.data
      .filter(m => m.roles.includes(STAFF_ROLE_ID) && !m.user.bot)
      .map(m => ({
        id:     m.user.id,
        name:   m.nick || m.user.global_name || m.user.username,
        role:   roleName,
        avatar: m.user.avatar
          ? `https://cdn.discordapp.com/avatars/${m.user.id}/${m.user.avatar}.png?size=64`
          : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(m.user.id) % 5n)}.png`
      }));
    res.json(staff);
  } catch(e) {
    console.error('Staff error:', e.response?.data || e.message);
    res.status(500).json([]);
  }
});

// ── API: Ratings ─────────────────────────────────────────────
app.get('/api/ratings', (req, res) => {
  res.json(ratings.slice().reverse());
});

app.post('/api/ratings', requireAuth, (req, res) => {
  const { stars, text, username, avatar } = req.body;
  if (!stars || stars < 1 || stars > 5) return res.status(400).json({ error: 'invalid stars' });
  const existing = ratings.find(r => r.userId === req.session.user.id);
  if (existing) {
    existing.stars     = stars;
    existing.text      = text || '';
    existing.createdAt = new Date().toISOString();
    return res.json({ ok: true, updated: true });
  }
  ratings.push({
    id:        Date.now(),
    userId:    req.session.user.id,
    username:  username || req.session.user.username,
    avatar:    avatar || '',
    stars,
    text:      text || '',
    createdAt: new Date().toISOString()
  });
  res.json({ ok: true });
});

// ── API: Announcements ───────────────────────────────────────
app.get('/api/announcements', (req, res) => {
  res.json(announcements.slice().reverse());
});

// ── BOT: إرسال إعلان من البوت (/announcement) ───────────────
app.post('/bot/announcement', (req, res) => {
  const secret = req.headers['x-bot-secret'];
  if (secret !== CONFIG.BOT_SECRET) return res.status(401).json({ error: 'unauthorized' });
  const { title, content, icon } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'missing fields' });
  announcements.push({
    id:        Date.now(),
    title,
    content,
    icon:      icon || '📢',
    createdAt: new Date().toISOString()
  });
  if (announcements.length > 20) announcements.shift();
  console.log(`📢 New announcement: ${title}`);
  res.json({ ok: true });
});

// ── HEALTH ───────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ── HELPER ───────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/');
}

// ── START ────────────────────────────────────────────────────
app.listen(CONFIG.PORT, () => {
  console.log(`\n🚀 Server: http://localhost:${CONFIG.PORT}`);
  console.log(`🔗 Redirect URI: ${CONFIG.REDIRECT_URI}`);
  console.log(`🌍 Env: ${process.env.NODE_ENV || 'development'}\n`);
});
