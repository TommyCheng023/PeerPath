import type { AgentChatResponse } from "../types";

const API_BASE = "http://localhost:8000/api/agent";
const TOKEN_KEY = "peerpath_auth_token";

function getAuthHeaders() {
  const token = window.localStorage.getItem(TOKEN_KEY);
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function handleResponse(response: Response): Promise<AgentChatResponse> {
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) message = body.detail;
    } catch { /* keep default */ }
    throw new Error(message);
  }
  return response.json() as Promise<AgentChatResponse>;
}

export async function startAgentSession(): Promise<AgentChatResponse> {
  const response = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({}),
  });
  return handleResponse(response);
}

export async function sendAgentMessage(
  sessionId: string,
  message: string
): Promise<AgentChatResponse> {
  const response = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ session_id: sessionId, message }),
  });
  return handleResponse(response);
}
