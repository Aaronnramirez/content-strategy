require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express        = require('express');
const path           = require('path');
const bcrypt         = require('bcryptjs');
const jwt            = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const app             = express();
const PORT            = process.env.PORT            || 3000;
const JWT_SECRET      = process.env.JWT_SECRET      || 'cos-dev-secret-change-in-production';
const ADMIN_KEY       = process.env.ADMIN_KEY       || 'cos-admin';
const SUPABASE_URL    = process.env.SUPABASE_URL;
const SUPABASE_KEY    = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// Verify tables exist on startup
async function checkDatabase() {
  const { error } = await supabase.from('users').select('id').limit(1);
  if (error && (error.code === '42P01' || error.message?.includes('does not exist'))) {
    console.error('\n⚠️  Database tables not found!');
    console.error('Run supabase-schema.sql in your Supabase SQL Editor first.\n');
    process.exit(1);
  }
  console.log('✓ Supabase connected');
}

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Auth middleware ───────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid or expired token' }); }
}

// ── Signup ────────────────────────────────────────────────────────────────────
app.post('/api/auth/signup', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (password.length < 8)  return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const { data: existing } = await supabase
    .from('users').select('id').ilike('email', email).maybeSingle();
  if (existing) return res.status(409).json({ error: 'An account with that email already exists' });

  const hash = await bcrypt.hash(password, 10);
  const { data: user, error } = await supabase
    .from('users')
    .insert({ email: email.toLowerCase(), password_hash: hash, created_at: Date.now() })
    .select().single();

  if (error) { console.error(error); return res.status(500).json({ error: 'Failed to create account' }); }

  await supabase.from('user_data').insert({
    user_id: user.id,
    data: { events:[], buckets:[], channels:[], csv:null, inspo:[], goals:[], goalsOpen:false, braindumps:[] },
  });

  const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '365d' });
  res.json({ token, email: user.email });
});

// ── Login ─────────────────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const { data: user } = await supabase
    .from('users').select('*').ilike('email', email).maybeSingle();
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

  const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '365d' });
  res.json({ token, email: user.email });
});

// ── Token refresh ─────────────────────────────────────────────────────────────
app.get('/api/auth/refresh', requireAuth, (req, res) => {
  const token = jwt.sign({ userId: req.user.userId, email: req.user.email }, JWT_SECRET, { expiresIn: '365d' });
  res.json({ token });
});

// ── User data ─────────────────────────────────────────────────────────────────
app.get('/api/data', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('user_data').select('data').eq('user_id', req.user.userId).maybeSingle();
  if (error) console.error(error);
  res.json(data?.data || { events:[], buckets:[], channels:[], csv:null, inspo:[], goals:[], goalsOpen:true });
});

app.post('/api/data', requireAuth, async (req, res) => {
  const { error } = await supabase.from('user_data').upsert({
    user_id: req.user.userId,
    data: req.body,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (error) { console.error(error); return res.status(500).json({ error: 'Failed to save' }); }
  res.json({ ok: true });
});

// ── OG link preview ───────────────────────────────────────────────────────────
app.get('/api/og-preview', requireAuth, async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL required' });
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return res.status(502).json({ error: `Page returned ${r.status}` });
    const html = await r.text();

    const meta = (prop, attr = 'content') => {
      const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+${attr}=["']([^"']+)["']`, 'i'))
             || html.match(new RegExp(`<meta[^>]+${attr}=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'));
      return m ? m[1].trim() : '';
    };
    const tag = (t, attr = '') => {
      const m = html.match(new RegExp(`<${t}[^>]*>([^<]+)</${t}>`, 'i'));
      return m ? m[1].trim() : '';
    };

    const title       = meta('og:title')       || meta('twitter:title')       || tag('title') || '';
    const description = meta('og:description') || meta('twitter:description') || meta('description') || '';
    const image       = meta('og:image')        || meta('twitter:image')       || '';
    const siteName    = meta('og:site_name')    || '';

    // Resolve relative image URLs
    let resolvedImage = image;
    if (image && image.startsWith('/')) {
      try { const u = new URL(url); resolvedImage = u.origin + image; } catch {}
    }

    res.json({ title, description, image: resolvedImage, siteName });
  } catch (e) {
    if (e.name === 'TimeoutError') return res.status(504).json({ error: 'Request timed out' });
    res.status(500).json({ error: 'Failed to fetch preview' });
  }
});

// ── Social stats ──────────────────────────────────────────────────────────────
app.get('/api/social-stats', requireAuth, async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL required' });
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return res.status(502).json({ error: `Page returned ${r.status}` });
    const html = await r.text();
    const result = extractFollowerCount(url, html);
    if (result) return res.json(result);
    res.status(422).json({ error: "Couldn't read follower count from this page. Try updating manually." });
  } catch (e) {
    if (e.name === 'TimeoutError') return res.status(504).json({ error: 'Request timed out' });
    res.status(500).json({ error: 'Failed to fetch the page' });
  }
});

function extractFollowerCount(url, html) {
  const u = url.toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be')) {
    const m = html.match(/"subscriberCountText"\s*:\s*\{\s*"simpleText"\s*:\s*"([^"]+)"/);
    if (m) { const raw = m[1].replace(/\s*(subscribers?|followers?)\s*/i,'').trim(); return { count: parseShortNum(raw), formatted: raw, platform: 'YouTube' }; }
    return null;
  }
  if (u.includes('instagram.com')) {
    let m = html.match(/"edge_followed_by"\s*:\s*\{\s*"count"\s*:\s*(\d+)/);
    if (!m) m = html.match(/"followers_count"\s*:\s*(\d+)/);
    if (m) { const count = parseInt(m[1]); return { count, formatted: String(count), platform: 'Instagram' }; }
    return null;
  }
  if (u.includes('tiktok.com')) {
    const m = html.match(/"followerCount"\s*:\s*(\d+)/);
    if (m) { const count = parseInt(m[1]); return { count, formatted: String(count), platform: 'TikTok' }; }
    return null;
  }
  return null;
}

function parseShortNum(s) {
  const lower = s.toLowerCase().trim();
  const n = parseFloat(lower.replace(/[^0-9.]/g, ''));
  if (lower.includes('b')) return Math.round(n * 1e9);
  if (lower.includes('m')) return Math.round(n * 1e6);
  if (lower.includes('k')) return Math.round(n * 1e3);
  return Math.round(n) || 0;
}

// ── Admin panel ───────────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.key;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'Invalid admin key' });
  next();
}

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.get('/api/admin/users', requireAdmin, async (req, res) => {
  const { data } = await supabase.from('users').select('id, email, created_at').order('id');
  res.json(data || []);
});

app.get('/api/admin/users/:id/data', requireAdmin, async (req, res) => {
  const { data } = await supabase.from('user_data').select('data').eq('user_id', req.params.id).maybeSingle();
  res.json(data?.data || {});
});

app.post('/api/admin/users/:id/data', requireAdmin, async (req, res) => {
  await supabase.from('user_data').upsert({ user_id: parseInt(req.params.id), data: req.body, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  res.json({ ok: true });
});

app.post('/api/admin/impersonate', requireAdmin, async (req, res) => {
  const { userId } = req.body || {};
  const { data: user } = await supabase.from('users').select('id, email').eq('id', userId).maybeSingle();
  if (!user) return res.status(404).json({ error: 'User not found' });
  const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '365d' });
  res.json({ token, email: user.email });
});

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  await supabase.from('users').delete().eq('id', req.params.id);
  res.json({ ok: true });
});

app.post('/api/admin/users/:id/reset-password', requireAdmin, async (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 chars' });
  const hash = await bcrypt.hash(password, 10);
  const { error } = await supabase.from('users').update({ password_hash: hash }).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: 'Failed to reset password' });
  res.json({ ok: true });
});

// ── Start ─────────────────────────────────────────────────────────────────────
checkDatabase().then(() => {
  app.listen(PORT, () => console.log(`Content Strategy Tracker running at http://localhost:${PORT}`));
});
