import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../workers/topic-images/src/index";

const userId = "11111111-1111-4111-8111-111111111111";
const resourceId = "22222222-2222-4222-8222-222222222222";
function environment() {
  return {
    SUPABASE_URL: "https://database.invalid",
    SUPABASE_PUBLISHABLE_KEY: "test",
    ALLOWED_ORIGINS: "https://app.invalid",
    AUTH_RATE_LIMITER: { limit: vi.fn().mockResolvedValue({ success: true }) },
    WRITE_RATE_LIMITER: { limit: vi.fn().mockResolvedValue({ success: true }) },
  } as unknown as Parameters<typeof worker.fetch>[1];
}
function request(path: string, method = "GET") {
  return new Request(`https://images.invalid${path}`, {
    method,
    headers: {
      Authorization: "Bearer test",
      Origin: "https://app.invalid",
    },
  });
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("image API failure responses", () => {
  it.each([
    [`/topics/${resourceId}/images`, "GET"],
    [`/topics/${resourceId}/images`, "POST"],
    [`/images/${resourceId}`, "GET"],
    [`/images/${resourceId}`, "DELETE"],
    [`/images?moduleId=${resourceId}`, "GET"],
    [`/trash/${resourceId}`, "DELETE"],
  ])("handles downstream network failure: %s %s", async (path, method) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/auth/v1/user")) return Response.json({ id: userId });
        throw new Error("offline");
      }),
    );
    const response = await worker.fetch(request(path, method), environment());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Operation failed" });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://app.invalid",
    );
    expect(console.error).toHaveBeenCalledOnce();
  });
  it("handles authentication service outages", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const response = await worker.fetch(
      request(`/images/${resourceId}`),
      environment(),
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Operation failed" });
  });
  it("handles rate limiter outages", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const env = environment();
    vi.mocked(env.AUTH_RATE_LIMITER.limit).mockRejectedValue(
      new Error("offline"),
    );
    const response = await worker.fetch(request(`/images/${resourceId}`), env);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Operation failed" });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://app.invalid",
    );
  });
  it("preserves the unauthorized response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );
    const response = await worker.fetch(
      request(`/images/${resourceId}`),
      environment(),
    );
    expect(response.status).toBe(401);
  });
});
