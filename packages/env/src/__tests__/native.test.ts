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
});

describe("native env schema", () => {
  it("parses a valid EXPO_PUBLIC_SERVER_URL", async () => {
    const env: typeof Env = await loadEnv();
    expect(env.EXPO_PUBLIC_SERVER_URL).toBe("https://pairsync.example.com");
  });

  it("rejects a missing EXPO_PUBLIC_SERVER_URL", async () => {
    delete process.env.EXPO_PUBLIC_SERVER_URL;
    await expect(loadEnv()).rejects.toThrow();
  });

  it("treats an empty value as missing", async () => {
    process.env.EXPO_PUBLIC_SERVER_URL = "";
    await expect(loadEnv()).rejects.toThrow();
  });
});
