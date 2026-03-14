import type { UserProfile } from "../types";

const API_BASE = "http://localhost:8000/api/profile";
const TOKEN_KEY = "peerpath_auth_token";

function getStoredToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

function getAuthHeaders() {
  const token = getStoredToken();
  if (!token) {
    throw new Error("You need to sign in first.");
  }

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function handleResponse(response: Response) {
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) {
        message = body.detail;
      }
    } catch {
      // Keep default message.
    }
    throw new Error(message);
  }

  return (await response.json()) as { profile: UserProfile | null };
}

export async function fetchProfile() {
  const response = await fetch(`${API_BASE}/me`, {
    headers: {
      Authorization: `Bearer ${getStoredToken()}`,
    },
  });
  return handleResponse(response);
}

export async function updateProfile(payload: {
  major: string;
  year: string;
  tags: string[];
  help_topics: string[];
  comfort_level: string;
  contact_phone: string;
  contact_email: string;
  past_challenge: string;
  searchable: boolean;
}) {
  const response = await fetch(`${API_BASE}/me`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
}
