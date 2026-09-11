import { describe, expect, it } from "vitest";

import { HEARTBEAT_INTERVAL } from "../constants";
import { DISCOVERY_PORT } from "../protocol";
import {
  ConnectionError,
  ConnectionInitiator,
  DeviceManager,
  ManualPeerError,
  ManualPeerRegistry,
} from "../discovery";
import type {
  EstablishedConnection,
  ManualPeerScheduler,
  TcpSocket,
} from "../discovery";
import type { Device } from "../types";

/** Minimal in-memory TCP socket driven by the fake initiator below. */
class FakeSocket implements TcpSocket {
  connected = false;
  closeCount = 0;

  async connect(_host: string, _port: number): Promise<void> {
    this.connected = true;
  }
  async send(_data: Uint8Array): Promise<void> {}
  onData(_handler: (data: Uint8Array) => void): void {}
  async close(): Promise<void> {
    this.closeCount += 1;
    this.connected = false;
  }
}

/**
 * Stubs `ConnectionInitiator` shape so tests exercise the registry without
 * driving the real backoff/timeout logic (already covered by connection.test.ts).
 */
class FakeConnectionInitiator {
  readonly attempts: Device[] = [];
  readonly closes: number[] = [];
  refuse = false;
  refuseCode: "no_candidates" | "timeout" | "connect_failed" = "connect_failed";

  async connect(device: Device): Promise<EstablishedConnection> {
    this.attempts.push(device);
    if (this.refuse) {
      throw new ConnectionError(
        this.refuseCode,
        device.device_id,
        `Unable to connect to ${device.device_id}`,
      );
    }
    const socket = new FakeSocket();
    await socket.connect("stub", device.port);
    const closes = this.closes;
    return {
      deviceId: device.device_id,
      address: "stub",
      port: device.port,
      socket,
      connectedAt: 0,
      close: async () => {
        closes.push(1);
        await socket.close();
      },
    };
  }
}

/** Manual scheduler so tests advance the refresh cadence deterministically. */
class ManualScheduler implements ManualPeerScheduler {
  private readonly callbacks = new Map<number, () => void>();
  private nextId = 1;

  setInterval(callback: () => void, _ms: number): unknown {
    const id = this.nextId++;
    this.callbacks.set(id, callback);
    return id;
  }
  clearInterval(handle: unknown): void {
    this.callbacks.delete(handle as number);
  }
  tick(): void {
    for (const callback of [...this.callbacks.values()]) callback();
  }
  get pending(): number {
    return this.callbacks.size;
  }
}

function setup(
  overrides: {
    initiator?: FakeConnectionInitiator;
    scheduler?: ManualScheduler;
    now?: () => number;
    refreshIntervalMs?: number;
  } = {},
) {
  const initiator = overrides.initiator ?? new FakeConnectionInitiator();
  const scheduler = overrides.scheduler ?? new ManualScheduler();
  const added: Device[] = [];
  const updated: Device[] = [];
  const removed: string[] = [];
  const deviceManager = new DeviceManager({
    onDeviceAdded: (device) => added.push(device),
    onDeviceUpdated: (device) => updated.push(device),
    onDeviceRemoved: (id) => removed.push(id),
  });

  const registry = new ManualPeerRegistry({
    deviceManager,
    // Cast: FakeConnectionInitiator is duck-typed to ConnectionInitiator's
    // one method we depend on.
    connectionInitiator: initiator as unknown as ConnectionInitiator,
    scheduler,
    now: overrides.now ?? (() => 1_000),
    ...(overrides.refreshIntervalMs !== undefined
      ? { refreshIntervalMs: overrides.refreshIntervalMs }
      : {}),
  });

  return {
    registry,
    deviceManager,
    initiator,
    scheduler,
    added,
    updated,
    removed,
  };
}

describe("ManualPeerRegistry", () => {
  it("adds a reachable IPv4 peer and feeds it into DeviceManager", async () => {
    const { registry, deviceManager, initiator, added } = setup();

    const device = await registry.addPeer({ host: "192.168.1.20" });

    expect(device).toMatchObject({
      device_id: `manual:192.168.1.20:${DISCOVERY_PORT}`,
      platform: "unknown",
      port: DISCOVERY_PORT,
      alias: "Manual (192.168.1.20)",
      last_seen_at: 1_000,
    });
    expect(device.interfaces).toEqual([
      { type: "Other", ipv4: ["192.168.1.20"], ipv6: [], preferred: true },
    ]);
    expect(initiator.attempts).toHaveLength(1);
    expect(added).toHaveLength(1);
    expect(deviceManager.getDevice(device.device_id)).toEqual(device);
  });

  it("adds a reachable IPv6 peer with the correct interface family", async () => {
    const { registry } = setup();
    const device = await registry.addPeer({ host: "fe80::1" });
    expect(device.interfaces[0]).toMatchObject({
      ipv4: [],
      ipv6: ["fe80::1"],
    });
  });

  it("normalises the host and strips IPv6 zone ids", async () => {
    const { registry } = setup();
    const device = await registry.addPeer({ host: "fe80::1%en0" });
    expect(device.device_id).toBe(`manual:fe80::1:${DISCOVERY_PORT}`);
    expect(device.interfaces[0]!.ipv6).toEqual(["fe80::1"]);
  });

  it("uses the user-supplied port and alias when provided", async () => {
    const { registry } = setup();
    const device = await registry.addPeer({
      host: "10.0.0.5",
      port: 53_355,
      alias: "  Office Mac  ",
    });
    expect(device.device_id).toBe("manual:10.0.0.5:53355");
    expect(device.port).toBe(53_355);
    expect(device.alias).toBe("Office Mac");
  });

  it("closes the probe connection after a successful reachability check", async () => {
    const { registry, initiator } = setup();
    await registry.addPeer({ host: "192.168.1.20" });
    expect(initiator.closes).toEqual([1]);
  });

  it("throws ManualPeerError for a malformed host", async () => {
    const { registry, initiator } = setup();
    await expect(registry.addPeer({ host: "not-an-ip" })).rejects.toMatchObject({
      name: "ManualPeerError",
      code: "invalid_address",
    });
    // Reachability probe must not run when validation fails.
    expect(initiator.attempts).toHaveLength(0);
  });

  it("throws ManualPeerError for an empty host", async () => {
    const { registry } = setup();
    await expect(registry.addPeer({ host: "   " })).rejects.toMatchObject({
      code: "invalid_address",
    });
  });

  it("throws ManualPeerError for a loopback address", async () => {
    const { registry } = setup();
    await expect(registry.addPeer({ host: "127.0.0.1" })).rejects.toMatchObject(
      { code: "loopback_address" },
    );
    await expect(registry.addPeer({ host: "::1" })).rejects.toMatchObject({
      code: "loopback_address",
    });
  });

  it("throws ManualPeerError for an out-of-range port", async () => {
    const { registry } = setup();
    await expect(
      registry.addPeer({ host: "192.168.1.20", port: 0 }),
    ).rejects.toMatchObject({ code: "invalid_port" });
    await expect(
      registry.addPeer({ host: "192.168.1.20", port: 70_000 }),
    ).rejects.toMatchObject({ code: "invalid_port" });
    await expect(
      registry.addPeer({ host: "192.168.1.20", port: 3.5 }),
    ).rejects.toMatchObject({ code: "invalid_port" });
  });

  it("throws ManualPeerError with cause when the peer is unreachable", async () => {
    const initiator = new FakeConnectionInitiator();
    initiator.refuse = true;
    initiator.refuseCode = "timeout";
    const { registry, added } = setup({ initiator });

    const error = await registry
      .addPeer({ host: "192.168.1.20" })
      .catch((e) => e);

    expect(error).toBeInstanceOf(ManualPeerError);
    expect((error as ManualPeerError).code).toBe("unreachable");
    expect((error as ManualPeerError).cause).toBeInstanceOf(ConnectionError);
    // Registry must not surface the peer to DeviceManager on failure.
    expect(added).toHaveLength(0);
  });

  it("is idempotent: re-adding the same host:port refreshes rather than duplicates", async () => {
    const { registry, deviceManager, scheduler, added, updated } = setup();

    await registry.addPeer({ host: "192.168.1.20", alias: "First" });
    await registry.addPeer({ host: "192.168.1.20", alias: "Second" });

    // One row in DeviceManager, updated (not duplicated).
    expect(deviceManager.size).toBe(1);
    expect(added).toHaveLength(1);
    expect(updated).toHaveLength(1);
    expect(updated[0]!.alias).toBe("Second");
    // Exactly one refresh timer armed (the previous one was cancelled).
    expect(scheduler.pending).toBe(1);
  });

  it("refreshes the peer's last_seen_at on the scheduler tick", async () => {
    const scheduler = new ManualScheduler();
    let clock = 1_000;
    const { registry, deviceManager, updated } = setup({
      scheduler,
      now: () => clock,
    });

    const device = await registry.addPeer({ host: "192.168.1.20" });
    clock = 6_000;
    scheduler.tick();

    const refreshed = deviceManager.getDevice(device.device_id)!;
    expect(refreshed.last_seen_at).toBe(6_000);
    // No meaningful change, so onDeviceUpdated was not called — the timer
    // just re-armed DeviceManager's expiry.
    expect(updated).toHaveLength(0);
  });

  it("defaults the refresh cadence to HEARTBEAT_INTERVAL", async () => {
    // Assert the constant is respected by hooking a scheduler that captures the ms.
    const captured: number[] = [];
    const scheduler: ManualPeerScheduler = {
      setInterval: (callback, ms) => {
        captured.push(ms);
        return callback;
      },
      clearInterval: () => {},
    };
    const initiator = new FakeConnectionInitiator();
    const registry = new ManualPeerRegistry({
      deviceManager: new DeviceManager(),
      connectionInitiator: initiator as unknown as ConnectionInitiator,
      scheduler,
    });
    await registry.addPeer({ host: "192.168.1.20" });
    expect(captured).toEqual([HEARTBEAT_INTERVAL]);
  });

  it("removePeer cancels the refresh timer and evicts from DeviceManager", async () => {
    const { registry, deviceManager, scheduler, removed } = setup();
    const device = await registry.addPeer({ host: "192.168.1.20" });
    registry.removePeer(device.device_id);

    expect(scheduler.pending).toBe(0);
    expect(removed).toEqual([device.device_id]);
    expect(deviceManager.getDevice(device.device_id)).toBeUndefined();
    expect(registry.getPeers()).toEqual([]);
  });

  it("removePeer is a no-op for unknown ids", () => {
    const { registry, removed } = setup();
    registry.removePeer("nope");
    expect(removed).toEqual([]);
  });

  it("stop cancels every refresh timer and evicts every peer", async () => {
    const { registry, scheduler, deviceManager, removed } = setup();
    await registry.addPeer({ host: "192.168.1.20" });
    await registry.addPeer({ host: "10.0.0.5" });

    registry.stop();

    expect(scheduler.pending).toBe(0);
    expect(deviceManager.size).toBe(0);
    expect(removed).toHaveLength(2);
    expect(registry.isStopped()).toBe(true);
    expect(registry.getPeers()).toEqual([]);
  });

  it("addPeer after stop rejects", async () => {
    const { registry } = setup();
    registry.stop();
    await expect(registry.addPeer({ host: "192.168.1.20" })).rejects.toThrow(
      /stopped/,
    );
  });

  it("rejects a non-positive refresh interval at construction time", () => {
    const initiator = new FakeConnectionInitiator();
    expect(
      () =>
        new ManualPeerRegistry({
          deviceManager: new DeviceManager(),
          connectionInitiator: initiator as unknown as ConnectionInitiator,
          refreshIntervalMs: 0,
        }),
    ).toThrow(RangeError);
  });

  it("getPeers returns a snapshot", async () => {
    const { registry } = setup();
    await registry.addPeer({ host: "192.168.1.20" });
    const before = registry.getPeers();
    expect(before).toHaveLength(1);
    before.length = 0; // mutate snapshot
    expect(registry.getPeers()).toHaveLength(1);
  });
});
