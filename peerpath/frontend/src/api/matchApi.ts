import type { ApiMatchResponse, MatchRequest } from "../types";

const API_URL = "http://localhost:8000/api/match";

export async function fetchMatches(
  payload: MatchRequest
): Promise<ApiMatchResponse> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) {
        message = body.detail;
      }
    } catch {
      // Keep the default status message.
    }
    throw new Error(message);
  }

  return (await response.json()) as ApiMatchResponse;
}
