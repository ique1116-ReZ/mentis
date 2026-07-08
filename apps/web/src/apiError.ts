type ApiErrorPayload = {
  message?: unknown;
};

export async function readApiErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as ApiErrorPayload;
    if (typeof payload.message === "string" && payload.message.trim()) {
      return payload.message;
    }
  } catch {
    // Fall back to the caller-provided message when the body is not JSON.
  }

  return fallback;
}
