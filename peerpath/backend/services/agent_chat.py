"""
In-memory multi-turn agent chat service.

Sessions stored in module-level dict keyed by session UUID.
Expire after IDLE_MINUTES of inactivity.
"""

import json
import os
import uuid
from datetime import datetime, timedelta

from openai import OpenAI

_PROMPT_PATH = os.path.join(os.path.dirname(__file__), "..", "prompts", "agent_chat.txt")
_IDLE_MINUTES = 30

_sessions: dict[str, dict] = {}


def _get_system_prompt() -> str:
    with open(_PROMPT_PATH, "r", encoding="utf-8") as f:
        return f.read()


def _prune_idle_sessions() -> None:
    cutoff = datetime.utcnow() - timedelta(minutes=_IDLE_MINUTES)
    expired = [sid for sid, s in _sessions.items() if s["last_active"] < cutoff]
    for sid in expired:
        del _sessions[sid]


def _call_llm(messages: list[dict]) -> str:
    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    response = client.chat.completions.create(
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        max_completion_tokens=512,
        messages=messages,
        response_format={"type": "json_object"},
    )
    return response.choices[0].message.content.strip()


def start_session() -> dict:
    """Create a new session and return the agent opening message."""
    _prune_idle_sessions()
    session_id = str(uuid.uuid4())
    system_prompt = _get_system_prompt()
    opening = {"reply": "嗨，遇到什么困惑了吗？说说看", "done": False}
    _sessions[session_id] = {
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "assistant", "content": json.dumps(opening, ensure_ascii=False)},
        ],
        "last_active": datetime.utcnow(),
    }
    return {"session_id": session_id, **opening}


def send_message(session_id: str, user_text: str) -> dict:
    """Append user message, call LLM, parse and return response."""
    _prune_idle_sessions()
    if session_id not in _sessions:
        raise ValueError(f"Session {session_id!r} not found or expired.")
    session = _sessions[session_id]
    session["messages"].append({"role": "user", "content": user_text})
    session["last_active"] = datetime.utcnow()
    raw = _call_llm(session["messages"])
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        parsed = {"reply": raw, "done": False}
    session["messages"].append({"role": "assistant", "content": json.dumps(parsed, ensure_ascii=False)})
    return {
        "session_id": session_id,
        "reply": parsed.get("reply", ""),
        "done": bool(parsed.get("done", False)),
        "tags": parsed.get("tags") if parsed.get("done") else None,
        "description": parsed.get("description") if parsed.get("done") else None,
    }
