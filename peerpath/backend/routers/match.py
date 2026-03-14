import sys
import os

# Ensure backend/ is on sys.path so `services.*` imports resolve correctly
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.ranker import rank_peers
from services.tag_filter import filter_by_tags

router = APIRouter()


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class MatchRequest(BaseModel):
    tags: list[str] = []
    description: str


class PeerResult(BaseModel):
    rank: int
    peer_id: str
    name: str
    major: str
    year: str
    tags: list[str]
    tag_overlap: int
    field_score: int
    llm_adjustment: int
    final_score: float
    reason: str
    conversation_starter: str


class MatchResponse(BaseModel):
    total_candidates: int
    matches: list[PeerResult]


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post("/match", response_model=MatchResponse)
def match(request: MatchRequest):
    if not request.description.strip():
        raise HTTPException(status_code=422, detail="description cannot be empty")

    try:
        # Stage 1 count — run tag filter separately to get the true candidate total
        candidates = filter_by_tags(request.tags)
        total_candidates = len(candidates)

        raw_results = rank_peers(request.tags, request.description)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Matching error: {e}")

    matches = [
        PeerResult(
            rank=r["rank"],
            peer_id=r["peer"]["id"],
            name=r["peer"]["name"],
            major=r["peer"]["major"],
            year=r["peer"]["year"],
            tags=r["peer"]["tags"],
            tag_overlap=r["tag_overlap"],
            field_score=r["field_score"],
            llm_adjustment=r["llm_adjustment"],
            final_score=r["final_score"],
            reason=r["reason"],
            conversation_starter=r["conversation_starter"],
        )
        for r in raw_results
    ]

    return MatchResponse(total_candidates=total_candidates, matches=matches)


# ---------------------------------------------------------------------------
# Manual test commands (run from backend/ directory):
#
# Test 1 — transfer student with tags:
#   curl -X POST http://localhost:8000/api/match \
#        -H "Content-Type: application/json" \
#        -d '{"tags": ["transfer student", "making friends"], "description": "I just transferred and don'\''t know anyone"}'
#
# Test 2 — dating confusion, no tags:
#   curl -X POST http://localhost:8000/api/match \
#        -H "Content-Type: application/json" \
#        -d '{"tags": [], "description": "Dating in college is really confusing"}'
# ---------------------------------------------------------------------------
