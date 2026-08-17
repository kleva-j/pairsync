import { createActor } from "xstate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CONNECTION_TIMEOUT } from "../constants";
import type { Device } from "../types";
import { MAX_CONNECT_ATTEMPTS, deviceMachine } from "../state";

const device: Device = {
  device_id: "dev-1",
  alias: "alice-phone",
  platform: "ios",
  interfaces: [{ type: "Wi-Fi", ipv4: ["192.168.1.10"], ipv6: [], preferred: true }],
  port: 53_351,
};

describe("device machine", () => {
  it("walks the full lifecycle: idle → scanning → discovered → connecting → connected → idle", () => {
    const actor = createActor(deviceMachine).start();
    expect(actor.getSnapshot().value).toBe("idle");

    actor.send({ type: "START_SCAN" });
    expect(actor.getSnapshot().value).toBe("scanning");

    actor.send({ type: "DEVICE_DISCOVERED", device });
    expect(actor.getSnapshot().value).toBe("discovered");
    expect(actor.getSnapshot().context.device?.device_id).toBe("dev-1");

    actor.send({ type: "CONNECT", device });
    expect(actor.getSnapshot().value).toBe("connecting");

    actor.send({ type: "CONNECTED" });
    expect(actor.getSnapshot().value).toBe("connected");

    actor.send({ type: "DISCONNECT" });
    expect(actor.getSnapshot().value).toBe("idle");
    expect(actor.getSnapshot().context.device).toBeNull();
  });

  it("refuses to connect to a device with no reachable interface", () => {
    const actor = createActor(deviceMachine).start();
    actor.send({ type: "START_SCAN" });
    actor.send({
      type: "DEVICE_DISCOVERED",
      device: { ...device, interfaces: [] },
    });
    actor.send({ type: "CONNECT", device: { ...device, interfaces: [] } });
    expect(actor.getSnapshot().value).toBe("discovered");
  });

  it("refuses to connect when the only interface is preferred but addressless", () => {
    const actor = createActor(deviceMachine).start();
    actor.send({ type: "START_SCAN" });
    actor.send({
      type: "DEVICE_DISCOVERED",
      device: {
        ...device,
        interfaces: [{ type: "Wi-Fi", ipv4: [], ipv6: [], preferred: true }],
      },
    });
    actor.send({
      type: "CONNECT",
      device: {
        ...device,
        interfaces: [{ type: "Wi-Fi", ipv4: [], ipv6: [], preferred: true }],
      },
    });
    expect(actor.getSnapshot().value).toBe("discovered");
  });

  it("goes to error on CONNECT_FAILED and can retry up to MAX_CONNECT_ATTEMPTS", () => {
    const actor = createActor(deviceMachine).start();
    actor.send({ type: "START_SCAN" });
    actor.send({ type: "DEVICE_DISCOVERED", device });
    actor.send({ type: "CONNECT", device });

    actor.send({ type: "CONNECT_FAILED", reason: "tcp refused" });
    expect(actor.getSnapshot().value).toBe("error");
    expect(actor.getSnapshot().context.lastError).toBe("tcp refused");

    // The initial CONNECT consumed attempt 1, so MAX_CONNECT_ATTEMPTS - 1
    // retries remain.
    for (let i = 1; i < MAX_CONNECT_ATTEMPTS; i++) {
      actor.send({ type: "RETRY" });
      expect(actor.getSnapshot().value).toBe("connecting");
      actor.send({ type: "CONNECT_FAILED", reason: "tcp refused" });
      expect(actor.getSnapshot().value).toBe("error");
    }

    // Attempts exhausted — RETRY is ignored, still in error.
    actor.send({ type: "RETRY" });
    expect(actor.getSnapshot().value).toBe("error");

    // RESET escapes back to idle and clears state.
    actor.send({ type: "RESET" });
    expect(actor.getSnapshot().value).toBe("idle");
    expect(actor.getSnapshot().context.connectAttempts).toBe(0);
  });

  it("times out while connecting", () => {
    vi.useFakeTimers();
    try {
      const actor = createActor(deviceMachine).start();
      actor.send({ type: "START_SCAN" });
      actor.send({ type: "DEVICE_DISCOVERED", device });
      actor.send({ type: "CONNECT", device });
      expect(actor.getSnapshot().value).toBe("connecting");

      vi.advanceTimersByTime(CONNECTION_TIMEOUT);
      expect(actor.getSnapshot().value).toBe("error");
      expect(actor.getSnapshot().context.lastError).toContain("timed out");
    } finally {
      vi.useRealTimers();
    }
  });
});

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
});
