import { describe, expect, it, vi } from "vitest";

import { DeviceManager } from "../discovery";
import { HEARTBEAT_TIMEOUT } from "../constants";
import type { Device } from "../types";

const peerDevice = (id = "peer-1", alias = "Peer"): Device => ({
  device_id: id,
  alias,
  platform: "ios",
  interfaces: [{ type: "Wi-Fi", ipv4: ["192.168.1.20"], ipv6: [], preferred: true }],
  port: 53350,
  last_seen_at: 1_000,
});

describe("DeviceManager", () => {
  it("adds a device and returns it via getDevices()", () => {
    const manager = new DeviceManager();
    manager.addOrUpdate(peerDevice());
    expect(manager.getDevices()).toHaveLength(1);
    expect(manager.getDevices()[0]!.device_id).toBe("peer-1");
  });

  it("returns a specific device via getDevice()", () => {
    const manager = new DeviceManager();
    const device = peerDevice();
    manager.addOrUpdate(device);
    expect(manager.getDevice("peer-1")).toEqual(device);
    expect(manager.getDevice("unknown")).toBeUndefined();
  });

  it("deduplicates devices by device_id", () => {
    const manager = new DeviceManager();
    manager.addOrUpdate(peerDevice("peer-1", "First"));
    manager.addOrUpdate(peerDevice("peer-1", "Updated"));
    expect(manager.getDevices()).toHaveLength(1);
    expect(manager.getDevices()[0]!.alias).toBe("Updated");
  });

  it("updates device metadata on re-discovery", () => {
    const manager = new DeviceManager();
    const added = manager.addOrUpdate(peerDevice("peer-1", "Old Name"));
    expect(added).toBe(true);

    const updated = manager.addOrUpdate({
      ...peerDevice("peer-1", "New Name"),
      cert_fingerprint: "AA:BB:CC",
    });
    expect(updated).toBe(true);
    const device = manager.getDevice("peer-1");
    expect(device!.alias).toBe("New Name");
    expect(device!.cert_fingerprint).toBe("AA:BB:CC");
  });

  it("returns false when device is unchanged (same reference data)", () => {
    const manager = new DeviceManager();
    const device = peerDevice();
    const added = manager.addOrUpdate(device);
    expect(added).toBe(true); // first add
    // Second call with identical data — no meaningful change
    const result = manager.addOrUpdate({ ...device });
    expect(result).toBe(false);
  });

  it("removes a device by id", () => {
    const manager = new DeviceManager();
    manager.addOrUpdate(peerDevice("peer-1"));
    manager.addOrUpdate(peerDevice("peer-2"));
    manager.remove("peer-1");
    expect(manager.getDevices()).toHaveLength(1);
    expect(manager.getDevice("peer-1")).toBeUndefined();
    expect(manager.getDevice("peer-2")).toBeDefined();
  });

  it("removing an unknown device is a no-op", () => {
    const manager = new DeviceManager();
    expect(() => manager.remove("unknown")).not.toThrow();
  });

  it("clears all devices", () => {
    const manager = new DeviceManager();
    manager.addOrUpdate(peerDevice("peer-1"));
    manager.addOrUpdate(peerDevice("peer-2"));
    manager.clear();
    expect(manager.getDevices()).toHaveLength(0);
  });

  it("fires onDeviceAdded when a new device appears", () => {
    const added: Device[] = [];
    const manager = new DeviceManager({
      onDeviceAdded: (d) => added.push(d),
    });
    manager.addOrUpdate(peerDevice("peer-1"));
    expect(added).toHaveLength(1);
    expect(added[0]!.device_id).toBe("peer-1");
  });

  it("fires onDeviceUpdated when an existing device is re-discovered", () => {
    const updated: Device[] = [];
    const manager = new DeviceManager({
      onDeviceUpdated: (d) => updated.push(d),
    });
    manager.addOrUpdate(peerDevice("peer-1", "Old"));
    manager.addOrUpdate(peerDevice("peer-1", "New"));
    expect(updated).toHaveLength(1);
    expect(updated[0]!.alias).toBe("New");
  });

  it("does not fire onDeviceUpdated when data is unchanged", () => {
    const updated: Device[] = [];
    const manager = new DeviceManager({
      onDeviceUpdated: (d) => updated.push(d),
    });
    manager.addOrUpdate(peerDevice("peer-1"));
    manager.addOrUpdate({ ...peerDevice("peer-1"), last_seen_at: 2_000 });
    expect(updated).toHaveLength(0); // only last_seen_at changed — not meaningful
  });

  it("fires onDeviceRemoved when a device times out", () => {
    vi.useFakeTimers();
    const removed: string[] = [];
    const manager = new DeviceManager({

      onDeviceRemoved: (id) => removed.push(id),
    });
    manager.addOrUpdate(peerDevice("peer-1"));
    expect(manager.getDevices()).toHaveLength(1);

    // Advance past timeout
    vi.advanceTimersByTime(HEARTBEAT_TIMEOUT + 1);
    expect(removed).toEqual(["peer-1"]);
    expect(manager.getDevices()).toHaveLength(0);
    vi.useRealTimers();
  });

  it("fires onDeviceRemoved on explicit remove", () => {
    const removed: string[] = [];
    const manager = new DeviceManager({
      onDeviceRemoved: (id) => removed.push(id),
    });
    manager.addOrUpdate(peerDevice("peer-1"));
    manager.remove("peer-1");
    expect(removed).toEqual(["peer-1"]);
  });

  it("resets timeout when device is re-discovered", () => {
    vi.useFakeTimers();
    const removed: string[] = [];
    const manager = new DeviceManager({

      onDeviceRemoved: (id) => removed.push(id),
    });
    manager.addOrUpdate(peerDevice("peer-1"));

    // Re-discover at 50% of timeout
    vi.advanceTimersByTime(HEARTBEAT_TIMEOUT / 2);
    manager.addOrUpdate(peerDevice("peer-1"));

    // Original timeout fires — but timer was reset, so device survives
    vi.advanceTimersByTime(HEARTBEAT_TIMEOUT / 2);
    expect(removed).toHaveLength(0);
    expect(manager.getDevices()).toHaveLength(1);

    // New timeout fires after the reset point
    vi.advanceTimersByTime(HEARTBEAT_TIMEOUT / 2 + 1);
    expect(removed).toEqual(["peer-1"]);
    expect(manager.getDevices()).toHaveLength(0);
    vi.useRealTimers();
  });

  it("cancels pending timeout on explicit remove", () => {
    vi.useFakeTimers();
    const removed: string[] = [];
    const manager = new DeviceManager({

      onDeviceRemoved: (id) => removed.push(id),
    });
    manager.addOrUpdate(peerDevice("peer-1"));
    manager.remove("peer-1"); // cancels timer

    vi.advanceTimersByTime(HEARTBEAT_TIMEOUT + 1);
    expect(removed).toEqual(["peer-1"]); // from explicit remove only
    expect(manager.getDevices()).toHaveLength(0);
    vi.useRealTimers();
  });

  it("clear() cancels all pending timeouts", () => {
    vi.useFakeTimers();
    const removed: string[] = [];
    const manager = new DeviceManager({

      onDeviceRemoved: (id) => removed.push(id),
    });
    manager.addOrUpdate(peerDevice("peer-1"));
    manager.addOrUpdate(peerDevice("peer-2"));
    manager.clear();

    vi.advanceTimersByTime(HEARTBEAT_TIMEOUT + 1);
    expect(removed).toHaveLength(0); // no removals — timers were cleared
    vi.useRealTimers();
  });

  it("returns empty array when no devices", () => {
    const manager = new DeviceManager();
    expect(manager.getDevices()).toEqual([]);
    expect(manager.getDevice("any")).toBeUndefined();
  });

  it("tracks multiple devices independently", () => {
    vi.useFakeTimers();
    let now = 1_000_000;
    const removed: string[] = [];
    const manager = new DeviceManager({

      onDeviceRemoved: (id) => removed.push(id),
    });
    manager.addOrUpdate(peerDevice("peer-1", "A"));
    // Advance fake clock by 1s so the two setTimeout calls land at
    // different absolute times (peer-1 at 25000, peer-2 at 26000).
    vi.advanceTimersByTime(1_000);
    now += 1_000;
    manager.addOrUpdate(peerDevice("peer-2", "B"));

    // Advance to just past peer-1's timeout (fake time 25001) but
    // before peer-2's (26000).
    vi.advanceTimersByTime(HEARTBEAT_TIMEOUT - 1_000 + 1);
    expect(removed).toEqual(["peer-1"]);
    expect(manager.getDevices()).toHaveLength(1);
    expect(manager.getDevice("peer-2")).toBeDefined();

    // peer-2 times out 1s later
    vi.advanceTimersByTime(1_001);
    expect(removed).toEqual(["peer-1", "peer-2"]);
    expect(manager.getDevices()).toHaveLength(0);
    vi.useRealTimers();
  });

  it("device count is accurate through lifecycle", () => {
    const manager = new DeviceManager();
    expect(manager.size).toBe(0);
    manager.addOrUpdate(peerDevice("peer-1"));
    expect(manager.size).toBe(1);
    manager.addOrUpdate(peerDevice("peer-2"));
    expect(manager.size).toBe(2);
    manager.remove("peer-1");
    expect(manager.size).toBe(1);
    manager.clear();
    expect(manager.size).toBe(0);
  });

  it("configurable timeout", () => {
    vi.useFakeTimers();
    const removed: string[] = [];
    const manager = new DeviceManager({

      timeoutMs: 10_000, // 10s instead of 25s
      onDeviceRemoved: (id) => removed.push(id),
    });
    manager.addOrUpdate(peerDevice("peer-1"));

    vi.advanceTimersByTime(9_999);
    expect(removed).toHaveLength(0);
    vi.advanceTimersByTime(2);
    expect(removed).toEqual(["peer-1"]);
    vi.useRealTimers();
  });
});
