from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from services.auth import get_current_user
from services import chat_service

router = APIRouter()


class CreateThreadRequest(BaseModel):
    peer_id: str
    peer_name: str
    peer_major: str = ""
    peer_year: str = ""
    match_score: float = 0.0
    match_reason: str = ""
    initial_message: str = ""
    is_opener: bool = False


class SendMessageRequest(BaseModel):
    content: str
    is_opener: bool = False


@router.get("/chat/threads")
def list_threads(current_user: dict = Depends(get_current_user)):
    threads = chat_service.get_threads(current_user["id"])
    return {"threads": threads}


@router.post("/chat/threads", status_code=status.HTTP_201_CREATED)
def create_or_get_thread(
    body: CreateThreadRequest,
    current_user: dict = Depends(get_current_user),
):
    thread = chat_service.get_or_create_thread(
        user_id=current_user["id"],
        peer_id=body.peer_id,
        peer_name=body.peer_name,
        peer_major=body.peer_major,
        peer_year=body.peer_year,
        match_score=body.match_score,
        match_reason=body.match_reason,
    )

    if body.initial_message.strip() and not thread["messages"]:
        chat_service.add_message(
            user_id=current_user["id"],
            thread_id=thread["thread_id"],
            sender_id=current_user["id"],
            content=body.initial_message,
            is_opener=body.is_opener,
        )
        thread = chat_service.get_thread(current_user["id"], thread["thread_id"])

    return {"thread": thread}


@router.get("/chat/threads/{thread_id}")
def get_thread(thread_id: str, current_user: dict = Depends(get_current_user)):
    thread = chat_service.get_thread(current_user["id"], thread_id)
    if thread is None:
        raise HTTPException(status_code=404, detail="Thread not found.")
    return {"thread": thread}


@router.post("/chat/threads/{thread_id}/messages", status_code=status.HTTP_201_CREATED)
def send_message(
    thread_id: str,
    body: SendMessageRequest,
    current_user: dict = Depends(get_current_user),
):
    if not body.content.strip():
        raise HTTPException(status_code=400, detail="Message content cannot be empty.")

    message = chat_service.add_message(
        user_id=current_user["id"],
        thread_id=thread_id,
        sender_id=current_user["id"],
        content=body.content,
        is_opener=body.is_opener,
    )
    if message is None:
        raise HTTPException(status_code=404, detail="Thread not found.")
    return {"message": message}


@router.patch("/chat/threads/{thread_id}/read")
def mark_read(thread_id: str, current_user: dict = Depends(get_current_user)):
    ok = chat_service.mark_read(current_user["id"], thread_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Thread not found.")
    return {"ok": True}


@router.get("/chat/unread-count")
def unread_count(current_user: dict = Depends(get_current_user)):
    count = chat_service.get_unread_count(current_user["id"])
    return {"unread_count": count}
