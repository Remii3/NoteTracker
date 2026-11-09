import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestHarness } from "wrangler";

const allowedOrigin = "https://app.sylabio.com";
const server = createTestHarness({
  root: import.meta.dirname,
  workers: [
    {
      configPath: new URL("../wrangler.jsonc", import.meta.url),
      vars: {
        ALLOWED_ORIGINS: allowedOrigin,
        MAX_TOPICS_PER_GENERATION: "5",
        OPENAI_MODEL: "gpt-4o-mini",
      },
      secrets: {
        OPENAI_API_KEY: "test-key",
        SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
        SUPABASE_URL: "https://example.supabase.co",
      },
    },
  ],
});

beforeAll(() => server.listen());
afterAll(() => server.close());

describe("question generator HTTP boundary", () => {
  it("accepts preflight requests from the application", async () => {
    const response = await server.fetch("/config", {
      method: "OPTIONS",
      headers: {
        Origin: allowedOrigin,
        "Access-Control-Request-Method": "GET",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      allowedOrigin,
    );
    expect(response.headers.get("Vary")).toBe("Origin");
  });

  it("rejects preflight requests from unknown origins", async () => {
    const response = await server.fetch("/config", {
      method: "OPTIONS",
      headers: { Origin: "https://example.invalid" },
    });

    expect(response.status).toBe(403);
    expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });

  it("requires authentication before returning configuration", async () => {
    const response = await server.fetch("/config", {
      headers: { Origin: allowedOrigin },
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      allowedOrigin,
    );
    await expect(response.json()).resolves.toEqual({
      error: "Sesja wygasła. Zaloguj się ponownie.",
    });
  });
});
