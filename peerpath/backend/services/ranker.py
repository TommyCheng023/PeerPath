import json
import os

from openai import OpenAI
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

try:
    from services.tag_filter import filter_by_tags
    from services.llm_parser import parse_challenge
    from services.scorer import score_peer
    from services.data_loader import load_peer
except ModuleNotFoundError:
    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    from services.tag_filter import filter_by_tags
    from services.llm_parser import parse_challenge
    from services.scorer import score_peer
    from services.data_loader import load_peer

_PROMPT_PATH = os.path.join(os.path.dirname(__file__), "..", "prompts", "conversation_starter.txt")


def _generate_conversation_starter(user_description: str, peer_raw: str, reason: str) -> str:
    """Call Azure API to generate a conversation starter message."""
    try:
        with open(_PROMPT_PATH, "r", encoding="utf-8") as f:
            template = f.read()

        prompt = template.format(
            user_description=user_description,
            peer_raw=peer_raw,
            reason=reason,
        )

        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        response = client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o"),
            max_tokens=256,
            temperature=0,
            messages=[{"role": "user", "content": prompt}],
        )
        raw_text = response.choices[0].message.content.strip()

        return raw_text

    except Exception as e:
        print(f"[ranker] conversation_starter generation failed: {e}")
        return ""


def _best_peer_raw(peer: dict) -> str:
    """Return the raw text of the first past_challenge, or empty string if none."""
    challenges = peer.get("past_challenges", [])
    if challenges:
        return challenges[0].get("raw", "")
    return ""


def rank_peers(student_tags: list[str], student_description: str) -> list[dict]:
    """Run the full matching pipeline and return the top 3 ranked peers.

    Steps:
      A — Tag filter to get candidates
      B — LLM parse of student description
      C — Score each candidate peer
      D — Compute final_score with tag bonus
      E — Sort and take top 3
      F — Generate conversation starters for top 3

    Returns a list of up to 3 dicts with rank, peer, scores, reason, and
    conversation_starter.
    """
    # Step A — Tag Filter
    candidates = filter_by_tags(student_tags)
    if not candidates:
        return []

    # Step B — LLM Parse
    student_parsed = parse_challenge(student_description)

    # Step C & D — Score each candidate and compute combined score
    scored = []
    for candidate in candidates:
        peer_id = candidate["id"]
        overlap_count = candidate["overlap_count"]

        peer = load_peer(peer_id)
        score_result = score_peer(student_parsed, peer)

        # tag_bonus: guard against empty student_tags (already filtered above, but defensive)
        if student_tags:
            tag_bonus = (overlap_count / len(student_tags)) * 10
        else:
            tag_bonus = 0

        combined_score = round(score_result["final_score"] + tag_bonus, 2)

        scored.append({
            "peer": peer,
            "tag_overlap": overlap_count,
            "field_score": score_result["field_score"],
            "llm_adjustment": score_result["llm_adjustment"],
            "combined_score": combined_score,
            "reason": score_result["reason"],
        })

    # Step E — Sort descending, take top 3
    scored.sort(key=lambda x: x["combined_score"], reverse=True)
    top3 = scored[:3]

    # Step F — Generate conversation starters
    results = []
    for rank_idx, item in enumerate(top3, start=1):
        peer_raw = _best_peer_raw(item["peer"])
        starter = _generate_conversation_starter(
            user_description=student_description,
            peer_raw=peer_raw,
            reason=item["reason"],
        )

        results.append({
            "rank": rank_idx,
            "peer": item["peer"],
            "tag_overlap": item["tag_overlap"],
            "field_score": item["field_score"],
            "llm_adjustment": item["llm_adjustment"],
            "final_score": item["combined_score"],
            "reason": item["reason"],
            "conversation_starter": starter,
        })

    return results


if __name__ == "__main__":
    student_tags = ["transfer student", "making friends"]
    student_description = "I just transferred here and I'm struggling to meet people. I feel pretty isolated."

    print(f"Tags: {student_tags}")
    print(f"Description: {student_description!r}\n")

    results = rank_peers(student_tags, student_description)

    for match in results:
        print(f"--- Rank {match['rank']} ---")
        print(f"Peer: {match['peer']['name']} ({match['peer']['id']})")
        print(f"Tag overlap: {match['tag_overlap']}")
        print(f"Field score: {match['field_score']}, LLM adj: {match['llm_adjustment']}, Final: {match['final_score']}")
        print(f"Reason: {match['reason']}")
        print(f"Starter: {match['conversation_starter']}")
        print()
