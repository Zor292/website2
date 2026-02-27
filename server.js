// ============================================================
//  Discord OAuth2 - Server
//  جاهز للنشر على Railway
// ============================================================

const express = require('express');
const session = require('express-session');
const axios   = require('axios');
const path    = require('path');

const app = express();

// ─── CONFIG (يقرأ من Environment Variables على Railway) ─────
const CONFIG = {
  CLIENT_ID:      process.env.CLIENT_ID     || '1476983875598024824',
  CLIENT_SECRET:  process.env.CLIENT_SECRET || '',   // لا تضعها هنا - ضعها في Railway
  REDIRECT_URI:   process.env.REDIRECT_URI  || 'http://localhost:3000/auth/callback',
  SESSION_SECRET: process.env.SESSION_SECRET|| 'change-this-secret',
  PORT:           process.env.PORT          || 3000,
};

const SCOPES    = 'identify email guilds';
const OAUTH_URL = `https://discord.com/oauth2/authorize?client_id=${CONFIG.CLIENT_ID}&redirect_uri=${encodeURIComponent(CONFIG.REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(SCOPES)}`;
const DISCORD_API = 'https://discord.com/api/v10';

// ─── MIDDLEWARE ──────────────────────────────────────────────
app.use(express.json());

app.use(session({
  secret: CONFIG.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 // 24 ساعة
  }
}));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// ─── ROUTES ──────────────────────────────────────────────────

// الصفحة الرئيسية
app.get('/', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// لوحة التحكم
app.get('/dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// توجيه لـ Discord
app.get('/auth/discord', (req, res) => {
  res.redirect(OAUTH_URL);
});

// Callback بعد الموافقة من Discord
app.get('/auth/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error || !code) {
    return res.redirect('/?error=access_denied');
  }

  try {
    // 1. استبدال الكود بـ Access Token
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

    // 2. جلب معلومات المستخدم
    const userRes = await axios.get(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    // 3. حفظ في الـ Session
    req.session.user   = userRes.data;
    req.session.tokens = { access_token, refresh_token };

    console.log(`✅ Login: ${userRes.data.username} (${userRes.data.id})`);
    res.redirect('/dashboard');

  } catch (err) {
    console.error('❌ Auth Error:', err.response?.data || err.message);
    res.redirect('/?error=auth_failed');
  }
});

// API - معلومات المستخدم الحالي
app.get('/auth/user', requireAuth, (req, res) => {
  res.json(req.session.user);
});

// تسجيل الخروج
app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// Health check لـ Railway
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ─── HELPER ──────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/');
}

// ─── START ────────────────────────────────────────────────────
app.listen(CONFIG.PORT, () => {
  console.log(`\n🚀 Server: http://localhost:${CONFIG.PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}\n`);
});
