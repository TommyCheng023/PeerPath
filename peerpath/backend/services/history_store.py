"""
history_store.py
Append-only, per-user history stored in data/history.json.
Thread-safe via a module-level lock (suitable for single-process uvicorn).
"""

import json
import os
import threading
from datetime import datetime, timezone

_LOCK = threading.Lock()
_HISTORY_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "history.json")
MAX_PER_USER = 20


def _load() -> dict:
    if not os.path.exists(_HISTORY_PATH):
        return {}
    with open(_HISTORY_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _save(data: dict) -> None:
    with open(_HISTORY_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def append_entry(
    user_id: str,
    tags: list,
    description: str,
    total_candidates: int,
    matches: list,
    source: str = "form",
) -> None:
    """Prepend a new search result to this user's history (max MAX_PER_USER entries)."""
    now = datetime.now(timezone.utc)
    entry = {
        "id": now.strftime("%Y%m%d%H%M%S%f"),
        "timestamp": now.isoformat(),
        "tags": tags,
        "description": description,
        "total_candidates": total_candidates,
        "matches": matches,
        "source": source,
    }
    with _LOCK:
        data = _load()
        entries = data.get(user_id, [])
        entries.insert(0, entry)
        data[user_id] = entries[:MAX_PER_USER]
        _save(data)


def get_history(user_id: str) -> list:
    """Return all history entries for a user (newest first)."""
    with _LOCK:
        data = _load()
        return data.get(user_id, [])
