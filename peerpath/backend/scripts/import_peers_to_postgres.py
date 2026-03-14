import json
import os

from services.db import init_peer_tables, get_connection


def load_peer_files() -> list[dict]:
    data_dir = os.path.join(os.path.dirname(__file__), "..", "data", "peers")
    peer_docs = []

    for filename in sorted(os.listdir(data_dir)):
        if not filename.endswith(".json"):
            continue
        path = os.path.join(data_dir, filename)
        with open(path, "r", encoding="utf-8") as f:
            peer_docs.append(json.load(f))

    return peer_docs


def main() -> None:
    init_peer_tables()
    peers = load_peer_files()

    with get_connection() as conn:
        with conn.cursor() as cur:
            for peer in peers:
                cur.execute(
                    """
                    INSERT INTO peers (
                        id, name, major, year, tags, help_topics,
                        comfort_level, past_challenges, profile
                    )
                    VALUES (
                        %(id)s, %(name)s, %(major)s, %(year)s, %(tags)s, %(help_topics)s,
                        %(comfort_level)s, %(past_challenges)s::jsonb, %(profile)s::jsonb
                    )
                    ON CONFLICT (id) DO UPDATE SET
                        name = EXCLUDED.name,
                        major = EXCLUDED.major,
                        year = EXCLUDED.year,
                        tags = EXCLUDED.tags,
                        help_topics = EXCLUDED.help_topics,
                        comfort_level = EXCLUDED.comfort_level,
                        past_challenges = EXCLUDED.past_challenges,
                        profile = EXCLUDED.profile;
                    """,
                    {
                        "id": peer["id"],
                        "name": peer["name"],
                        "major": peer["major"],
                        "year": peer["year"],
                        "tags": peer.get("tags", []),
                        "help_topics": peer.get("help_topics", []),
                        "comfort_level": peer.get("comfort_level", ""),
                        "past_challenges": json.dumps(peer.get("past_challenges", [])),
                        "profile": json.dumps(peer),
                    },
                )
        conn.commit()

    print(f"Imported {len(peers)} peers into PostgreSQL.")


if __name__ == "__main__":
    main()
