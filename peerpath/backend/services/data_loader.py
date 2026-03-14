import json
import os

_DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")


def _load_peer_from_file(peer_id: str) -> dict:
    peer_path = os.path.join(_DATA_DIR, "peers", f"{peer_id}.json")
    if not os.path.exists(peer_path):
        raise FileNotFoundError(
            f"Peer '{peer_id}' not found. Expected file: {peer_path}"
        )
    with open(peer_path, "r", encoding="utf-8") as f:
        return json.load(f)


def _merge_missing_contact_fields(peer_id: str, peer: dict) -> dict:
    if peer.get("contact_phone") and peer.get("contact_email"):
        return peer

    try:
        file_peer = _load_peer_from_file(peer_id)
    except FileNotFoundError:
        return peer

    merged = dict(peer)
    if not merged.get("contact_phone"):
        merged["contact_phone"] = file_peer.get("contact_phone", "")
    if not merged.get("contact_email"):
        merged["contact_email"] = file_peer.get("contact_email", "")
    return merged

try:
    from services.db import get_connection, is_database_configured
except ModuleNotFoundError:
    import sys

    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    from services.db import get_connection, is_database_configured


def load_index() -> list:
    """Load and return the full peer index from PostgreSQL or data/index.json."""
    if is_database_configured():
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, tags FROM peers
                    UNION ALL
                    SELECT user_id AS id, tags
                    FROM user_profiles
                    WHERE searchable = TRUE
                    ORDER BY id
                    """
                )
                return [{"id": row["id"], "tags": row["tags"]} for row in cur.fetchall()]

    index_path = os.path.join(_DATA_DIR, "index.json")
    with open(index_path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_peer(peer_id: str) -> dict:
    """Load and return a full peer profile by peer_id.

    Raises FileNotFoundError if the peer does not exist.
    """
    if is_database_configured():
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT profile FROM peers WHERE id = %s", (peer_id,))
                row = cur.fetchone()
                if row is not None:
                    return _merge_missing_contact_fields(peer_id, row["profile"])
                cur.execute(
                    "SELECT profile FROM user_profiles WHERE user_id = %s AND searchable = TRUE",
                    (peer_id,),
                )
                row = cur.fetchone()
                if row is None:
                    raise FileNotFoundError(f"Peer '{peer_id}' not found in PostgreSQL.")
                return row["profile"]

    return _load_peer_from_file(peer_id)
