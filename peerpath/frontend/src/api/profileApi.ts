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

function formatDetail(detail: unknown): string | null {
  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }

  if (Array.isArray(detail) && detail.length > 0) {
    const messages = detail
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const typedItem = item as { loc?: unknown[]; msg?: unknown };
        const message = typeof typedItem.msg === "string" ? typedItem.msg : null;
        const location = Array.isArray(typedItem.loc)
          ? typedItem.loc
              .filter((part) => typeof part === "string" || typeof part === "number")
              .join(".")
          : "";

        if (!message) return null;
        return location ? `${location}: ${message}` : message;
      })
      .filter((message): message is string => Boolean(message));

    if (messages.length > 0) {
      return messages.join("; ");
    }
  }

  if (detail && typeof detail === "object") {
    try {
      return JSON.stringify(detail);
    } catch {
      return null;
    }
  }

  return null;
}

async function handleResponse(response: Response) {
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = (await response.json()) as { detail?: unknown };
      const detailMessage = formatDetail(body.detail);
      if (detailMessage) {
        message = detailMessage;
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

export async function updateOnboarding(payload: {
  major: string;
  year: string;
  tags: string[];
  past_challenge: string;
  help_topics: string[];
  comfort_level: string;
}) {
  const response = await fetch(`${API_BASE}/onboarding`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
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
