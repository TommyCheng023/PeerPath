import json
import os

_DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")


def load_index() -> list:
    """Load and return the full peer index from data/index.json."""
    index_path = os.path.join(_DATA_DIR, "index.json")
    with open(index_path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_peer(peer_id: str) -> dict:
    """Load and return a full peer profile by peer_id.

    Raises FileNotFoundError if the peer does not exist.
    """
    peer_path = os.path.join(_DATA_DIR, "peers", f"{peer_id}.json")
    if not os.path.exists(peer_path):
        raise FileNotFoundError(
            f"Peer '{peer_id}' not found. Expected file: {peer_path}"
        )
    with open(peer_path, "r", encoding="utf-8") as f:
        return json.load(f)
