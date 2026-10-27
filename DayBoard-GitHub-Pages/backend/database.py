"""SQLite connection helpers and the small, versioned schema migration system."""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Iterator
from uuid import uuid4

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "data"
DB_PATH = DATA_DIR / "dayboard.db"
SCHEMA_VERSION = 1


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA journal_mode = WAL")
    return connection


@contextmanager
def database() -> Iterator[sqlite3.Connection]:
    connection = connect()
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def initialize_database() -> None:
    """Apply every missing migration without replacing any existing user data."""
    with database() as db:
        db.execute(
            """CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL
            )"""
        )
        row = db.execute("SELECT MAX(version) AS version FROM schema_version").fetchone()
        version = row["version"] or 0
        if version < 1:
            _migration_1(db)
            db.execute(
                "INSERT INTO schema_version(version, applied_at) VALUES (?, ?)",
                (1, datetime.now().astimezone().isoformat(timespec="seconds")),
            )
        _ensure_first_board(db)


def _migration_1(db: sqlite3.Connection) -> None:
    db.executescript(
        """
        CREATE TABLE boards (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            emoji TEXT NOT NULL DEFAULT '✳️',
            color TEXT NOT NULL DEFAULT '#7165ef',
            position INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT
        );

        CREATE TABLE lists (
            id TEXT PRIMARY KEY,
            board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            position INTEGER NOT NULL DEFAULT 0,
            wip_limit INTEGER,
            archived INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );

        CREATE TABLE cards (
            id TEXT PRIMARY KEY,
            list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            position INTEGER NOT NULL DEFAULT 0,
            due_date TEXT,
            is_done INTEGER NOT NULL DEFAULT 0,
            completed_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT
        );

        CREATE INDEX idx_boards_live_position ON boards(deleted_at, position);
        CREATE INDEX idx_lists_board_position ON lists(board_id, archived, position);
        CREATE INDEX idx_cards_list_position ON cards(list_id, deleted_at, position);
        CREATE INDEX idx_cards_due_date ON cards(due_date, deleted_at, is_done);
        """
    )


def _ensure_first_board(db: sqlite3.Connection) -> None:
    """Give a new installation a ready-to-use board, without adding demo cards."""
    exists = db.execute("SELECT 1 FROM boards WHERE deleted_at IS NULL LIMIT 1").fetchone()
    if exists:
        return
    now = datetime.now().astimezone().isoformat(timespec="seconds")
    board_id = str(uuid4())
    db.execute(
        """INSERT INTO boards(id, title, emoji, color, position, created_at, updated_at)
           VALUES (?, ?, ?, ?, 0, ?, ?)""",
        (board_id, "Mi espacio", "🌿", "#7165ef", now, now),
    )
    for position, title in enumerate(("Por hacer", "En curso", "Hecho")):
        db.execute(
            """INSERT INTO lists(id, board_id, title, position, created_at)
               VALUES (?, ?, ?, ?, ?)""",
            (str(uuid4()), board_id, title, position, now),
        )


def new_id() -> str:
    return str(uuid4())


def local_now() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")
