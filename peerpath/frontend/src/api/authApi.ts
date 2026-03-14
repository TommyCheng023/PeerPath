import type { AuthResponse, AuthUser } from "../types";

const API_BASE = "http://localhost:8000/api/auth";
const TOKEN_KEY = "peerpath_auth_token";

function getStoredToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

function storeToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken() {
  window.localStorage.removeItem(TOKEN_KEY);
}

async function handleAuthResponse(response: Response): Promise<AuthResponse> {
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

  const data = (await response.json()) as AuthResponse;
  storeToken(data.access_token);
  return data;
}

export async function registerUser(payload: {
  email: string;
  full_name: string;
  password: string;
}) {
  const response = await fetch(`${API_BASE}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleAuthResponse(response);
}

export async function loginUser(payload: { email: string; password: string }) {
  const response = await fetch(`${API_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleAuthResponse(response);
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const token = getStoredToken();
  if (!token) {
    return null;
  }

  const response = await fetch(`${API_BASE}/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401) {
    clearStoredToken();
    return null;
  }

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return (await response.json()) as AuthUser;
}

export async function logoutUser() {
  const token = getStoredToken();
  if (token) {
    await fetch(`${API_BASE}/logout`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }).catch(() => {
      // Ignore network failures during client-side logout.
    });
  }
  clearStoredToken();
}
