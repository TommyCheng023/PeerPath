import os
import sqlite3
from contextlib import contextmanager

from dotenv import load_dotenv
import psycopg
from psycopg.rows import dict_row

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

_SQLITE_PATH = os.path.join(os.path.dirname(__file__), "..", "peerpath_local.db")


@contextmanager
def get_sqlite_connection():
    conn = sqlite3.connect(_SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def init_auth_tables_sqlite() -> None:
    with get_sqlite_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                full_name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS user_profiles (
                user_id TEXT PRIMARY KEY,
                name TEXT NOT NULL DEFAULT '',
                major TEXT NOT NULL DEFAULT '',
                year TEXT NOT NULL DEFAULT '',
                tags TEXT NOT NULL DEFAULT '[]',
                help_topics TEXT NOT NULL DEFAULT '[]',
                comfort_level TEXT NOT NULL DEFAULT '',
                contact_phone TEXT NOT NULL DEFAULT '',
                contact_email TEXT NOT NULL DEFAULT '',
                past_challenges TEXT NOT NULL DEFAULT '[]',
                searchable INTEGER NOT NULL DEFAULT 0,
                profile TEXT NOT NULL DEFAULT '{}',
                profile_complete INTEGER NOT NULL DEFAULT 0
            )
        """)
        conn.commit()


def get_database_url() -> str | None:
    return os.getenv("DATABASE_URL")


def is_database_configured() -> bool:
    return bool(get_database_url())


@contextmanager
def get_connection():
    database_url = get_database_url()
    if not database_url:
        raise ValueError("Missing DATABASE_URL in backend/.env")

    conn = psycopg.connect(database_url, row_factory=dict_row)
    try:
        yield conn
    finally:
        conn.close()


def init_peer_tables() -> None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
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
                """
            )
            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_peers_tags_gin
                ON peers
                USING GIN (tags);
                """
            )
        conn.commit()


def init_auth_tables() -> None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    email TEXT NOT NULL UNIQUE,
                    full_name TEXT NOT NULL,
                    password_hash TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
            cur.execute(
                """
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
                """
            )
            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_user_profiles_tags_gin
                ON user_profiles
                USING GIN (tags);
                """
            )
        conn.commit()


def init_database() -> None:
    init_peer_tables()
    init_auth_tables()
