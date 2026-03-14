import type { ChatThread, ThreadsResponse } from "../types";

const API_BASE = "http://localhost:8000/api/chat";
const TOKEN_KEY = "peerpath_auth_token";

function getStoredToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

function authHeaders() {
  const token = getStoredToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) message = body.detail;
    } catch {
      // keep default
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export async function fetchThreads(): Promise<ThreadsResponse> {
  const response = await fetch(`${API_BASE}/threads`, {
    headers: authHeaders(),
  });
  return handleResponse<ThreadsResponse>(response);
}

export async function createOrGetThread(params: {
  peer_id: string;
  peer_name: string;
  peer_major: string;
  peer_year: string;
  match_score: number;
  match_reason: string;
  initial_message?: string;
  is_opener?: boolean;
}): Promise<{ thread: ChatThread }> {
  const response = await fetch(`${API_BASE}/threads`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(params),
  });
  return handleResponse<{ thread: ChatThread }>(response);
}

export async function fetchThread(threadId: string): Promise<{ thread: ChatThread }> {
  const response = await fetch(`${API_BASE}/threads/${threadId}`, {
    headers: authHeaders(),
  });
  return handleResponse<{ thread: ChatThread }>(response);
}

export async function sendMessage(
  threadId: string,
  content: string,
  isOpener = false,
): Promise<void> {
  const response = await fetch(`${API_BASE}/threads/${threadId}/messages`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ content, is_opener: isOpener }),
  });
  await handleResponse<unknown>(response);
}

export async function markRead(threadId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/threads/${threadId}/read`, {
    method: "PATCH",
    headers: authHeaders(),
  });
  await handleResponse<unknown>(response);
}

export async function fetchUnreadCount(): Promise<number> {
  const response = await fetch(`${API_BASE}/unread-count`, {
    headers: authHeaders(),
  });
  const data = await handleResponse<{ unread_count: number }>(response);
  return data.unread_count;
}
