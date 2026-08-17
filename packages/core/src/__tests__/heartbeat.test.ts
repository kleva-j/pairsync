import { describe, expect, it } from "vitest";

import {
  HEARTBEAT_INTERVAL,
  HEARTBEAT_TIMEOUT,
  MISSED_HEARTBEATS_LIMIT,
} from "../constants";
import { MESSAGE_TYPES } from "../protocol";
import type { HeartbeatPayload } from "../types";
import {
  HeartbeatParseError,
  HeartbeatTracker,
  buildHeartbeat,
  isHeartbeatStale,
  missedHeartbeats,
  parseHeartbeat,
} from "../network";

const payload: HeartbeatPayload = {
  device_id: "6f2f6c1e-7b3a-4d5e-9f10-111213141516",
  alias: "michael-macbook",
  platform: "macos",
  interfaces: [
    {
      type: "Wi-Fi",
      ipv4: ["192.168.1.10"],
      ipv6: ["fe80::1"],
      preferred: true,
    },
  ],
  port: 53_350,
  cert_fingerprint: "aa:bb:cc:dd:ee:ff:00:11:22:33:44:55:66:77:88:99:aa:bb:cc:dd:ee:ff:00:11:22:33:44:55:66:77:88:99",
};

describe("buildHeartbeat", () => {
  it("generates a JSON payload with the heartbeat discriminator and all fields", () => {
    const wire = buildHeartbeat(payload);
    const parsed = JSON.parse(wire) as Record<string, unknown>;

    expect(parsed.type).toBe(MESSAGE_TYPES.HEARTBEAT);
    expect(parsed.device_id).toBe(payload.device_id);
    expect(parsed.alias).toBe(payload.alias);
    expect(parsed.platform).toBe(payload.platform);
    expect(parsed.interfaces).toEqual(payload.interfaces);
    expect(parsed.port).toBe(payload.port);
    expect(parsed.cert_fingerprint).toBe(payload.cert_fingerprint);
  });

  it("omits cert_fingerprint when the sender has none", () => {
    const { cert_fingerprint: _omit, ...withoutCert } = payload;
    const parsed = JSON.parse(buildHeartbeat(withoutCert)) as Record<string, unknown>;
    expect(parsed.cert_fingerprint).toBeUndefined();
  });

  it("round-trips through parseHeartbeat", () => {
    expect(parseHeartbeat(buildHeartbeat(payload))).toEqual({
      type: MESSAGE_TYPES.HEARTBEAT,
      ...payload,
    });
  });

  it("never lets a rogue payload type override the heartbeat discriminator", () => {
    const rogue = { ...payload, type: "prepare" } as HeartbeatPayload & { type: string };
    const wire = JSON.parse(buildHeartbeat(rogue)) as { type: string };
    expect(wire.type).toBe(MESSAGE_TYPES.HEARTBEAT);
  });
});

describe("parseHeartbeat", () => {
  it("parses a valid payload", () => {
    const result = parseHeartbeat(buildHeartbeat(payload));
    expect(result.device_id).toBe(payload.device_id);
    expect(result.platform).toBe("macos");
    expect(result.interfaces[0]?.preferred).toBe(true);
  });

  it("parses a payload without cert_fingerprint", () => {
    const { cert_fingerprint: _omit, ...withoutCert } = payload;
    const result = parseHeartbeat(buildHeartbeat(withoutCert));
    expect(result.cert_fingerprint).toBeUndefined();
  });

  it("rejects non-JSON input", () => {
    expect(() => parseHeartbeat("not-json")).toThrow(HeartbeatParseError);
  });

  it("rejects a payload with the wrong message type", () => {
    const wire = buildHeartbeat(payload).replace(`"${MESSAGE_TYPES.HEARTBEAT}"`, '"prepare"');
    expect(() => parseHeartbeat(wire)).toThrow(/type/);
  });

  it("rejects a payload with a missing or empty device_id", () => {
    const missing = { ...payload } as Partial<HeartbeatPayload>;
    delete missing.device_id;
    expect(() => parseHeartbeat(JSON.stringify(missing))).toThrow(/device_id/);
    expect(() =>
      parseHeartbeat(JSON.stringify({ ...payload, device_id: "" })),
    ).toThrow(/device_id/);
  });

  it("rejects an unsupported platform", () => {
    expect(() =>
      parseHeartbeat(JSON.stringify({ ...payload, platform: "beos" })),
    ).toThrow(/platform/);
  });

  it("rejects malformed interfaces", () => {
    expect(() =>
      parseHeartbeat(
        JSON.stringify({
          ...payload,
          interfaces: [{ type: "Bluetooth", ipv4: [], ipv6: [], preferred: true }],
        }),
      ),
    ).toThrow(/interfaces/);

    expect(() =>
      parseHeartbeat(
        JSON.stringify({
          ...payload,
          interfaces: [{ type: "Wi-Fi", ipv4: "192.168.1.10", ipv6: [], preferred: true }],
        }),
      ),
    ).toThrow(/interfaces/);
  });

  it("rejects out-of-range or non-integer ports", () => {
    expect(() =>
      parseHeartbeat(JSON.stringify({ ...payload, port: 0 })),
    ).toThrow(/port/);
    expect(() =>
      parseHeartbeat(JSON.stringify({ ...payload, port: 70_000 })),
    ).toThrow(/port/);
    expect(() =>
      parseHeartbeat(JSON.stringify({ ...payload, port: 53_350.5 })),
    ).toThrow(/port/);
  });
});

describe("missedHeartbeats / isHeartbeatStale", () => {
  const t0 = 1_000_000;

  it("counts zero missed heartbeats at the interval boundary exclusive", () => {
    expect(missedHeartbeats(t0, t0)).toBe(0);
    expect(missedHeartbeats(t0, t0 + HEARTBEAT_INTERVAL - 1)).toBe(0);
    expect(isHeartbeatStale(t0, t0 + HEARTBEAT_INTERVAL - 1)).toBe(false);
  });

  it("counts one missed heartbeat exactly at the interval", () => {
    expect(missedHeartbeats(t0, t0 + HEARTBEAT_INTERVAL)).toBe(1);
  });

  it("is stale only at or beyond HEARTBEAT_TIMEOUT", () => {
    expect(missedHeartbeats(t0, t0 + HEARTBEAT_TIMEOUT - 1)).toBe(MISSED_HEARTBEATS_LIMIT - 1);
    expect(isHeartbeatStale(t0, t0 + HEARTBEAT_TIMEOUT - 1)).toBe(false);

    expect(missedHeartbeats(t0, t0 + HEARTBEAT_TIMEOUT)).toBe(MISSED_HEARTBEATS_LIMIT);
    expect(isHeartbeatStale(t0, t0 + HEARTBEAT_TIMEOUT)).toBe(true);
  });

  it("honors custom interval and timeout", () => {
    expect(missedHeartbeats(t0, t0 + 30_000, 10_000)).toBe(3);
    expect(isHeartbeatStale(t0, t0 + 9_999, 10_000)).toBe(false);
    expect(isHeartbeatStale(t0, t0 + 10_000, 10_000)).toBe(true);
  });

  it("rejects non-positive or non-finite interval and timeout", () => {
    expect(() => missedHeartbeats(t0, t0 + 10_000, 0)).toThrow(RangeError);
    expect(() => missedHeartbeats(t0, t0 + 10_000, -5_000)).toThrow(RangeError);
    expect(() => isHeartbeatStale(t0, t0 + 10_000, 0)).toThrow(RangeError);
    expect(() => isHeartbeatStale(t0, t0 + 10_000, Number.NaN)).toThrow(RangeError);
  });

  it("rejects non-positive timeout and interval in the tracker constructor", () => {
    expect(() => new HeartbeatTracker({ timeout: 0 })).toThrow(RangeError);
    expect(() => new HeartbeatTracker({ interval: -1 })).toThrow(RangeError);
    expect(() => new HeartbeatTracker({ timeout: Number.POSITIVE_INFINITY })).toThrow(RangeError);
  });

  it("derives the 5-missed-heartbeats = 25s invariant from constants", () => {
    expect(MISSED_HEARTBEATS_LIMIT).toBe(5);
    expect(HEARTBEAT_TIMEOUT).toBe(HEARTBEAT_INTERVAL * MISSED_HEARTBEATS_LIMIT);
    expect(HEARTBEAT_TIMEOUT).toBe(25_000);
  });
});

describe("HeartbeatTracker", () => {
  it("records last-seen times and tracks expiry without platform timers", () => {
    let now = 1_000_000;
    const tracker = new HeartbeatTracker({ now: () => now });

    tracker.record("device-a");
    tracker.record("device-b");
    expect(tracker.size).toBe(2);
    expect(tracker.lastSeen("device-a")).toBe(1_000_000);

    now += HEARTBEAT_TIMEOUT - 1;
    expect(tracker.isExpired("device-a")).toBe(false);
    expect(tracker.expired()).toEqual([]);

    now += 1;
    expect(tracker.isExpired("device-a")).toBe(true);
    expect(tracker.isExpired("device-b")).toBe(true);
    expect(tracker.expired().sort()).toEqual(["device-a", "device-b"]);
  });

  it("reports missed heartbeat counts per device", () => {
    let now = 1_000_000;
    const tracker = new HeartbeatTracker({ now: () => now });
    tracker.record("device-a");

    now += HEARTBEAT_INTERVAL * 2;
    expect(tracker.missed("device-a")).toBe(2);
    expect(tracker.missed("unknown-device")).toBeUndefined();
  });

  it("a fresh heartbeat resets the expiry clock", () => {
    let now = 1_000_000;
    const tracker = new HeartbeatTracker({ now: () => now });
    tracker.record("device-a");

    now += HEARTBEAT_TIMEOUT - 1;
    tracker.record("device-a"); // heartbeat arrives just before expiry
    expect(tracker.isExpired("device-a")).toBe(false);

    now += HEARTBEAT_TIMEOUT;
    expect(tracker.isExpired("device-a")).toBe(true);
  });

  it("ignores unknown devices and supports clearing", () => {
    let now = 1_000_000;
    const tracker = new HeartbeatTracker({ now: () => now });
    expect(tracker.isExpired("ghost")).toBe(false);
    expect(tracker.missed("ghost")).toBeUndefined();
    expect(tracker.expired()).toEqual([]);

    tracker.record("device-a");
    tracker.clear("device-a");
    expect(tracker.size).toBe(0);

    tracker.record("device-a");
    tracker.record("device-b");
    tracker.clearAll();
    expect(tracker.size).toBe(0);
  });

  it("honors custom timeout and interval", () => {
    let now = 1_000_000;
    const tracker = new HeartbeatTracker({ now: () => now, timeout: 10_000, interval: 2_000 });
    tracker.record("device-a");

    now += 9_999;
    expect(tracker.isExpired("device-a")).toBe(false);

    now += 1;
    expect(tracker.isExpired("device-a")).toBe(true);
    expect(tracker.missed("device-a")).toBe(5);
  });
});
