import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { env as Env } from "../native";

async function loadEnv() {
  vi.resetModules();
  const mod = await import("../native");
  return mod.env;
}

beforeEach(() => {
  process.env.EXPO_PUBLIC_SERVER_URL = "https://pairsync.example.com";
});

afterEach(() => {
  delete process.env.EXPO_PUBLIC_SERVER_URL;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("native env schema", () => {
  it("parses a valid EXPO_PUBLIC_SERVER_URL", async () => {
    const env: typeof Env = await loadEnv();
    expect(env.EXPO_PUBLIC_SERVER_URL).toBe("https://pairsync.example.com");
  });

  it("rejects a missing EXPO_PUBLIC_SERVER_URL", async () => {
    // The rejection is expected — silence env-core's error log so the
    // suite output isn't mistaken for a failure.
    vi.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.EXPO_PUBLIC_SERVER_URL;
    await expect(loadEnv()).rejects.toThrow();
  });

  it("treats an empty value as missing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.EXPO_PUBLIC_SERVER_URL = "";
    await expect(loadEnv()).rejects.toThrow();
  });
});
