CREATE TABLE IF NOT EXISTS peers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    major TEXT NOT NULL,
    year TEXT NOT NULL,
    tags TEXT[] NOT NULL,
    help_topics TEXT[] NOT NULL,
    comfort_level TEXT NOT NULL,
    past_challenges JSONB NOT NULL,
    profile JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_peers_tags_gin
ON peers
USING GIN (tags);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_profiles (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    major TEXT NOT NULL,
    year TEXT NOT NULL,
    tags TEXT[] NOT NULL,
    help_topics TEXT[] NOT NULL,
    comfort_level TEXT NOT NULL,
    contact_phone TEXT NOT NULL,
    contact_email TEXT NOT NULL,
    past_challenges JSONB NOT NULL,
    searchable BOOLEAN NOT NULL DEFAULT FALSE,
    profile JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_tags_gin
ON user_profiles
USING GIN (tags);
