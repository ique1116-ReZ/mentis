import { describe, expect, it } from "vitest";
import { validateStoredSession, type AuthSession } from "./authSession";

const storedSession: AuthSession = {
  token: "demo_user_rez_expired",
  user: {
    id: "user_rez",
    role: "user",
    displayName: "ReZ",
  },
  memory: {
    userId: "user_rez",
    cases: [],
    trainingPlans: [],
    notes: [],
    updatedAt: "2026-07-03T00:00:00.000Z",
  },
};

describe("validateStoredSession", () => {
  it("rejects a cached session when the server no longer recognizes its token", async () => {
    const result = await validateStoredSession(storedSession, {
      apiBase: "https://api.example.test",
      fetcher: async () => new Response(JSON.stringify({ message: "Invalid or expired demo session" }), { status: 502 }),
    });

    expect(result).toBeNull();
  });

  it("keeps a cached session when the token is still accepted by the server", async () => {
    const result = await validateStoredSession(storedSession, {
      apiBase: "https://api.example.test",
      fetcher: async () => new Response(JSON.stringify([]), { status: 200 }),
    });

    expect(result).toBe(storedSession);
  });
});
