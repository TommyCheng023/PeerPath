# PeerPath UI Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the post-login experience with a smart home dashboard, a 3-step onboarding flow for new users, and an AI-driven chat FAB that runs peer matching through conversation instead of a form.

**Architecture:** Backend gains a `profile_complete` flag on `user_profiles` and a new stateless `/api/agent/chat` endpoint that manages multi-turn conversation in-memory keyed by session UUID; when the agent decides it has enough context it calls the existing `rank_peers` pipeline. Frontend splits App.tsx's monolithic state machine into an `AppView` discriminated union (`"landing" | "onboarding" | "dashboard" | "form"`) and three new focused components: `OnboardingFlow`, `MainDashboard`, and `AgentChatOverlay`.

**Tech Stack:** FastAPI + PostgreSQL (psycopg) + OpenAI gpt-4o-mini — Python backend; React 19 + TypeScript + Tailwind CSS — Vite frontend; no new dependencies required.

---

## File Map

### Backend — modified
- `backend/schema.sql` — add `profile_complete`, `onboarding_completed_at` columns
- `backend/services/db.py` — add `ALTER TABLE … ADD COLUMN IF NOT EXISTS` migration
- `backend/services/profile.py` — include `profile_complete` in `get_profile` / `upsert_profile`; add `complete_onboarding()`
- `backend/routers/profile.py` — add `OnboardingRequest` Pydantic model + `PUT /profile/onboarding` endpoint
- `backend/main.py` — register agent router

### Backend — created
- `backend/prompts/agent_chat.txt` — system prompt for the AI agent
- `backend/services/agent_chat.py` — in-memory session store + LLM multi-turn loop + extraction
- `backend/routers/agent.py` — `POST /api/agent/chat` endpoint

### Frontend — modified
- `frontend/src/types.ts` — add `profile_complete` to `UserProfile`; add `AgentMessage` / `AgentChatResponse`
- `frontend/src/api/profileApi.ts` — add `updateOnboarding()` call
- `frontend/src/App.tsx` — add `AppView` type; post-login routing; wire `OnboardingFlow`, `MainDashboard`, `AgentChatOverlay`

### Frontend — created
- `frontend/src/api/agentApi.ts` — `sendAgentMessage()` function
- `frontend/src/components/OnboardingFlow.tsx` — 3-step wizard
- `frontend/src/components/MainDashboard.tsx` — thread list + empty-state CTA
- `frontend/src/components/AgentChatOverlay.tsx` — FAB button + sliding chat panel + inline match cards

---

## Task 1: Add profile_complete columns to schema.sql

**Files:**
- Modify: `backend/schema.sql`

- [ ] **Step 1: Add two columns to the `user_profiles` table definition**

Open `backend/schema.sql`. After the `updated_at` line (currently the last column), add:

```sql
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
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    profile_complete BOOLEAN NOT NULL DEFAULT FALSE,
    onboarding_completed_at TIMESTAMPTZ
);
```

- [ ] **Step 2: Verify the file looks right**

```bash
grep -n "profile_complete\|onboarding_completed" backend/schema.sql
```

Expected output:
```
43:    profile_complete BOOLEAN NOT NULL DEFAULT FALSE,
44:    onboarding_completed_at TIMESTAMPTZ
```

- [ ] **Step 3: Commit**

```bash
git add backend/schema.sql
git commit -m "feat: add profile_complete and onboarding_completed_at columns to schema"
```

---

## Task 2: Add DB migration for existing databases

**Files:**
- Modify: `backend/services/db.py`

- [ ] **Step 1: Read the current db.py**

Read `backend/services/db.py` in full so you know where `init_database()` lives.

- [ ] **Step 2: Add ALTER TABLE statements inside `init_database()`**

Locate the `init_database()` function. After the `cur.execute(schema_sql)` call (which creates tables via `IF NOT EXISTS`), add migration statements that safely add the new columns to any pre-existing database:

```python
# Migrate existing databases — safe to run even if columns already exist
cur.execute("""
    ALTER TABLE user_profiles
        ADD COLUMN IF NOT EXISTS profile_complete BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;
""")
```

- [ ] **Step 3: Restart backend and confirm no errors**

```bash
cd backend && uvicorn main:app --reload
```

Expected: server starts, no SQL errors in logs.

- [ ] **Step 4: Confirm the column exists**

```bash
curl -s http://localhost:8000/  # should return {"message":"PeerPath API is running"}
```

- [ ] **Step 5: Commit**

```bash
git add backend/services/db.py
git commit -m "feat: auto-migrate profile_complete columns on startup"
```

---

## Task 3: Update profile service to expose profile_complete

**Files:**
- Modify: `backend/services/profile.py`

- [ ] **Step 1: Update `get_profile` to read and return `profile_complete`**

Currently `get_profile` returns `row["profile"]` (a JSONB blob). The JSONB blob doesn't contain `profile_complete` yet. Update the function to merge that flag in:

```python
def get_profile(user_id: str) -> dict | None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT profile, profile_complete
                FROM user_profiles
                WHERE user_id = %s
                """,
                (user_id,),
            )
            row = cur.fetchone()
            if row is None:
                return None
            profile = dict(row["profile"])
            profile["profile_complete"] = row["profile_complete"]
            return profile
```

- [ ] **Step 2: Update `upsert_profile` to preserve `profile_complete`**

When an existing user (old path, still using the full form) updates their profile via `PUT /api/profile/me`, we must not reset `profile_complete` to false. Add an ON CONFLICT clause that keeps the existing value:

In `upsert_profile`, the INSERT already uses `ON CONFLICT (user_id) DO UPDATE SET`. Add to the SET list (do NOT reset profile_complete on normal save):

```python
# In the cur.execute call, the ON CONFLICT DO UPDATE block should NOT touch
# profile_complete or onboarding_completed_at — they are managed only by
# complete_onboarding(). No changes needed to the existing upsert SQL for those columns.
# But we must set default values on INSERT for new rows created via PUT /profile/me:
```

Add `profile_complete = FALSE` to the INSERT column/value lists so the column is populated on first insert:

```python
cur.execute(
    """
    INSERT INTO user_profiles (
        user_id, name, major, year, tags, help_topics, comfort_level,
        contact_phone, contact_email, past_challenges, searchable, profile,
        profile_complete, updated_at
    )
    VALUES (
        %(user_id)s, %(name)s, %(major)s, %(year)s, %(tags)s, %(help_topics)s,
        %(comfort_level)s, %(contact_phone)s, %(contact_email)s,
        %(past_challenges)s::jsonb, %(searchable)s, %(profile)s::jsonb,
        FALSE, NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
        name = EXCLUDED.name,
        major = EXCLUDED.major,
        year = EXCLUDED.year,
        tags = EXCLUDED.tags,
        help_topics = EXCLUDED.help_topics,
        comfort_level = EXCLUDED.comfort_level,
        contact_phone = EXCLUDED.contact_phone,
        contact_email = EXCLUDED.contact_email,
        past_challenges = EXCLUDED.past_challenges,
        searchable = EXCLUDED.searchable,
        profile = EXCLUDED.profile,
        updated_at = NOW();
    """,
    { ... }  # same params dict as before
)
```

- [ ] **Step 3: Add `complete_onboarding()` function**

Append to `backend/services/profile.py`:

```python
def complete_onboarding(user_id: str, profile_input: dict) -> dict:
    """Create or update profile from onboarding data and mark profile_complete = True."""
    user = get_user_by_id(user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    parsed_challenge = parse_challenge(profile_input["past_challenge"])

    profile = {
        "id": user_id,
        "name": user["full_name"],
        "major": profile_input["major"].strip(),
        "year": profile_input["year"].strip(),
        "tags": profile_input["tags"],
        "past_challenges": [
            {
                "raw": profile_input["past_challenge"].strip(),
                "parsed": {
                    "context": parsed_challenge["context"],
                    "struggle_type": parsed_challenge["struggle_type"],
                    "emotional_signal": parsed_challenge["emotional_signal"],
                    "resolution_type": parsed_challenge["help_needed"],
                },
            }
        ],
        "help_topics": profile_input["help_topics"],
        "comfort_level": profile_input["comfort_level"].strip(),
        "contact_phone": "",
        "contact_email": user["email"],
        "searchable": False,
        "profile_complete": True,
    }

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO user_profiles (
                    user_id, name, major, year, tags, help_topics, comfort_level,
                    contact_phone, contact_email, past_challenges, searchable, profile,
                    profile_complete, onboarding_completed_at, updated_at
                )
                VALUES (
                    %(user_id)s, %(name)s, %(major)s, %(year)s, %(tags)s, %(help_topics)s,
                    %(comfort_level)s, %(contact_phone)s, %(contact_email)s,
                    %(past_challenges)s::jsonb, %(searchable)s, %(profile)s::jsonb,
                    TRUE, NOW(), NOW()
                )
                ON CONFLICT (user_id) DO UPDATE SET
                    name = EXCLUDED.name,
                    major = EXCLUDED.major,
                    year = EXCLUDED.year,
                    tags = EXCLUDED.tags,
                    help_topics = EXCLUDED.help_topics,
                    comfort_level = EXCLUDED.comfort_level,
                    past_challenges = EXCLUDED.past_challenges,
                    help_topics = EXCLUDED.help_topics,
                    profile = EXCLUDED.profile,
                    profile_complete = TRUE,
                    onboarding_completed_at = COALESCE(user_profiles.onboarding_completed_at, NOW()),
                    updated_at = NOW();
                """,
                {
                    "user_id": user_id,
                    "name": profile["name"],
                    "major": profile["major"],
                    "year": profile["year"],
                    "tags": profile["tags"],
                    "help_topics": profile["help_topics"],
                    "comfort_level": profile["comfort_level"],
                    "contact_phone": profile["contact_phone"],
                    "contact_email": profile["contact_email"],
                    "past_challenges": json.dumps(profile["past_challenges"]),
                    "searchable": profile["searchable"],
                    "profile": json.dumps(profile),
                },
            )
        conn.commit()

    return profile
```

- [ ] **Step 4: Verify backend starts cleanly**

```bash
cd backend && uvicorn main:app --reload
```

Expected: no import errors.

- [ ] **Step 5: Commit**

```bash
git add backend/services/profile.py
git commit -m "feat: expose profile_complete in get_profile; add complete_onboarding()"
```

---

## Task 4: Add onboarding endpoint to backend router

**Files:**
- Modify: `backend/routers/profile.py`

- [ ] **Step 1: Add import for `complete_onboarding`**

In `backend/routers/profile.py`, update the import from `services.profile`:

```python
from services.profile import get_profile, upsert_profile, complete_onboarding
```

- [ ] **Step 2: Add `OnboardingRequest` Pydantic model**

After the existing `ProfileRequest` class, add:

```python
class OnboardingRequest(BaseModel):
    major: str = Field(min_length=2, max_length=80)
    year: str
    tags: list[str] = Field(min_length=1)
    past_challenge: str = Field(min_length=20, max_length=2000)
    help_topics: list[str] = Field(min_length=1)
    comfort_level: str

    @field_validator("year")
    @classmethod
    def validate_year(cls, value: str) -> str:
        if value not in ALLOWED_YEARS:
            raise ValueError("Invalid year selection.")
        return value

    @field_validator("comfort_level")
    @classmethod
    def validate_comfort_level(cls, value: str) -> str:
        if value not in ALLOWED_COMFORT_LEVELS:
            raise ValueError("Invalid comfort level selection.")
        return value

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, values: list[str]) -> list[str]:
        invalid = [v for v in values if v not in ALLOWED_TAGS]
        if invalid:
            raise ValueError(f"Invalid tags: {', '.join(invalid)}")
        return values

    @field_validator("help_topics")
    @classmethod
    def validate_help_topics(cls, values: list[str]) -> list[str]:
        invalid = [v for v in values if v not in ALLOWED_HELP_TOPICS]
        if invalid:
            raise ValueError(f"Invalid help topics: {', '.join(invalid)}")
        return values
```

- [ ] **Step 3: Add the `PUT /profile/onboarding` endpoint**

After the `update_profile` endpoint, add:

```python
@router.put("/onboarding")
def onboarding(request: OnboardingRequest, current_user: dict = Depends(get_current_user)):
    profile = complete_onboarding(current_user["id"], request.model_dump())
    return {"profile": profile}
```

- [ ] **Step 4: Test with curl**

First register a new test user:

```bash
curl -s -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"onboard_test@test.com","full_name":"Test User","password":"testpass123"}' \
  | python3 -m json.tool
```

Save the `access_token` from the response, then test onboarding:

```bash
TOKEN="<paste_token_here>"
curl -s -X PUT http://localhost:8000/api/profile/onboarding \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "major": "Computer Science",
    "year": "sophomore",
    "tags": ["academic stress", "burnout"],
    "past_challenge": "I have been really overwhelmed with my coursework and feel like I cannot keep up with everything.",
    "help_topics": ["burnout recovery", "time management"],
    "comfort_level": "open to messages"
  }' | python3 -m json.tool
```

Expected: 200 response with `profile` object containing `"profile_complete": true`.

- [ ] **Step 5: Test GET /profile/me returns profile_complete**

```bash
curl -s http://localhost:8000/api/profile/me \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

Expected: `profile.profile_complete` is `true`.

- [ ] **Step 6: Commit**

```bash
git add backend/routers/profile.py
git commit -m "feat: add PUT /api/profile/onboarding endpoint"
```

---

## Task 5: Create agent chat system prompt

**Files:**
- Create: `backend/prompts/agent_chat.txt`

- [ ] **Step 1: Write the system prompt**

Create `backend/prompts/agent_chat.txt` with this content:

```
You are a compassionate peer support assistant at a university. Your job is to have a brief, warm conversation with a student to understand what they are going through, then connect them with the right peer mentors.

CONVERSATION GOAL:
Understand the student's situation well enough to match them with peers who have been through something similar. You need to know:
- What is happening (the context/situation)
- What kind of difficulty it is (academic, social, emotional, logistical)
- How they are feeling emotionally
- What kind of support they are hoping for

CONVERSATION RULES:
- Be warm, non-judgmental, and concise. One question at a time.
- Ask follow-up questions naturally, not like a checklist.
- After 3–4 exchanges where you have collected sufficient context, stop asking and trigger matching.
- Never ask for personally identifying information.
- Keep each reply to 2–3 sentences maximum.

RESPONSE FORMAT:
Always respond with a JSON object (no markdown fences):
{
  "reply": "<your conversational response to the student>",
  "done": false
}

When you have enough context to trigger matching (after 3+ substantive user messages), respond with:
{
  "reply": "<brief warm message like 'Let me find some peers who have been through something similar…'>",
  "done": true,
  "tags": ["<one or more relevant tags from the list below>"],
  "description": "<a 2–3 sentence synthesis of the student's situation in their words, suitable for the matching pipeline>"
}

AVAILABLE TAGS (pick the most relevant 1–4):
academic stress, course registration, research decisions, internship search, changing majors, time management, burnout, making friends, dating, social life, social anxiety, joining clubs, anxiety, campus navigation, housing, freshman adjustment, transfer student, international student adjustment

The opening message to the student is: {"reply": "嗨，遇到什么困惑了吗？说说看", "done": false}
```

- [ ] **Step 2: Commit**

```bash
git add backend/prompts/agent_chat.txt
git commit -m "feat: add agent chat system prompt"
```

---

## Task 6: Create agent chat service

**Files:**
- Create: `backend/services/agent_chat.py`

- [ ] **Step 1: Write the service**

Create `backend/services/agent_chat.py`:

```python
"""
In-memory multi-turn agent chat service.

Sessions are stored in a module-level dict keyed by session UUID.
Each session holds the full OpenAI messages list (system + alternating user/assistant).
Sessions expire after IDLE_MINUTES of inactivity.
"""

import json
import os
import uuid
from datetime import datetime, timedelta

from openai import OpenAI

_PROMPT_PATH = os.path.join(os.path.dirname(__file__), "..", "prompts", "agent_chat.txt")
_IDLE_MINUTES = 30

_sessions: dict[str, dict] = {}
# Structure: { session_id: { "messages": [...], "last_active": datetime } }


def _get_system_prompt() -> str:
    with open(_PROMPT_PATH, "r", encoding="utf-8") as f:
        return f.read()


def _prune_idle_sessions() -> None:
    """Remove sessions idle longer than IDLE_MINUTES."""
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
    """Create a new session and return the agent's opening message."""
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
    """
    Append user message, call LLM, parse response.

    Returns:
        {
          "session_id": str,
          "reply": str,
          "done": bool,
          "tags": list[str] | None,       # present when done=True
          "description": str | None,       # present when done=True
        }
    """
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
        # Fallback: treat raw as plain reply, continue conversation
        parsed = {"reply": raw, "done": False}

    # Store assistant turn
    session["messages"].append({"role": "assistant", "content": json.dumps(parsed, ensure_ascii=False)})

    result = {
        "session_id": session_id,
        "reply": parsed.get("reply", ""),
        "done": bool(parsed.get("done", False)),
        "tags": parsed.get("tags") if parsed.get("done") else None,
        "description": parsed.get("description") if parsed.get("done") else None,
    }
    return result
```

- [ ] **Step 2: Verify imports resolve (from backend/ directory)**

```bash
cd backend && python3 -c "from services.agent_chat import start_session, send_message; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/services/agent_chat.py
git commit -m "feat: add in-memory agent chat service with OpenAI multi-turn loop"
```

---

## Task 7: Create agent router

**Files:**
- Create: `backend/routers/agent.py`

- [ ] **Step 1: Write the router**

Create `backend/routers/agent.py`:

```python
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.agent_chat import start_session, send_message
from services.ranker import rank_peers

router = APIRouter(prefix="/agent", tags=["agent"])


class ChatRequest(BaseModel):
    session_id: str | None = None  # None → start a new session
    message: str | None = None     # None → return opening message for new session


class PeerResult(BaseModel):
    rank: int
    peer_id: str
    name: str
    major: str
    year: str
    contact_phone: str = ""
    contact_email: str = ""
    tags: list[str]
    tag_overlap: int
    field_score: int
    llm_adjustment: int
    final_score: float
    reason: str
    conversation_starter: str


class ChatResponse(BaseModel):
    session_id: str
    reply: str
    done: bool
    matches: list[PeerResult] | None = None


@router.post("/chat", response_model=ChatResponse)
def agent_chat(request: ChatRequest):
    # New session — return opening message
    if request.session_id is None:
        result = start_session()
        return ChatResponse(
            session_id=result["session_id"],
            reply=result["reply"],
            done=False,
        )

    # Continue existing session
    if not request.message or not request.message.strip():
        raise HTTPException(status_code=422, detail="message cannot be empty")

    try:
        result = send_message(request.session_id, request.message.strip())
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent error: {e}")

    # If agent decided it has enough context, run matching pipeline
    matches = None
    if result["done"] and result.get("tags") is not None:
        try:
            raw_matches = rank_peers(result["tags"], result["description"])
            matches = [
                PeerResult(
                    rank=m["rank"],
                    peer_id=m["peer"]["id"],
                    name=m["peer"]["name"],
                    major=m["peer"]["major"],
                    year=m["peer"]["year"],
                    contact_phone=m["peer"].get("contact_phone", ""),
                    contact_email=m["peer"].get("contact_email", ""),
                    tags=m["peer"]["tags"],
                    tag_overlap=m["tag_overlap"],
                    field_score=m["field_score"],
                    llm_adjustment=m["llm_adjustment"],
                    final_score=m["final_score"],
                    reason=m["reason"],
                    conversation_starter=m["conversation_starter"],
                )
                for m in raw_matches
            ]
        except Exception as e:
            # Matching failed — return done=True with no matches rather than crashing
            print(f"[agent] matching failed: {e}")
            matches = []

    return ChatResponse(
        session_id=result["session_id"],
        reply=result["reply"],
        done=result["done"],
        matches=matches,
    )
```

- [ ] **Step 2: Register the agent router in main.py**

Open `backend/main.py`. Add the import:

```python
from routers import auth, chat, match, history, profile, agent
```

Add the router registration after the other routers:

```python
app.include_router(agent.router, prefix="/api")
```

- [ ] **Step 3: Test the full agent flow**

Start a session:

```bash
curl -s -X POST http://localhost:8000/api/agent/chat \
  -H "Content-Type: application/json" \
  -d '{}' | python3 -m json.tool
```

Expected: `{ "session_id": "<uuid>", "reply": "嗨，遇到什么困惑了吗？说说看", "done": false }`

Save session_id, then send a message:

```bash
SESSION="<paste session_id here>"
curl -s -X POST http://localhost:8000/api/agent/chat \
  -H "Content-Type: application/json" \
  -d "{\"session_id\": \"$SESSION\", \"message\": \"I transferred here last semester and I still have no friends. I feel really lonely.\"}" \
  | python3 -m json.tool
```

Expected: agent reply asking a follow-up question, `done: false`.

Send 2–3 more messages until `done: true` and `matches` array appears.

- [ ] **Step 4: Commit**

```bash
git add backend/routers/agent.py backend/main.py
git commit -m "feat: add /api/agent/chat endpoint and register router"
```

---

## Task 8: Update frontend types

**Files:**
- Modify: `frontend/src/types.ts`

- [ ] **Step 1: Add `profile_complete` to `UserProfile`**

In `frontend/src/types.ts`, find the `UserProfile` interface and add the field:

```typescript
export interface UserProfile {
  id: string;
  name: string;
  major: string;
  year: string;
  tags: string[];
  past_challenges: Array<{
    raw: string;
    parsed: {
      context: string;
      struggle_type: string;
      emotional_signal: string;
      resolution_type: string;
    };
  }>;
  help_topics: string[];
  comfort_level: string;
  contact_phone: string;
  contact_email: string;
  searchable: boolean;
  profile_complete: boolean;
}
```

- [ ] **Step 2: Add agent chat types**

Append to `frontend/src/types.ts`:

```typescript
export interface AgentMessage {
  role: "agent" | "user";
  content: string;
}

export interface AgentMatchResult {
  rank: number;
  peer_id: string;
  name: string;
  major: string;
  year: string;
  contact_phone: string;
  contact_email: string;
  tags: string[];
  tag_overlap: number;
  field_score: number;
  llm_adjustment: number;
  final_score: number;
  reason: string;
  conversation_starter: string;
}

export interface AgentChatResponse {
  session_id: string;
  reply: string;
  done: boolean;
  matches: AgentMatchResult[] | null;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types.ts
git commit -m "feat: add profile_complete to UserProfile and agent chat types"
```

---

## Task 9: Add onboarding and agent API functions

**Files:**
- Modify: `frontend/src/api/profileApi.ts`
- Create: `frontend/src/api/agentApi.ts`

- [ ] **Step 1: Add `updateOnboarding()` to profileApi.ts**

Append to `frontend/src/api/profileApi.ts`:

```typescript
export async function updateOnboarding(payload: {
  major: string;
  year: string;
  tags: string[];
  past_challenge: string;
  help_topics: string[];
  comfort_level: string;
}) {
  const response = await fetch(`${API_BASE}/onboarding`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}
```

- [ ] **Step 2: Create agentApi.ts**

Create `frontend/src/api/agentApi.ts`:

```typescript
import type { AgentChatResponse } from "../types";

const API_BASE = "http://localhost:8000/api/agent";
const TOKEN_KEY = "peerpath_auth_token";

function getAuthHeaders() {
  const token = window.localStorage.getItem(TOKEN_KEY);
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function handleResponse(response: Response): Promise<AgentChatResponse> {
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) message = body.detail;
    } catch { /* keep default */ }
    throw new Error(message);
  }
  return response.json() as Promise<AgentChatResponse>;
}

export async function startAgentSession(): Promise<AgentChatResponse> {
  const response = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({}),
  });
  return handleResponse(response);
}

export async function sendAgentMessage(
  sessionId: string,
  message: string
): Promise<AgentChatResponse> {
  const response = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ session_id: sessionId, message }),
  });
  return handleResponse(response);
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/profileApi.ts frontend/src/api/agentApi.ts
git commit -m "feat: add updateOnboarding() and agent chat API functions"
```

---

## Task 10: Create OnboardingFlow component

**Files:**
- Create: `frontend/src/components/OnboardingFlow.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/OnboardingFlow.tsx`:

```tsx
import { useState } from "react";
import { updateOnboarding } from "../api/profileApi";
import {
  PROFILE_HELP_TOPIC_OPTIONS,
  PROFILE_YEAR_OPTIONS,
  TAG_CATEGORIES,
} from "../data";
import type { UserProfile } from "../types";

interface Props {
  onComplete: (profile: UserProfile) => void;
}

type Step = 1 | 2 | 3;

const ALL_TAGS = TAG_CATEGORIES.flatMap((c) => c.tags);

export default function OnboardingFlow({ onComplete }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [major, setMajor] = useState("");
  const [year, setYear] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [pastChallenge, setPastChallenge] = useState("");
  const [helpTopics, setHelpTopics] = useState<string[]>([]);
  const [comfortLevel, setComfortLevel] = useState("open to messages");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggleItem<T>(list: T[], item: T): T[] {
    return list.includes(item) ? list.filter((v) => v !== item) : [...list, item];
  }

  const canAdvanceStep1 = major.trim().length >= 2 && year !== "";
  const canAdvanceStep2 = selectedTags.length > 0 && pastChallenge.trim().length >= 20;
  const canFinish = helpTopics.length > 0;

  async function handleFinish() {
    if (!canFinish) return;
    setSaving(true);
    setError("");
    try {
      const result = await updateOnboarding({
        major: major.trim(),
        year,
        tags: selectedTags,
        past_challenge: pastChallenge.trim(),
        help_topics: helpTopics,
        comfort_level: comfortLevel,
      });
      if (result.profile) {
        onComplete(result.profile);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        {/* Progress indicator */}
        <div className="flex items-center gap-2 mb-8">
          {([1, 2, 3] as Step[]).map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                s <= step ? "bg-[#FFCB05]" : "bg-white/10"
              }`}
            />
          ))}
        </div>

        {/* Step 1 — Basic info */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold text-white">Tell us about yourself</h1>
              <p className="mt-1 text-sm text-white/50">This helps us find peers who understand your situation.</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-white/70 mb-1">What's your major?</label>
                <input
                  type="text"
                  value={major}
                  onChange={(e) => setMajor(e.target.value)}
                  placeholder="e.g. Computer Science"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/25 focus:border-[#FFCB05]/50 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm text-white/70 mb-1">What year are you?</label>
                <select
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white focus:border-[#FFCB05]/50 focus:outline-none"
                >
                  <option value="" disabled className="bg-[#0a0a0f]">Select year</option>
                  {PROFILE_YEAR_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value} className="bg-[#0a0a0f]">
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              disabled={!canAdvanceStep1}
              onClick={() => setStep(2)}
              className="w-full rounded-lg bg-[#FFCB05] py-3 font-semibold text-[#0a0a0f] disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Continue
            </button>
          </div>
        )}

        {/* Step 2 — Past challenges */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold text-white">What have you been through?</h1>
              <p className="mt-1 text-sm text-white/50">
                These experiences will help other students find you. Select all that apply.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-white/70 mb-2">Pick relevant tags</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_TAGS.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => setSelectedTags((prev) => toggleItem(prev, tag))}
                      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                        selectedTags.includes(tag)
                          ? "border-[#FFCB05] bg-[#FFCB05]/10 text-[#FFCB05]"
                          : "border-white/15 text-white/50 hover:border-white/30"
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm text-white/70 mb-1">
                  Describe it in your own words
                </label>
                <textarea
                  value={pastChallenge}
                  onChange={(e) => setPastChallenge(e.target.value)}
                  rows={4}
                  placeholder="Tell us what was happening. Be as specific or as vague as you're comfortable with."
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/25 focus:border-[#FFCB05]/50 focus:outline-none resize-none"
                />
                <p className="mt-1 text-xs text-white/30">{pastChallenge.trim().length} / 2000 chars · min 20</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 rounded-lg border border-white/10 py-3 text-sm text-white/60 hover:border-white/20"
              >
                Back
              </button>
              <button
                disabled={!canAdvanceStep2}
                onClick={() => setStep(3)}
                className="flex-[2] rounded-lg bg-[#FFCB05] py-3 font-semibold text-[#0a0a0f] disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — How you want to help */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold text-white">Who do you want to help?</h1>
              <p className="mt-1 text-sm text-white/50">
                Select the topics where you feel you could offer support or a listening ear.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-white/70 mb-2">Help topics</label>
                <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-1">
                  {PROFILE_HELP_TOPIC_OPTIONS.map((topic) => (
                    <button
                      key={topic}
                      onClick={() => setHelpTopics((prev) => toggleItem(prev, topic))}
                      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                        helpTopics.includes(topic)
                          ? "border-[#FFCB05] bg-[#FFCB05]/10 text-[#FFCB05]"
                          : "border-white/15 text-white/50 hover:border-white/30"
                      }`}
                    >
                      {topic}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm text-white/70 mb-1">Comfort with messages</label>
                <select
                  value={comfortLevel}
                  onChange={(e) => setComfortLevel(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white focus:border-[#FFCB05]/50 focus:outline-none"
                >
                  <option value="open to messages" className="bg-[#0a0a0f]">Open to messages</option>
                  <option value="prefers intro message" className="bg-[#0a0a0f]">Prefers a scheduled chat</option>
                </select>
              </div>
            </div>

            {error && (
              <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                className="flex-1 rounded-lg border border-white/10 py-3 text-sm text-white/60 hover:border-white/20"
              >
                Back
              </button>
              <button
                disabled={!canFinish || saving}
                onClick={handleFinish}
                className="flex-[2] rounded-lg bg-[#FFCB05] py-3 font-semibold text-[#0a0a0f] disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {saving ? "Saving…" : "Get started"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/OnboardingFlow.tsx
git commit -m "feat: add 3-step OnboardingFlow component"
```

---

## Task 11: Create MainDashboard component

**Files:**
- Create: `frontend/src/components/MainDashboard.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/MainDashboard.tsx`:

```tsx
import type { ChatThread } from "../types";

interface Props {
  threads: ChatThread[];
  onOpenThread: (threadId: string) => void;
  onStartFirstMatch: () => void;
}

function formatRelativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function MainDashboard({ threads, onOpenThread, onStartFirstMatch }: Props) {
  const sorted = [...threads].sort(
    (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
  );

  return (
    <div className="flex flex-col min-h-screen bg-[#0a0a0f]">
      <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full">
        <h1 className="text-xl font-semibold text-white mb-6">Your matches</h1>

        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="text-4xl mb-4">🤝</div>
            <p className="text-white/60 text-sm mb-6 max-w-xs">
              You haven't connected with anyone yet. Start a conversation to find a peer who gets it.
            </p>
            <button
              onClick={onStartFirstMatch}
              className="rounded-full bg-[#FFCB05] px-6 py-3 text-sm font-semibold text-[#0a0a0f]"
            >
              Find your first match
            </button>
          </div>
        ) : (
          <ul className="space-y-2">
            {sorted.map((thread) => (
              <li key={thread.thread_id}>
                <button
                  onClick={() => onOpenThread(thread.thread_id)}
                  className="w-full flex items-center gap-4 rounded-xl border border-white/8 bg-white/3 px-4 py-4 text-left hover:bg-white/6 transition-colors"
                >
                  {/* Avatar */}
                  <div className="h-10 w-10 shrink-0 rounded-full bg-[#FFCB05]/20 flex items-center justify-center text-sm font-semibold text-[#FFCB05]">
                    {thread.peer_name.charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-white truncate">{thread.peer_name}</span>
                      <span className="text-xs text-white/30 ml-2 shrink-0">
                        {formatRelativeTime(thread.last_message_at)}
                      </span>
                    </div>
                    <p className="text-xs text-white/40 truncate mt-0.5">
                      {thread.peer_major} · {thread.peer_year}
                    </p>
                  </div>

                  {/* Unread badge */}
                  {thread.unread_count > 0 && (
                    <div className="shrink-0 h-5 min-w-5 rounded-full bg-[#FFCB05] flex items-center justify-center px-1.5">
                      <span className="text-xs font-bold text-[#0a0a0f]">{thread.unread_count}</span>
                    </div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/MainDashboard.tsx
git commit -m "feat: add MainDashboard with sorted thread list and empty-state CTA"
```

---

## Task 12: Create AgentChatOverlay component

**Files:**
- Create: `frontend/src/components/AgentChatOverlay.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/AgentChatOverlay.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { startAgentSession, sendAgentMessage } from "../api/agentApi";
import type { AgentMatchResult, AgentMessage } from "../types";

interface Props {
  onOpenDM: (peerId: string, peerName: string) => void;
}

export default function AgentChatOverlay({ onOpenDM }: Props) {
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<AgentMatchResult[] | null>(null);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, matches]);

  async function openChat() {
    setOpen(true);
    if (sessionId) return; // already initialized
    setLoading(true);
    setError("");
    try {
      const resp = await startAgentSession();
      setSessionId(resp.session_id);
      setMessages([{ role: "agent", content: resp.reply }]);
    } catch (err) {
      setError("Couldn't connect to the assistant. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    if (!input.trim() || !sessionId || loading) return;
    const userText = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userText }]);
    setLoading(true);
    setError("");
    try {
      const resp = await sendAgentMessage(sessionId, userText);
      setMessages((prev) => [...prev, { role: "agent", content: resp.reply }]);
      if (resp.done && resp.matches !== null) {
        setMatches(resp.matches);
      }
    } catch (err) {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setSessionId(null);
    setMessages([]);
    setMatches(null);
    setError("");
    setInput("");
    setOpen(false);
  }

  return (
    <>
      {/* FAB */}
      <button
        onClick={openChat}
        aria-label="Chat with AI assistant"
        className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full bg-[#FFCB05] shadow-lg flex items-center justify-center hover:bg-[#e6b800] transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6 text-[#0a0a0f]">
          <path fillRule="evenodd" d="M4.848 2.771A49.144 49.144 0 0 1 12 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 0 1-3.476.383.39.39 0 0 0-.297.17l-2.755 4.133a.75.75 0 0 1-1.248 0l-2.755-4.133a.39.39 0 0 0-.297-.17 48.9 48.9 0 0 1-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.68 3.348-3.97Z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Overlay panel */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-end sm:items-end sm:justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Chat panel */}
          <div className="relative z-10 w-full sm:w-96 h-[75vh] sm:h-[600px] sm:m-6 flex flex-col rounded-t-2xl sm:rounded-2xl bg-[#111118] border border-white/10 shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-[#FFCB05]" />
                <span className="text-sm font-medium text-white">PeerPath Assistant</span>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-white/40 hover:text-white/70 transition-colors text-lg leading-none"
              >
                ✕
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-[#FFCB05] text-[#0a0a0f] font-medium rounded-br-sm"
                        : "bg-white/8 text-white/85 rounded-bl-sm"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="bg-white/8 rounded-2xl rounded-bl-sm px-4 py-3">
                    <div className="flex gap-1 items-center">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="h-1.5 w-1.5 rounded-full bg-white/40 animate-bounce"
                          style={{ animationDelay: `${i * 0.15}s` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Match results */}
              {matches !== null && (
                <div className="space-y-2 mt-2">
                  <p className="text-xs text-white/40 text-center">Top matches for you</p>
                  {matches.length === 0 && (
                    <p className="text-sm text-white/50 text-center py-2">
                      No strong matches found right now. Try the full form for more options.
                    </p>
                  )}
                  {matches.map((match) => (
                    <button
                      key={match.peer_id}
                      onClick={() => {
                        setOpen(false);
                        onOpenDM(match.peer_id, match.name);
                      }}
                      className="w-full text-left rounded-xl border border-white/10 bg-white/5 px-4 py-3 hover:bg-white/8 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-white">{match.name}</span>
                        <span className="text-xs text-[#FFCB05]">
                          {Math.round((Math.min(match.final_score, 110) / 110) * 100)}% match
                        </span>
                      </div>
                      <p className="text-xs text-white/40">{match.major} · {match.year}</p>
                      {match.conversation_starter && (
                        <p className="mt-2 text-xs text-white/55 italic leading-relaxed line-clamp-2">
                          "{match.conversation_starter}"
                        </p>
                      )}
                    </button>
                  ))}
                  <button
                    onClick={handleReset}
                    className="w-full text-xs text-white/30 hover:text-white/50 py-1 transition-colors"
                  >
                    Start over
                  </button>
                </div>
              )}

              {error && (
                <p className="text-xs text-red-400 text-center py-1">{error}</p>
              )}

              <div ref={bottomRef} />
            </div>

            {/* Input */}
            {matches === null && (
              <div className="px-4 py-3 border-t border-white/8 flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  placeholder="Type here…"
                  disabled={loading}
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#FFCB05]/40 disabled:opacity-50"
                />
                <button
                  onClick={() => void handleSend()}
                  disabled={!input.trim() || loading}
                  className="rounded-lg bg-[#FFCB05] px-4 py-2 text-sm font-semibold text-[#0a0a0f] disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Send
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/AgentChatOverlay.tsx
git commit -m "feat: add AgentChatOverlay FAB with multi-turn chat and inline match results"
```

---

## Task 13: Wire App.tsx routing logic

**Files:**
- Modify: `frontend/src/App.tsx`

This is the most invasive task. Make changes carefully.

- [ ] **Step 1: Add imports at the top of App.tsx**

After the existing imports, add:

```typescript
import OnboardingFlow from "./components/OnboardingFlow";
import MainDashboard from "./components/MainDashboard";
import AgentChatOverlay from "./components/AgentChatOverlay";
```

- [ ] **Step 2: Add `AppView` type and state**

Find the line near the top of the `App` component that defines the `Phase` type:

```typescript
type Phase = "form" | "loading" | "results";
```

Add a new type above or near it:

```typescript
type AppView = "landing" | "onboarding" | "dashboard" | "form";
```

Inside the `App` component, near the top of the state declarations (around line 202), add:

```typescript
const [appView, setAppView] = useState<AppView>("landing");
```

- [ ] **Step 3: Update the `fetchCurrentUser` effect to check profile_complete**

Locate the `useEffect` that calls `fetchCurrentUser()` (around line 254):

```typescript
useEffect(() => {
  fetchCurrentUser()
    .then((user) => setCurrentUser(user))
    .catch(() => {
      setCurrentUser(null);
    });
}, []);
```

Replace it with:

```typescript
useEffect(() => {
  fetchCurrentUser()
    .then(async (user) => {
      setCurrentUser(user);
      if (user) {
        // Check profile_complete to decide initial view
        try {
          const { profile } = await fetchProfile();
          if (!profile || !profile.profile_complete) {
            setAppView("onboarding");
          } else {
            setAppView("dashboard");
            // Pre-load chat threads for the dashboard
            void loadThreads();
          }
        } catch {
          // Profile fetch failed — show landing, user can try again
          setAppView("landing");
        }
      }
    })
    .catch(() => {
      setCurrentUser(null);
      setAppView("landing");
    });
}, []);
```

Note: `loadThreads` is defined later in the component. If TypeScript complains about it being used before declaration, move `loadThreads` definition above this effect (or add `// eslint-disable-next-line react-hooks/exhaustive-deps` if using the hook rule).

- [ ] **Step 4: Update login/register success handlers to route correctly**

Find `handleLogin` (or wherever `setCurrentUser(user)` is called after successful login/register). After setting `currentUser`, add profile check logic:

Locate the auth success section (search for `setCurrentUser` inside the login handler). The pattern is:

```typescript
const user = result.user;
setCurrentUser(user);
// ... existing code ...
```

After `setCurrentUser(user)`, add:

```typescript
// Route based on profile_complete
try {
  const { profile: p } = await fetchProfile();
  if (!p || !p.profile_complete) {
    setAppView("onboarding");
  } else {
    setAppView("dashboard");
    void loadThreads();
  }
} catch {
  setAppView("onboarding");
}
```

Do the same in the register handler.

- [ ] **Step 5: Add logout handler update**

Find where `setCurrentUser(null)` is called on logout. Add after it:

```typescript
setAppView("landing");
```

- [ ] **Step 6: Wire up the dashboard's "open thread" callback**

The `MainDashboard` component calls `onOpenThread(threadId)`. This should open the existing chat sidebar to that thread. Find the `setChatOpen(true)` / `setActiveThreadId` pattern in the existing code and create a callback:

In App's state section, the chat open logic already exists. Add a handler:

```typescript
const handleOpenThread = useCallback((threadId: string) => {
  setActiveThreadId(threadId);
  setChatOpen(true);
  void fetchThread(threadId).then((data) => {
    setThreads((prev) =>
      prev.map((t) => (t.thread_id === threadId ? { ...t, ...data.thread } : t))
    );
  });
}, []);
```

- [ ] **Step 7: Wire up the agent chat's "open DM" callback**

Add a handler for when the user clicks a match result in the agent chat:

```typescript
const handleAgentOpenDM = useCallback(async (peerId: string, peerName: string) => {
  if (!currentUser) return;
  try {
    const { thread_id } = await createOrGetThread(peerId, peerName);
    setActiveThreadId(thread_id);
    setChatOpen(true);
    // Refresh thread list
    void loadThreads();
  } catch {
    // Silently fail — user can open chat manually
  }
}, [currentUser, loadThreads]);
```

- [ ] **Step 8: Add AppView rendering in the JSX**

Find where the existing page content renders (the `return (...)` of the `App` component). The existing code renders based on `activePage` and `phase`. 

Inside the main content area (after the `<Starfield />` and navbar), add a top-level conditional based on `appView`:

```tsx
{/* ── App View Router ── */}
{appView === "onboarding" && currentUser && (
  <OnboardingFlow
    onComplete={(profile) => {
      setCurrentProfile(profile);
      setAppView("dashboard");
      void loadThreads();
    }}
  />
)}

{appView === "dashboard" && currentUser && (
  <>
    <MainDashboard
      threads={threads}
      onOpenThread={handleOpenThread}
      onStartFirstMatch={() => setAppView("form")}
    />
    <AgentChatOverlay onOpenDM={handleAgentOpenDM} />
  </>
)}

{(appView === "form" || appView === "landing" || !currentUser) && (
  /* existing landing / form / results JSX goes here */
  /* This is everything that was rendering before — wrap it in this condition */
)}
```

The exact wrapping depends on where the existing content renders. The goal is:
- When `appView === "onboarding"`: show only the onboarding flow (full screen)
- When `appView === "dashboard"`: show dashboard + agent FAB overlay
- Otherwise: show the existing landing/form/results flow

- [ ] **Step 9: Verify the app builds**

```bash
cd frontend && npm run build 2>&1 | tail -20
```

Expected: `✓ built in Xs` with no TypeScript errors.

- [ ] **Step 10: Manual smoke test**

1. Open `http://localhost:5173`
2. Register a new account → should land on OnboardingFlow step 1
3. Complete all 3 steps → should land on MainDashboard (empty state with CTA)
4. Click "Find your first match" → should show existing form flow
5. Click the FAB (bottom right) → should open agent chat overlay
6. Send 4 messages → agent should return match cards
7. Click a match card → should open DM sidebar
8. Log out → should return to landing
9. Log back in as the same user → should land on MainDashboard (not onboarding)

- [ ] **Step 11: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: add AppView routing — onboarding for new users, dashboard for returning users"
```

---

## Spec Coverage Check

| Requirement | Task(s) |
|---|---|
| 改动1: Login → check profile_complete → onboarding or dashboard | Task 13 Steps 3–4 |
| 改动1: Dashboard — nav bar with profile entry (preserved) | Existing nav kept; AppView "dashboard" wraps MainDashboard |
| 改动1: Dashboard — thread list sorted by time, unread counts | Task 11 (MainDashboard) |
| 改动1: Dashboard — FAB AI entry | Task 12 (AgentChatOverlay) |
| 改动1: Empty state CTA | Task 11 |
| 改动2: Onboarding Step 1 — major + year | Task 10 |
| 改动2: Onboarding Step 2 — tags + free text | Task 10 |
| 改动2: Onboarding Step 3 — help_topics + comfort_level | Task 10 |
| 改动2: Write to DB, set profile_complete=true | Tasks 3–4 |
| 改动2: Redirect to main after completion | Task 13 Step 8 |
| 改动3: FAB in bottom right | Task 12 |
| 改动3: Overlay, not new page | Task 12 |
| 改动3: Agent opening line | Task 5 prompt |
| 改动3: Multi-turn 3–5 rounds | Tasks 5–6 |
| 改动3: Generate tags+description → call matching pipeline | Task 7 |
| 改动3: Show top 3 matches with conversation starters | Task 12 |
| 改动3: Click match → DM | Task 13 Step 7 |
| 改动3: Backend /api/agent/chat endpoint | Tasks 5–7 |
| 改动4: profile_complete field | Tasks 1–2 |
| 改动4: onboarding_completed_at field | Tasks 1–2 |
| 改动4: past_challenges, help_topics, comfort_level | Existing fields, now in onboarding path |
| Not changed: profile edit entry in nav | Preserved in existing nav |
| Not changed: form matching flow | Preserved, accessible via appView="form" |
| Not changed: DM/chat | Preserved |
| Not changed: matching pipeline logic | Only called with new input, not modified |
