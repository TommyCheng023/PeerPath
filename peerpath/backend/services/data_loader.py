import json
import os

_DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")

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
                cur.execute("SELECT id, tags FROM peers ORDER BY id")
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
                if row is None:
                    raise FileNotFoundError(f"Peer '{peer_id}' not found in PostgreSQL.")
                return row["profile"]

    peer_path = os.path.join(_DATA_DIR, "peers", f"{peer_id}.json")
    if not os.path.exists(peer_path):
        raise FileNotFoundError(
            f"Peer '{peer_id}' not found. Expected file: {peer_path}"
        )
    with open(peer_path, "r", encoding="utf-8") as f:
        return json.load(f)
