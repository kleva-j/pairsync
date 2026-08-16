import { describe, expect, it } from "vitest";
import {
  DESKTOP_BUFFER_LIMIT,
  TRANSFER_PORT_START,
  MOBILE_BUFFER_LIMIT,
  HEARTBEAT_INTERVAL,
  CONNECTION_TIMEOUT,
  TRANSFER_PORT_END,
  HEARTBEAT_TIMEOUT,
  TRANSFER_TIMEOUT,
  TRANSFER_PORTS,
  DISCOVERY_PORT,
  CHUNK_SIZE,
} from "../constants";

describe("ports", () => {
  it("uses 53350 for UDP discovery", () => {
    expect(DISCOVERY_PORT).toBe(53_350);
  });

  it("exposes the full 53351–53360 TCP range", () => {
    expect(TRANSFER_PORT_START).toBe(53_351);
    expect(TRANSFER_PORT_END).toBe(53_360);
    expect(TRANSFER_PORTS).toHaveLength(10);
    expect(TRANSFER_PORTS[0]).toBe(53_351);
    expect(TRANSFER_PORTS.at(-1)).toBe(53_360);
  });

  it("has no overlapping or duplicate ports", () => {
    const unique = new Set(TRANSFER_PORTS);
    expect(unique.size).toBe(TRANSFER_PORTS.length);
    expect(unique.has(DISCOVERY_PORT)).toBe(false);
  });
});

describe("timeouts", () => {
  it("heartbeats every 5s and drops devices after 5 missed", () => {
    expect(HEARTBEAT_INTERVAL).toBe(5_000);
    expect(HEARTBEAT_TIMEOUT).toBe(25_000);
  });

  it("bounds connection and overall transfer time", () => {
    expect(CONNECTION_TIMEOUT).toBe(10_000);
    expect(TRANSFER_TIMEOUT).toBe(300_000);
  });
});

describe("sizes", () => {
  it("uses 4MB chunks", () => {
    expect(CHUNK_SIZE).toBe(4 * 1024 * 1024);
  });

  it("caps mobile receive buffers at 50MB and desktop at 200MB", () => {
    expect(MOBILE_BUFFER_LIMIT).toBe(50 * 1024 * 1024);
    expect(DESKTOP_BUFFER_LIMIT).toBe(200 * 1024 * 1024);
    expect(DESKTOP_BUFFER_LIMIT).toBeGreaterThan(MOBILE_BUFFER_LIMIT);
  });
});
