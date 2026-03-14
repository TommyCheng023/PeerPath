import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import APIRouter
from services.history_store import get_history

router = APIRouter()


@router.get("/history/{user_id}")
def fetch_history(user_id: str):
    """Return all saved match results for a given user (newest first)."""
    entries = get_history(user_id.strip().lower())
    return {"user_id": user_id, "entries": entries}
