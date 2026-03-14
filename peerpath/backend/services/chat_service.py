import json
import os
import threading
import uuid
from datetime import datetime, timezone

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "conversations")
_lock = threading.Lock()


def _user_file(user_id: str) -> str:
    os.makedirs(DATA_DIR, exist_ok=True)
    return os.path.join(DATA_DIR, f"user_{user_id}.json")


def _load(user_id: str) -> list:
    path = _user_file(user_id)
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _save(user_id: str, threads: list) -> None:
    path = _user_file(user_id)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(threads, f, indent=2, ensure_ascii=False)


def get_threads(user_id: str) -> list:
    with _lock:
        threads = _load(user_id)
    threads.sort(key=lambda t: t.get("last_message_at", t["created_at"]), reverse=True)
    return threads


def get_or_create_thread(
    user_id: str,
    peer_id: str,
    peer_name: str,
    peer_major: str,
    peer_year: str,
    match_score: float = 0.0,
    match_reason: str = "",
) -> dict:
    with _lock:
        threads = _load(user_id)
        for thread in threads:
            if thread["peer_id"] == peer_id:
                return thread

        now = datetime.now(timezone.utc).isoformat()
        thread = {
            "thread_id": str(uuid.uuid4()),
            "peer_id": peer_id,
            "peer_name": peer_name,
            "peer_major": peer_major,
            "peer_year": peer_year,
            "created_from_match": True,
            "match_score": match_score,
            "match_reason": match_reason,
            "created_at": now,
            "last_message_at": now,
            "unread_count": 0,
            "messages": [],
        }
        threads.append(thread)
        _save(user_id, threads)
    return thread


def get_thread(user_id: str, thread_id: str) -> dict | None:
    with _lock:
        threads = _load(user_id)
    for thread in threads:
        if thread["thread_id"] == thread_id:
            return thread
    return None


def add_message(
    user_id: str,
    thread_id: str,
    sender_id: str,
    content: str,
    is_opener: bool = False,
) -> dict | None:
    with _lock:
        threads = _load(user_id)
        for thread in threads:
            if thread["thread_id"] == thread_id:
                now = datetime.now(timezone.utc).isoformat()
                message = {
                    "message_id": str(uuid.uuid4()),
                    "sender_id": sender_id,
                    "content": content.strip(),
                    "timestamp": now,
                    "is_opener": is_opener,
                }
                thread["messages"].append(message)
                thread["last_message_at"] = now
                if sender_id != user_id:
                    thread["unread_count"] = thread.get("unread_count", 0) + 1
                _save(user_id, threads)
                return message
    return None


def mark_read(user_id: str, thread_id: str) -> bool:
    with _lock:
        threads = _load(user_id)
        for thread in threads:
            if thread["thread_id"] == thread_id:
                thread["unread_count"] = 0
                _save(user_id, threads)
                return True
    return False


def get_unread_count(user_id: str) -> int:
    with _lock:
        threads = _load(user_id)
    return sum(t.get("unread_count", 0) for t in threads)
