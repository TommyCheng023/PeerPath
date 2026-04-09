import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from services.agent_chat import start_session, send_message
from services.auth import get_optional_current_user
from services.history_store import append_entry
from services.ranker import rank_peers
from services.tag_filter import filter_by_tags

router = APIRouter(prefix="/agent", tags=["agent"])


class ChatRequest(BaseModel):
    session_id: str | None = None
    message: str | None = None


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
    query_tags: list[str] | None = None
    query_description: str | None = None


@router.post("/chat", response_model=ChatResponse)
def agent_chat(
    request: ChatRequest,
    current_user: dict | None = Depends(get_optional_current_user),
):
    if request.session_id is None:
        result = start_session()
        return ChatResponse(
            session_id=result["session_id"],
            reply=result["reply"],
            done=False,
            query_tags=None,
            query_description=None,
        )

    if not request.message or not request.message.strip():
        raise HTTPException(status_code=422, detail="message cannot be empty")

    try:
        result = send_message(request.session_id, request.message.strip())
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent error: {e}")

    matches = None
    query_tags = result.get("tags") if result["done"] else None
    query_description = result.get("description") if result["done"] else None
    if result["done"] and result.get("tags") is not None:
        try:
            total_candidates = len(filter_by_tags(result["tags"]))
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
            if current_user is not None:
                append_entry(
                    user_id=current_user["id"].strip().lower(),
                    tags=result["tags"],
                    description=result["description"],
                    total_candidates=total_candidates,
                    matches=[m.model_dump() for m in matches],
                    source="agent",
                )
        except Exception as e:
            print(f"[agent] matching failed: {e}")
            matches = []

    return ChatResponse(
        session_id=result["session_id"],
        reply=result["reply"],
        done=result["done"],
        matches=matches,
        query_tags=query_tags,
        query_description=query_description,
    )
