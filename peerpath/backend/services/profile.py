import json

from fastapi import HTTPException, status

from services.auth import get_user_by_id
from services.db import get_connection
from services.llm_parser import parse_challenge


def build_profile_document(user: dict, profile_input: dict, parsed_challenge: dict) -> dict:
    challenge_raw = profile_input["past_challenge"].strip()
    profile = {
        "id": user["id"],
        "name": user["full_name"],
        "major": profile_input["major"].strip(),
        "year": profile_input["year"].strip(),
        "tags": profile_input["tags"],
        "past_challenges": [
            {
                "raw": challenge_raw,
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
        "contact_phone": profile_input["contact_phone"].strip(),
        "contact_email": profile_input["contact_email"].strip().lower(),
        "searchable": profile_input.get("searchable", True),
    }
    return profile


def upsert_profile(user_id: str, profile_input: dict) -> dict:
    user = get_user_by_id(user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    parsed_challenge = parse_challenge(profile_input["past_challenge"])
    profile = build_profile_document(user, profile_input, parsed_challenge)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO user_profiles (
                    user_id, name, major, year, tags, help_topics, comfort_level,
                    contact_phone, contact_email, past_challenges, searchable, profile, updated_at
                )
                VALUES (
                    %(user_id)s, %(name)s, %(major)s, %(year)s, %(tags)s, %(help_topics)s,
                    %(comfort_level)s, %(contact_phone)s, %(contact_email)s,
                    %(past_challenges)s::jsonb, %(searchable)s, %(profile)s::jsonb, NOW()
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


def get_profile(user_id: str) -> dict | None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT profile
                FROM user_profiles
                WHERE user_id = %s
                """,
                (user_id,),
            )
            row = cur.fetchone()
            return row["profile"] if row else None
