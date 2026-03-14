import type { HistoryResponse } from "../types";

export async function fetchHistory(userId: string): Promise<HistoryResponse> {
  const response = await fetch(`http://localhost:8000/api/history/${userId}`);

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

  return (await response.json()) as HistoryResponse;
}
