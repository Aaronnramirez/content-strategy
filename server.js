const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');

const app        = express();
const PORT       = process.env.PORT || 3000;
const JWT_SECRET  = process.env.JWT_SECRET  || 'cos-dev-secret-change-in-production';
const ADMIN_KEY   = process.env.ADMIN_KEY   || 'cos-admin';
const DATA_DIR   = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function readUsers()             { try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch { return []; } }
function writeUsers(users)       { fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2)); }
function userFile(id)            { return path.join(DATA_DIR, `user_${id}.json`); }
function readUserData(id)        { try { return JSON.parse(fs.readFileSync(userFile(id), 'utf8')); } catch { return { events:[], buckets:[], channels:[], csv:null, inspo:[], goals:[], goalsOpen:true }; } }
function writeUserData(id, data) { fs.writeFileSync(userFile(id), JSON.stringify(data, null, 2)); }

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid or expired token' }); }
}

app.post('/api/auth/signup', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (password.length < 8)  return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const users = readUsers();
  if (users.find(u => u.email.toLowerCase() === email.toLowerCase()))
    return res.status(409).json({ error: 'An account with that email already exists' });

  const id   = users.length ? Math.max(...users.map(u => u.id)) + 1 : 1;
  const hash = await bcrypt.hash(password, 10);
  users.push({ id, email: email.toLowerCase(), passwordHash: hash, createdAt: Date.now() });
  writeUsers(users);
  writeUserData(id, { events:[], buckets:[], channels:[], csv:null, inspo:[], goals:[], goalsOpen:true });

  const token = jwt.sign({ userId: id, email: email.toLowerCase() }, JWT_SECRET, { expiresIn: '365d' });
  res.json({ token, email: email.toLowerCase() });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const users = readUsers();
  const user  = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

  const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '365d' });
  res.json({ token, email: user.email });
});

app.get('/api/auth/refresh', requireAuth, (req, res) => {
  const token = jwt.sign({ userId: req.user.userId, email: req.user.email }, JWT_SECRET, { expiresIn: '365d' });
  res.json({ token });
});

app.get('/api/data', requireAuth, (req, res) => {
  res.json(readUserData(req.user.userId));
});

app.post('/api/data', requireAuth, (req, res) => {
  writeUserData(req.user.userId, req.body);
  res.json({ ok: true });
});

// ── Social stats (follower count fetcher) ──
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
    const html  = await r.text();
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

  // YouTube — extracts from ytInitialData embedded JSON
  if (u.includes('youtube.com') || u.includes('youtu.be')) {
    const m = html.match(/"subscriberCountText"\s*:\s*\{\s*"simpleText"\s*:\s*"([^"]+)"/);
    if (m) {
      const raw   = m[1].replace(/\s*(subscribers?|followers?)\s*/i, '').trim(); // "2.13M"
      const count = parseShortNum(raw);
      return { count, formatted: raw, platform: 'YouTube' };
    }
    return null;
  }

  // Instagram
  if (u.includes('instagram.com')) {
    let m = html.match(/"edge_followed_by"\s*:\s*\{\s*"count"\s*:\s*(\d+)/);
    if (!m) m = html.match(/"followers_count"\s*:\s*(\d+)/);
    if (m) { const count = parseInt(m[1]); return { count, formatted: String(count), platform: 'Instagram' }; }
    return null;
  }

  // TikTok
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

// ── Admin panel ──────────────────────────────────────────────────────────────

function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.key;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'Invalid admin key' });
  next();
}

// Serve admin HTML
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// List all users
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const users = readUsers().map(u => ({ id: u.id, email: u.email, createdAt: u.createdAt }));
  res.json(users);
});

// Get any user's data
app.get('/api/admin/users/:id/data', requireAdmin, (req, res) => {
  res.json(readUserData(parseInt(req.params.id)));
});

// Overwrite any user's data
app.post('/api/admin/users/:id/data', requireAdmin, (req, res) => {
  writeUserData(parseInt(req.params.id), req.body);
  res.json({ ok: true });
});

// Issue a token for any user (log in as them)
app.post('/api/admin/impersonate', requireAdmin, (req, res) => {
  const { userId } = req.body || {};
  const users = readUsers();
  const user = users.find(u => u.id === parseInt(userId));
  if (!user) return res.status(404).json({ error: 'User not found' });
  const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '365d' });
  res.json({ token, email: user.email });
});

// Delete a user account + data
app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  let users = readUsers();
  users = users.filter(u => u.id !== id);
  writeUsers(users);
  try { fs.unlinkSync(userFile(id)); } catch {}
  res.json({ ok: true });
});

// Reset a user's password
app.post('/api/admin/users/:id/reset-password', requireAdmin, async (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 chars' });
  const users = readUsers();
  const user = users.find(u => u.id === parseInt(req.params.id));
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.passwordHash = await bcrypt.hash(password, 10);
  writeUsers(users);
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`Content Strategy Tracker running at http://localhost:${PORT}`));
