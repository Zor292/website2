const express = require('express');
const session = require('express-session');
const axios   = require('axios');
const path    = require('path');

const app = express();
const GUILD_ID = '1421088112808951852';

// CONFIG
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
  PORT,
};

const SCOPES     = 'identify email guilds';
const OAUTH_URL  = `https://discord.com/oauth2/authorize?client_id=${CONFIG.CLIENT_ID}&redirect_uri=${encodeURIComponent(CONFIG.REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(SCOPES)}`;
const DISCORD_API = 'https://discord.com/api/v10';

// MIDDLEWARE
app.use(express.json());
app.use(session({
  secret: CONFIG.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true, maxAge: 86400000 }
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
app.get('/auth/discord', (req, res) => res.redirect(OAUTH_URL));

app.get('/auth/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) return res.redirect('/?error=access_denied');
  try {
    const tokenRes = await axios.post(`${DISCORD_API}/oauth2/token`,
      new URLSearchParams({ client_id: CONFIG.CLIENT_ID, client_secret: CONFIG.CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: CONFIG.REDIRECT_URI }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const { access_token, refresh_token } = tokenRes.data;
    const userRes = await axios.get(`${DISCORD_API}/users/@me`, { headers: { Authorization: `Bearer ${access_token}` } });
    req.session.user   = userRes.data;
    req.session.tokens = { access_token, refresh_token };
    console.log(`✅ Login: ${userRes.data.username}`);
    res.redirect('/dashboard');
  } catch(e) {
    console.error('Auth error:', e.response?.data || e.message);
    res.redirect('/?error=auth_failed');
  }
});

app.get('/auth/user', requireAuth, (req, res) => res.json(req.session.user));
app.get('/auth/logout', (req, res) => req.session.destroy(() => res.redirect('/')));

// ── API: Guild Info ──────────────────────────────────────────
app.get('/api/guild', async (req, res) => {
  try {
    const r = await axios.get(
      `${DISCORD_API}/guilds/${GUILD_ID}?with_counts=true`,
      { headers: { Authorization: `Bot ${CONFIG.BOT_TOKEN}` } }
    );
    res.json({
      approximate_member_count: r.data.approximate_member_count,
      approximate_presence_count: r.data.approximate_presence_count,
    });
  } catch(e) { res.status(500).json({}); }
});

// ── API: Member Roles ────────────────────────────────────────
app.get('/api/member/:userId', requireAuth, async (req, res) => {
  try {
    const [memberRes, rolesRes] = await Promise.all([
      axios.get(`${DISCORD_API}/guilds/${GUILD_ID}/members/${req.params.userId}`, { headers: { Authorization: `Bot ${CONFIG.BOT_TOKEN}` } }),
      axios.get(`${DISCORD_API}/guilds/${GUILD_ID}/roles`, { headers: { Authorization: `Bot ${CONFIG.BOT_TOKEN}` } })
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

// ── API: Staff ───────────────────────────────────────────────
app.get('/api/staff', async (req, res) => {
  try {
    const rolesRes = await axios.get(`${DISCORD_API}/guilds/${GUILD_ID}/roles`, { headers: { Authorization: `Bot ${CONFIG.BOT_TOKEN}` } });
    const adminRoles = rolesRes.data
      .filter(r => r.name !== '@everyone' && ((r.permissions & 0x8) === 0x8 || (r.permissions & 0x20) === 0x20))
      .sort((a,b) => b.position - a.position).slice(0,3);
    if (!adminRoles.length) return res.json([]);
    const membersRes = await axios.get(`${DISCORD_API}/guilds/${GUILD_ID}/members?limit=100`, { headers: { Authorization: `Bot ${CONFIG.BOT_TOKEN}` } });
    const allMembers = membersRes.data;
    const staffMembers = [];
    for (const role of adminRoles) {
      for (const m of allMembers.filter(m => m.roles.includes(role.id)).slice(0,4)) {
        if (!staffMembers.find(s => s.id === m.user.id)) {
          staffMembers.push({
            id: m.user.id,
            name: m.nick || m.user.global_name || m.user.username,
            role: role.name,
            avatar: m.user.avatar
              ? `https://cdn.discordapp.com/avatars/${m.user.id}/${m.user.avatar}.png?size=64`
              : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(m.user.id) % 5n)}.png`
          });
        }
      }
    }
    res.json(staffMembers);
  } catch(e) { res.status(500).json([]); }
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
  console.log(`🌍 Env: ${process.env.NODE_ENV || 'development'}\n`);
});
