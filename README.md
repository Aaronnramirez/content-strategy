# Content Strategy Tracker

A personal content strategy dashboard with user accounts — sign up once, access your data from any device.

## Setup

### 1. Install Node.js

Download from **https://nodejs.org** (choose the LTS version) then verify:
```bash
node -v
npm -v
```

### 2. Install dependencies

```bash
cd content-strategy
npm install
```

### 3. Run the app

```bash
npm start
```

Open **http://localhost:3000** in your browser. You'll be prompted to create an account on first visit.

For development with auto-restart on file changes:
```bash
npm run dev
```

## Environment Variables

For production, set a strong JWT secret:
```bash
JWT_SECRET=your-long-random-secret-here node server.js
```

Or create a `.env` file (never committed to git):
```
JWT_SECRET=your-long-random-secret-here
PORT=3000
```

## Data

- User accounts and per-user data are stored in the `data/` directory (excluded from git)
- Each user's data is isolated — no one else can see your content
- JWTs expire after 30 days, after which you'll be prompted to sign in again

## GitHub

To push to GitHub:

1. Create a new repository at https://github.com/new
2. Then run:

```bash
git remote add origin https://github.com/YOUR_USERNAME/content-strategy.git
git branch -M main
git push -u origin main
```

## Features

- **Accounts** — Sign up and log in from any device, data synced server-side
- **Calendar** — 7-month view, add content items to any day
- **Board** — Buckets (content formats) + Channels side by side
- **Inspo Board** — Save links, paste images, filter by platform
- **Analytics** — YouTube CSV data with charts and 90-day navigation
- **Goals** — Track follower/subscriber goals; YouTube goals auto-update from CSV
- **CSV Import** — Top 20 video breakdown with interactive detail panel
