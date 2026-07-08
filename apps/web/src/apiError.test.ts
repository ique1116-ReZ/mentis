import { describe, expect, it } from "vitest";
import { readApiErrorMessage } from "./apiError";

describe("readApiErrorMessage", () => {
  it("returns the server-provided message when the body is JSON", async () => {
    const response = new Response(JSON.stringify({ message: "Invalid invite code" }), { status: 400 });

    await expect(readApiErrorMessage(response, "fallback")).resolves.toBe("Invalid invite code");
  });

  it("falls back when the response body is not JSON", async () => {
    const response = new Response("bad gateway", { status: 502 });

    await expect(readApiErrorMessage(response, "fallback")).resolves.toBe("fallback");
  });
});
