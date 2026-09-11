import { describe, expect, it } from "vitest";

import { DISCOVERY_PORT } from "../protocol";
import { createDiscoveryRuntime } from "../discovery";
import type { MdnsService, MulticastSocket } from "../discovery";
import type { PlatformNetworkAdapter } from "../platform";
import type { HeartbeatPayload } from "../types";

class FakeSocket implements MulticastSocket {
  readonly sent: Array<{ data: Uint8Array; port: number; address: string }> = [];
  readonly joined: string[] = [];
  closed = false;

  private messageHandler?: (data: Uint8Array, remote: { address: string; port: number }) => void;

  async bind(): Promise<void> {}

  onMessage(
    handler: (data: Uint8Array, remote: { address: string; port: number }) => void,
  ): void {
    this.messageHandler = handler;
  }

  async send(data: Uint8Array, port: number, address: string): Promise<void> {
    this.sent.push({ data, port, address });
  }

  async joinGroup(group: string): Promise<void> {
    this.joined.push(group);
  }

  async leaveGroup(): Promise<void> {}

  async close(): Promise<void> {
    this.closed = true;
  }

  receive(data: Uint8Array): void {
    this.messageHandler?.(data, { address: "192.168.1.20", port: DISCOVERY_PORT });
  }
}

class FakeMdnsService implements MdnsService {
  advertised = false;
  browsed = false;
  unpublished = false;
  closed = false;

  private serviceFoundHandler?: (service: {
    name: string;
    ipv4: string[];
    ipv6: string[];
    port: number;
    txt: Record<string, string>;
  }) => void;
  private serviceLostHandler?: (name: string) => void;

  async advertise(): Promise<void> {
    this.advertised = true;
  }

  async browse(): Promise<void> {
    this.browsed = true;
  }

  onServiceFound(
    handler: (service: {
      name: string;
      ipv4: string[];
      ipv6: string[];
      port: number;
      txt: Record<string, string>;
    }) => void,
  ): void {
    this.serviceFoundHandler = handler;
  }

  onServiceLost(handler: (name: string) => void): void {
    this.serviceLostHandler = handler;
  }

  async unpublish(): Promise<void> {
    this.unpublished = true;
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  simulateServiceFound(name = "peer-service"): void {
    this.serviceFoundHandler?.({
      name,
      ipv4: ["192.168.1.20"],
      ipv6: [],
      port: DISCOVERY_PORT,
      txt: { device_id: "peer-1", alias: "Peer", platform: "ios" },
    });
  }

  simulateServiceLost(name = "peer-service"): void {
    this.serviceLostHandler?.(name);
  }
}

function createHeartbeat(): HeartbeatPayload {
  return {
    device_id: "own-1",
    alias: "Owner",
    platform: "macos",
    interfaces: [
      { type: "Wi-Fi", ipv4: ["192.168.1.10"], ipv6: [], preferred: true },
    ],
    port: DISCOVERY_PORT,
    cert_fingerprint: "AA:BB:CC",
  };
}

function createFakeAdapter(socket: FakeSocket, mdnsService: FakeMdnsService): PlatformNetworkAdapter {
  return {
    runtime: "desktop",
    capabilities: { udp: true, mdns: true, tcp: false },
    createMulticastSocket: () => socket,
    createMdnsService: () => mdnsService,
    createTcpSocket: () => {
      throw new Error("tcp unused");
    },
  };
}

describe("createDiscoveryRuntime", () => {
  it("starts both discovery tiers with one heartbeat provider", async () => {
    const socket = new FakeSocket();
    const mdnsService = new FakeMdnsService();
    const runtime = createDiscoveryRuntime({
      adapter: createFakeAdapter(socket, mdnsService),
      heartbeat: createHeartbeat,
    });

    await runtime.start();

    expect(socket.joined).toEqual(["224.0.0.1", "ff02::1"]);
    expect(socket.sent).toHaveLength(2);
    expect(mdnsService.advertised).toBe(true);
    expect(mdnsService.browsed).toBe(true);

    await runtime.stop();
  });

  it("routes seen and lost devices through the shared device manager", async () => {
    const socket = new FakeSocket();
    const mdnsService = new FakeMdnsService();
    const added: string[] = [];
    const removed: string[] = [];
    const runtime = createDiscoveryRuntime({
      adapter: createFakeAdapter(socket, mdnsService),
      heartbeat: createHeartbeat,
      deviceManager: {
        onDeviceAdded: (device) => added.push(device.device_id),
        onDeviceRemoved: (deviceId) => removed.push(deviceId),
      },
    });

    await runtime.start();
    mdnsService.simulateServiceFound();
    mdnsService.simulateServiceLost();

    expect(added).toEqual(["peer-1"]);
    expect(removed).toEqual(["peer-1"]);
    expect(runtime.deviceManager.getDevices()).toEqual([]);

    await runtime.stop();
  });

  it("stops both discovery tiers and clears tracked devices", async () => {
    const socket = new FakeSocket();
    const mdnsService = new FakeMdnsService();
    const runtime = createDiscoveryRuntime({
      adapter: createFakeAdapter(socket, mdnsService),
      heartbeat: createHeartbeat,
    });

    await runtime.start();
    mdnsService.simulateServiceFound();
    expect(runtime.deviceManager.size).toBe(1);

    await runtime.stop();

    expect(socket.closed).toBe(true);
    expect(mdnsService.unpublished).toBe(true);
    expect(mdnsService.closed).toBe(true);
    expect(runtime.deviceManager.size).toBe(0);
  });
});