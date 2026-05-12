# Content Strategy Tracker

A personal content strategy dashboard — calendar, buckets, channels, inspo board, YouTube analytics, and goal tracking.

## Setup

### 1. Install Node.js

If you don't have Node.js installed, download it from **https://nodejs.org** (choose the LTS version).

Verify it installed:
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

Then open **http://localhost:3000** in your browser.

During development, use `npm run dev` to auto-restart on file changes (requires Node 18+).

## Data

All your data is saved to `data/data.json` on the server. This file is excluded from git (via `.gitignore`) so your personal data stays local.

## GitHub

To push to GitHub:

1. Create a new repository at https://github.com/new (name it `content-strategy`, keep it private)
2. Then run:

```bash
git remote add origin https://github.com/YOUR_USERNAME/content-strategy.git
git branch -M main
git push -u origin main
```

## Features

- **Calendar** — 7-month view, add content items to any day
- **Board** — Buckets (content formats) + Channels side by side
- **Inspo Board** — Save links, paste images, filter by platform
- **Analytics** — YouTube CSV data with charts and 90-day navigation
- **Goals** — Track follower/subscriber goals with progress bars; YouTube goals auto-update from CSV data
- **CSV Import** — Upload YouTube Studio exports (Overview or Traffic Sources)
