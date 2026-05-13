const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');

const app        = express();
const PORT       = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'cos-dev-secret-change-in-production';
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

  const token = jwt.sign({ userId: id, email: email.toLowerCase() }, JWT_SECRET, { expiresIn: '30d' });
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

  const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, email: user.email });
});

app.get('/api/data', requireAuth, (req, res) => {
  res.json(readUserData(req.user.userId));
});

app.post('/api/data', requireAuth, (req, res) => {
  writeUserData(req.user.userId, req.body);
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`Content Strategy Tracker running at http://localhost:${PORT}`));
