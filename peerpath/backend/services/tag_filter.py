try:
    from services.data_loader import load_index
    from services.db import get_connection, is_database_configured
except ModuleNotFoundError:
    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    from services.data_loader import load_index
    from services.db import get_connection, is_database_configured


def filter_by_tags(student_tags: list[str]) -> list[dict]:
    """Filter peers from index by tag overlap with student_tags.

    Returns a list of dicts sorted by overlap_count descending.
    Peers with zero overlap are excluded.
    Tag comparison is case-insensitive.
    """
    if not student_tags:
        return []

    if is_database_configured():
        normalized = [t.lower() for t in student_tags]
        query = """
            SELECT
                id,
                ARRAY(
                    SELECT tag
                    FROM unnest(tags) AS tag
                    WHERE lower(tag) = ANY(%s)
                ) AS overlap_tags
            FROM peers
            WHERE EXISTS (
                SELECT 1
                FROM unnest(tags) AS tag
                WHERE lower(tag) = ANY(%s)
            )
            UNION ALL
            SELECT
                user_id AS id,
                ARRAY(
                    SELECT tag
                    FROM unnest(tags) AS tag
                    WHERE lower(tag) = ANY(%s)
                ) AS overlap_tags
            FROM user_profiles
            WHERE searchable = TRUE
              AND EXISTS (
                  SELECT 1
                  FROM unnest(tags) AS tag
                  WHERE lower(tag) = ANY(%s)
              )
        """
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query, (normalized, normalized, normalized, normalized))
                rows = cur.fetchall()

        results = []
        for row in rows:
            overlap_tags = row["overlap_tags"] or []
            results.append({
                "id": row["id"],
                "overlap_count": len(overlap_tags),
                "overlap_tags": overlap_tags,
            })

        results.sort(key=lambda x: x["overlap_count"], reverse=True)
        return results

    normalized = {t.lower() for t in student_tags}
    index = load_index()

    results = []
    for entry in index:
        peer_tags = [t.lower() for t in entry["tags"]]
        matched = [t for t in peer_tags if t in normalized]
        if matched:
            results.append({
                "id": entry["id"],
                "overlap_count": len(matched),
                "overlap_tags": matched,
            })

    results.sort(key=lambda x: x["overlap_count"], reverse=True)
    return results


if __name__ == "__main__":
    import json

    cases = [
        ["transfer student", "making friends"],
        ["dating"],
        [],
    ]

    for tags in cases:
        print(f"\nInput: {tags}")
        result = filter_by_tags(tags)
        print(json.dumps(result, indent=2))
