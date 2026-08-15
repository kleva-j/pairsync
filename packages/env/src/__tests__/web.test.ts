import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { env as Env } from "../web";

async function loadEnv() {
  vi.resetModules();
  const mod = await import("../web");
  return mod.env;
}

beforeEach(() => {
  vi.stubEnv("VITE_SERVER_URL", "https://pairsync.example.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("web env schema", () => {
  it("parses a valid VITE_SERVER_URL", async () => {
    const env: typeof Env = await loadEnv();
    expect(env.VITE_SERVER_URL).toBe("https://pairsync.example.com");
  });

  it("rejects a missing VITE_SERVER_URL", async () => {
    // The rejection is expected — silence env-core's error log so the
    // suite output isn't mistaken for a failure.
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.unstubAllEnvs();
    await expect(loadEnv()).rejects.toThrow();
  });

  it("rejects a non-URL value", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("VITE_SERVER_URL", "not-a-url");
    await expect(loadEnv()).rejects.toThrow();
  });
});
