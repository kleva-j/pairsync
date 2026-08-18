import { describe, expect, it } from "vitest";

import { DISCOVERY_PORT, SERVICE_TYPE } from "../protocol";
import { MdnsDiscovery } from "../discovery";
import type { MdnsService, MdnsDiscoveryOptions } from "../discovery";
import type { Device, HeartbeatPayload } from "../types";

/** In-memory mDNS service implementing the platform contract. */
class FakeMdnsService implements MdnsService {
  advertised: Array<{ name: string; port: number; txt: Record<string, string> }> = [];
  browsed: string[] = [];
  unpublished = false;
  closed = false;
  failAdvertise = false;
  failBrowse = false;

  private serviceFoundHandler?: (service: {
    name: string;
    host: string;
    port: number;
    txt: Record<string, string>;
  }) => void;
  private serviceLostHandler?: (name: string) => void;

  async advertise(
    name: string,
    port: number,
    txt: Record<string, string>,
  ): Promise<void> {
    if (this.failAdvertise) throw new Error("advertise failed");
    this.advertised.push({ name, port, txt });
  }

  async browse(serviceType: string): Promise<void> {
    if (this.failBrowse) throw new Error("browse failed");
    this.browsed.push(serviceType);
  }

  onServiceFound(
    handler: (service: {
      name: string;
      host: string;
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

  /** Simulate a service being found on the network. */
  simulateServiceFound(
    service: {
      name: string;
      host: string;
      port: number;
      txt: Record<string, string>;
    },
  ): void {
    this.serviceFoundHandler?.(service);
  }

  /** Simulate a service being lost from the network. */
  simulateServiceLost(name: string): void {
    this.serviceLostHandler?.(name);
  }
}

const ownPayload = (
  deviceId = "own-1",
  alias = "Swift Cheetah",
): HeartbeatPayload => ({
  device_id: deviceId,
  alias,
  platform: "macos",
  interfaces: [
    { type: "Wi-Fi", ipv4: ["192.168.1.10"], ipv6: [], preferred: true },
  ],
  port: DISCOVERY_PORT,
});

function setup(overrides?: Partial<MdnsDiscoveryOptions>) {
  const mdnsService = new FakeMdnsService();
  const seen: Device[] = [];
  const lost: string[] = [];
  const errors: unknown[] = [];

  const discovery = new MdnsDiscovery({
    mdnsService,
    heartbeat: () => ownPayload(),
    now: () => 1_000,
    onDeviceSeen: (device) => seen.push(device),
    onDeviceLost: (deviceId) => lost.push(deviceId),
    onError: (error) => errors.push(error),
    ...overrides,
  });

  return {
    mdnsService,
    discovery,
    seen,
    lost,
    errors,
  };
}

describe("MdnsDiscovery", () => {
  it("advertises the local service on start", async () => {
    const { mdnsService, discovery } = setup();
    await discovery.start();
    expect(mdnsService.advertised).toHaveLength(1);
    expect(mdnsService.advertised[0]).toMatchObject({
      port: DISCOVERY_PORT,
      txt: {
        device_id: "own-1",
        alias: "Swift Cheetah",
        platform: "macos",
        version: expect.any(String),
      },
    });
    await discovery.stop();
  });

  it("starts browsing for _pairsync._tcp.local on start", async () => {
    const { mdnsService, discovery } = setup();
    await discovery.start();
    expect(mdnsService.browsed).toEqual([SERVICE_TYPE]);
    await discovery.stop();
  });

  it("emits onDeviceSeen when a service is found", async () => {
    const { mdnsService, discovery, seen } = setup();
    await discovery.start();
    mdnsService.simulateServiceFound({
      name: "Peer Device",
      host: "192.168.1.20",
      port: DISCOVERY_PORT,
      txt: {
        device_id: "peer-1",
        alias: "Peer",
        platform: "ios",
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      device_id: "peer-1",
      alias: "Peer",
      platform: "ios",
      port: DISCOVERY_PORT,
      last_seen_at: 1_000,
    });
    await discovery.stop();
  });

  it("emits onDeviceLost when a service is lost", async () => {
    const { mdnsService, discovery, lost } = setup();
    await discovery.start();
    mdnsService.simulateServiceFound({
      name: "Peer Device",
      host: "192.168.1.20",
      port: DISCOVERY_PORT,
      txt: {
        device_id: "peer-1",
        alias: "Peer",
        platform: "ios",
      },
    });
    mdnsService.simulateServiceLost("Peer Device");
    expect(lost).toEqual(["peer-1"]);
    await discovery.stop();
  });

  it("ignores its own service advertisement", async () => {
    const { mdnsService, discovery, seen } = setup();
    await discovery.start();
    mdnsService.simulateServiceFound({
      name: "Own Device",
      host: "192.168.1.10",
      port: DISCOVERY_PORT,
      txt: {
        device_id: "own-1",
        alias: "Swift Cheetah",
        platform: "macos",
      },
    });
    expect(seen).toHaveLength(0);
    await discovery.stop();
  });

  it("reports malformed service records without crashing", async () => {
    const { mdnsService, discovery, errors, seen } = setup();
    await discovery.start();
    // Missing required fields
    mdnsService.simulateServiceFound({
      name: "Bad Device",
      host: "192.168.1.30",
      port: DISCOVERY_PORT,
      txt: {}, // missing device_id
    });
    expect(errors).toHaveLength(1);
    // Engine still works afterwards
    mdnsService.simulateServiceFound({
      name: "Good Device",
      host: "192.168.1.40",
      port: DISCOVERY_PORT,
      txt: {
        device_id: "peer-2",
        alias: "Good Peer",
        platform: "android",
      },
    });
    expect(seen).toHaveLength(1);
    await discovery.stop();
  });

  it("reports advertise failure without crashing", async () => {
    const { mdnsService, discovery, errors } = setup();
    mdnsService.failAdvertise = true;
    await discovery.start();
    expect(errors).toHaveLength(1);
    // Browse still started
    expect(mdnsService.browsed).toEqual([SERVICE_TYPE]);
    await discovery.stop();
  });

  it("reports browse failure without crashing", async () => {
    const { mdnsService, discovery, errors } = setup();
    mdnsService.failBrowse = true;
    await discovery.start();
    expect(errors).toHaveLength(1);
    // Advertise still worked
    expect(mdnsService.advertised).toHaveLength(1);
    await discovery.stop();
  });

  it("unpublishes and stops browsing on stop", async () => {
    const { mdnsService, discovery } = setup();
    await discovery.start();
    await discovery.stop();
    expect(mdnsService.unpublished).toBe(true);
    expect(mdnsService.closed).toBe(true);
  });

  it("can be restarted after a stop", async () => {
    const { mdnsService, discovery } = setup();
    await discovery.start();
    await discovery.stop();
    await discovery.start();
    expect(mdnsService.advertised).toHaveLength(2);
    expect(mdnsService.browsed).toEqual([SERVICE_TYPE, SERVICE_TYPE]);
    await discovery.stop();
  });

  it("drops service events before start or after stop", async () => {
    const { mdnsService, discovery, seen } = setup();
    const peerService = {
      name: "Peer Device",
      host: "192.168.1.20",
      port: DISCOVERY_PORT,
      txt: {
        device_id: "peer-1",
        alias: "Peer",
        platform: "ios",
      },
    };

    mdnsService.simulateServiceFound(peerService); // before start
    expect(seen).toHaveLength(0);

    await discovery.start();
    mdnsService.simulateServiceFound(peerService);
    expect(seen).toHaveLength(1);

    await discovery.stop();
    mdnsService.simulateServiceFound(peerService);
    expect(seen).toHaveLength(1); // no callbacks once stopped
  });

  it("concurrent start() calls advertise and browse once", async () => {
    const { mdnsService, discovery } = setup();
    await Promise.all([discovery.start(), discovery.start()]);
    expect(mdnsService.advertised).toHaveLength(1);
    expect(mdnsService.browsed).toEqual([SERVICE_TYPE]);
    await discovery.stop();
  });

  it("concurrent stop() calls clean up exactly once", async () => {
    const { mdnsService, discovery } = setup();
    await discovery.start();
    await Promise.all([discovery.stop(), discovery.stop()]);
    expect(mdnsService.unpublished).toBe(true);
    expect(mdnsService.closed).toBe(true);
  });

  it("uses default service name when none provided", async () => {
    const { mdnsService, discovery } = setup();
    await discovery.start();
    expect(mdnsService.advertised[0]!.name).toMatch(/^pairsync-/);
    await discovery.stop();
  });

  it("uses custom service name when provided", async () => {
    const { mdnsService, discovery } = setup({
      serviceName: "my-custom-name",
    });
    await discovery.start();
    expect(mdnsService.advertised[0]!.name).toBe("my-custom-name");
    await discovery.stop();
  });

  it("includes cert_fingerprint in TXT record when provided", async () => {
    const { mdnsService, discovery } = setup({
      heartbeat: () => ({
        ...ownPayload(),
        cert_fingerprint: "AA:BB:CC:DD:EE:FF",
      }),
    });
    await discovery.start();
    expect(mdnsService.advertised[0]!.txt.cert_fingerprint).toBe(
      "AA:BB:CC:DD:EE:FF",
    );
    await discovery.stop();
  });
});
