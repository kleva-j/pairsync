import { createActor } from "xstate";
import { describe, expect, it } from "vitest";

import type { Device } from "../types";
import { discoveryMachine } from "../state";

const deviceA: Device = {
  device_id: "dev-a",
  alias: "alice",
  platform: "macos",
  interfaces: [{ type: "Wi-Fi", ipv4: ["192.168.1.10"], ipv6: [], preferred: true }],
  port: 53_351,
};

const deviceB: Device = {
  device_id: "dev-b",
  alias: "bob",
  platform: "android",
  interfaces: [{ type: "Wi-Fi", ipv4: ["192.168.1.11"], ipv6: [], preferred: false }],
  port: 53_352,
};

describe("discovery machine", () => {
  it("accumulates devices during a scan and clears them when idle", () => {
    const actor = createActor(discoveryMachine).start();
    expect(actor.getSnapshot().value).toBe("idle");

    actor.send({ type: "START_SCAN" });
    expect(actor.getSnapshot().value).toBe("scanning");
    expect(actor.getSnapshot().context.scanStartedAt).not.toBeNull();

    actor.send({ type: "DEVICE_FOUND", device: deviceA });
    actor.send({ type: "DEVICE_FOUND", device: deviceB });
    expect(actor.getSnapshot().context.devices.size).toBe(2);

    actor.send({ type: "STOP_SCAN" });
    expect(actor.getSnapshot().value).toBe("idle");
    expect(actor.getSnapshot().context.scanStartedAt).toBeNull();
    expect(actor.getSnapshot().context.devices.size).toBe(0);
  });

  it("does not double-count a device already in the list", () => {
    const actor = createActor(discoveryMachine).start();
    actor.send({ type: "START_SCAN" });
    actor.send({ type: "DEVICE_FOUND", device: deviceA });
    actor.send({ type: "DEVICE_FOUND", device: deviceA });
    expect(actor.getSnapshot().context.devices.size).toBe(1);
  });

  it("removes an expired device that was tracked, and ignores unknown ones", () => {
    const actor = createActor(discoveryMachine).start();
    actor.send({ type: "START_SCAN" });
    actor.send({ type: "DEVICE_FOUND", device: deviceA });

    actor.send({ type: "DEVICE_EXPIRED", deviceId: "ghost" });
    expect(actor.getSnapshot().context.devices.size).toBe(1);

    actor.send({ type: "DEVICE_EXPIRED", deviceId: "dev-a" });
    expect(actor.getSnapshot().context.devices.size).toBe(0);
  });

  it("clears the list with CLEAR without leaving the scanning state", () => {
    const actor = createActor(discoveryMachine).start();
    actor.send({ type: "START_SCAN" });
    actor.send({ type: "DEVICE_FOUND", device: deviceA });
    actor.send({ type: "CLEAR" });
    expect(actor.getSnapshot().value).toBe("scanning");
    expect(actor.getSnapshot().context.devices.size).toBe(0);
  });

  it("starts each scan with a fresh, empty device list", () => {
    const actor = createActor(discoveryMachine).start();
    actor.send({ type: "START_SCAN" });
    actor.send({ type: "DEVICE_FOUND", device: deviceA });
    actor.send({ type: "DEVICE_FOUND", device: deviceB });
    actor.send({ type: "STOP_SCAN" });

    // A second scan must not carry over devices from the previous one.
    actor.send({ type: "START_SCAN" });
    expect(actor.getSnapshot().value).toBe("scanning");
    expect(actor.getSnapshot().context.devices.size).toBe(0);
  });

  it("ignores device events while idle", () => {
    const actor = createActor(discoveryMachine).start();
    actor.send({ type: "DEVICE_FOUND", device: deviceA });
    actor.send({ type: "DEVICE_EXPIRED", deviceId: "dev-a" });
    actor.send({ type: "CLEAR" });
    expect(actor.getSnapshot().value).toBe("idle");
    expect(actor.getSnapshot().context.devices.size).toBe(0);
  });

  it("replaces the devices map rather than mutating the previous one", () => {
    const actor = createActor(discoveryMachine).start();
    actor.send({ type: "START_SCAN" });
    const initial = actor.getSnapshot().context.devices;
    actor.send({ type: "DEVICE_FOUND", device: deviceA });
    const afterFound = actor.getSnapshot().context.devices;
    actor.send({ type: "DEVICE_EXPIRED", deviceId: "dev-a" });
    const afterExpired = actor.getSnapshot().context.devices;

    // Each transition assigns a fresh Map — the original stays untouched.
    expect(afterFound).not.toBe(initial);
    expect(afterExpired).not.toBe(afterFound);
    expect(initial.size).toBe(0);
    expect(afterFound.size).toBe(1);
    expect(afterExpired.size).toBe(0);
  });
});
