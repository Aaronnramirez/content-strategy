-- Content OS — Supabase schema
-- Run this once in the Supabase SQL Editor (supabase.com → your project → SQL Editor)

-- Users table (replaces local users.json)
CREATE TABLE IF NOT EXISTS users (
  id        BIGSERIAL PRIMARY KEY,
  email     TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users (lower(email));

-- User data table (replaces local user_*.json)
CREATE TABLE IF NOT EXISTS user_data (
  user_id    BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data       JSONB NOT NULL DEFAULT '{"events":[],"buckets":[],"channels":[],"csv":null,"inspo":[],"goals":[],"goalsOpen":true}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Disable Row Level Security (server uses service role key — full access)
ALTER TABLE users    DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_data DISABLE ROW LEVEL SECURITY;
