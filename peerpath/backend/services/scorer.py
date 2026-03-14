import json
import os

from openai import OpenAI
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

_PROMPT_PATH = os.path.join(os.path.dirname(__file__), "..", "prompts", "score_relevance.txt")

# Field weights for Layer 1
_WEIGHTS = {
    "context": 40,
    "struggle_type": 35,
    "emotional_signal": 15,
    # help_needed (student) vs resolution_type (peer)
    "help_needed": 10,
}


def _score_challenge(student_parsed: dict, peer_challenge_parsed: dict) -> int:
    """Compute Layer 1 field-match score for one peer past_challenge."""
    score = 0
    sp = {k: v.lower() for k, v in student_parsed.items()}
    pp = {k: v.lower() for k, v in peer_challenge_parsed.items()}

    if sp.get("context") == pp.get("context"):
        score += _WEIGHTS["context"]
    if sp.get("struggle_type") == pp.get("struggle_type"):
        score += _WEIGHTS["struggle_type"]
    if sp.get("emotional_signal") == pp.get("emotional_signal"):
        score += _WEIGHTS["emotional_signal"]
    # student field is "help_needed"; peer field is "resolution_type"
    if sp.get("help_needed") == pp.get("resolution_type"):
        score += _WEIGHTS["help_needed"]

    return score


def _llm_adjustment(student_parsed: dict, best_challenge: dict, field_score: int) -> tuple[int, str]:
    """Call Claude API for semantic adjustment. Returns (adjustment, reason)."""
    try:
        with open(_PROMPT_PATH, "r", encoding="utf-8") as f:
            template = f.read()

        prompt = template.format(
            student_parsed=json.dumps(student_parsed),
            peer_parsed=json.dumps(best_challenge["parsed"]),
            peer_raw=best_challenge["raw"],
            field_match_score=field_score,
        )

        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        response = client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o"),
            max_tokens=256,
            temperature=0,
            messages=[{"role": "user", "content": prompt}],
        )
        raw_text = response.choices[0].message.content.strip()

        result = json.loads(raw_text)
        adjustment = int(result["adjustment"])
        reason = str(result["reason"])
        return adjustment, reason

    except Exception as e:
        print(f"[scorer] LLM adjustment failed: {e}")
        return 0, ""


def score_peer(student_parsed: dict, peer: dict) -> dict:
    """Score a single peer against a student's parsed challenge profile.

    Returns a dict with peer_id, field_score, llm_adjustment, final_score, reason.
    """
    challenges = peer.get("past_challenges", [])

    # Layer 1: pick the best-matching past_challenge
    best_score = 0
    best_challenge = None
    for challenge in challenges:
        s = _score_challenge(student_parsed, challenge.get("parsed", {}))
        if s > best_score or best_challenge is None:
            best_score = s
            best_challenge = challenge

    field_score = best_score

    # Layer 2: semantic adjustment via Claude
    if best_challenge is not None:
        adjustment, reason = _llm_adjustment(student_parsed, best_challenge, field_score)
    else:
        adjustment, reason = 0, ""

    final_score = max(0, min(110, field_score + adjustment))

    return {
        "peer_id": peer["id"],
        "field_score": field_score,
        "llm_adjustment": adjustment,
        "final_score": final_score,
        "reason": reason,
    }


if __name__ == "__main__":
    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    from services.data_loader import load_peer

    peer = load_peer("peer_001")

    student_parsed = {
        "context": "transfer adjustment",
        "struggle_type": "social isolation",
        "emotional_signal": "lonely",
        "help_needed": "peer experience",
    }

    result = score_peer(student_parsed, peer)
    print(json.dumps(result, indent=2))
