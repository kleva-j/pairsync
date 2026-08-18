import { describe, expect, it } from "vitest";

import { DISCOVERY_PORT } from "../protocol";
import { MdnsDiscovery } from "../discovery";
import type { MdnsService, MdnsDiscoveryOptions } from "../discovery";
import type { Device, HeartbeatPayload } from "../types";

/** In-memory mDNS service implementing the platform contract. */
class FakeMdnsService implements MdnsService {
  advertised: Array<{ serviceType: string; name: string; port: number; txt: Record<string, string> }> = [];
  browsed: string[] = [];
  unpublished = false;
  closed = false;
  failAdvertise = false;
  failBrowse = false;

  private serviceFoundHandler?: (service: {
    name: string;
    ipv4: string[];
    ipv6: string[];
    port: number;
    txt: Record<string, string>;
  }) => void;
  private serviceLostHandler?: (name: string) => void;

  async advertise(
    serviceType: string,
    name: string,
    port: number,
    txt: Record<string, string>,
  ): Promise<void> {
    if (this.failAdvertise) throw new Error("advertise failed");
    this.advertised.push({ serviceType, name, port, txt });
  }

  async browse(serviceType: string): Promise<void> {
    if (this.failBrowse) throw new Error("browse failed");
    this.browsed.push(serviceType);
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

  /** Simulate a service being found on the network. */
  simulateServiceFound(
    service: {
      name: string;
      ipv4: string[];
      ipv6: string[];
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
  it("advertises the local service with the correct service type", async () => {
    const { mdnsService, discovery } = setup();
    await discovery.start();
    expect(mdnsService.advertised).toHaveLength(1);
    expect(mdnsService.advertised[0]).toMatchObject({
      serviceType: "_pairsync._tcp.local",
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
    // Assert the literal to lock down the wire-critical service type
    expect(mdnsService.browsed).toEqual(["_pairsync._tcp.local"]);
    await discovery.stop();
  });

  it("emits onDeviceSeen when a service is found", async () => {
    const { mdnsService, discovery, seen } = setup();
    await discovery.start();
    mdnsService.simulateServiceFound({
      name: "Peer Device",
      ipv4: ["192.168.1.20"],
      ipv6: [],
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
      interfaces: [{ ipv4: ["192.168.1.20"], ipv6: [] }],
      last_seen_at: 1_000,
    });
    await discovery.stop();
  });

  it("emits onDeviceLost when a service is lost", async () => {
    const { mdnsService, discovery, lost } = setup();
    await discovery.start();
    mdnsService.simulateServiceFound({
      name: "Peer Device",
      ipv4: ["192.168.1.20"],
      ipv6: [],
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

  it("reports error when a lost service was never seen", async () => {
    const { mdnsService, discovery, lost, errors } = setup();
    await discovery.start();
    mdnsService.simulateServiceLost("nonexistent-service");
    expect(lost).toEqual([]);
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toContain("nonexistent-service");
    await discovery.stop();
  });

  it("ignores service lost after stop", async () => {
    const { mdnsService, discovery, lost } = setup();
    await discovery.start();
    mdnsService.simulateServiceFound({
      name: "Peer Device",
      ipv4: ["192.168.1.20"],
      ipv6: [],
      port: DISCOVERY_PORT,
      txt: {
        device_id: "peer-1",
        alias: "Peer",
        platform: "ios",
      },
    });
    await discovery.stop();
    mdnsService.simulateServiceLost("Peer Device");
    expect(lost).toEqual([]);
  });

  it("ignores its own service advertisement", async () => {
    const { mdnsService, discovery, seen } = setup();
    await discovery.start();
    mdnsService.simulateServiceFound({
      name: "Own Device",
      ipv4: ["192.168.1.10"],
      ipv6: [],
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

  it("reports missing device_id without crashing", async () => {
    const { mdnsService, discovery, errors } = setup();
    await discovery.start();
    mdnsService.simulateServiceFound({
      name: "Bad Device",
      ipv4: ["192.168.1.30"],
      ipv6: [],
      port: DISCOVERY_PORT,
      txt: { alias: "Foo", platform: "ios" }, // missing device_id
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(Error);
    expect((errors[0] as Error).message).toContain("device_id");
    await discovery.stop();
  });

  it("reports missing alias without crashing", async () => {
    const { mdnsService, discovery, errors } = setup();
    await discovery.start();
    mdnsService.simulateServiceFound({
      name: "Bad Device",
      ipv4: ["192.168.1.30"],
      ipv6: [],
      port: DISCOVERY_PORT,
      txt: { device_id: "peer-x", platform: "ios" }, // missing alias
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(Error);
    expect((errors[0] as Error).message).toContain("alias");
    await discovery.stop();
  });

  it("reports missing/invalid platform without crashing", async () => {
    const { mdnsService, discovery, errors } = setup();
    await discovery.start();
    mdnsService.simulateServiceFound({
      name: "Bad Device",
      ipv4: ["192.168.1.30"],
      ipv6: [],
      port: DISCOVERY_PORT,
      txt: { device_id: "peer-y", alias: "Bar" }, // missing platform
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(Error);
    expect((errors[0] as Error).message).toContain("platform");
    await discovery.stop();
  });

  it("rejects unsupported platform values", async () => {
    const { mdnsService, discovery, errors } = setup();
    await discovery.start();
    mdnsService.simulateServiceFound({
      name: "Bad Platform",
      ipv4: ["192.168.1.30"],
      ipv6: [],
      port: DISCOVERY_PORT,
      txt: { device_id: "peer-z", alias: "Baz", platform: "beos" },
    });
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toContain("beos");
    await discovery.stop();
  });

  it("engine continues after malformed records", async () => {
    const { mdnsService, discovery, errors, seen } = setup();
    await discovery.start();
    // First record: missing device_id
    mdnsService.simulateServiceFound({
      name: "Bad Device",
      ipv4: ["192.168.1.30"],
      ipv6: [],
      port: DISCOVERY_PORT,
      txt: {},
    });
    expect(errors).toHaveLength(1);
    // Second record: valid — engine still works
    mdnsService.simulateServiceFound({
      name: "Good Device",
      ipv4: ["192.168.1.40"],
      ipv6: [],
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
    expect(mdnsService.browsed).toEqual(["_pairsync._tcp.local"]);
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
    expect(mdnsService.browsed).toEqual([
      "_pairsync._tcp.local",
      "_pairsync._tcp.local",
    ]);
    await discovery.stop();
  });

  it("drops service events before start or after stop", async () => {
    const { mdnsService, discovery, seen } = setup();
    const peerService = {
      name: "Peer Device",
      ipv4: ["192.168.1.20"],
      ipv6: [],
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
    expect(mdnsService.browsed).toEqual(["_pairsync._tcp.local"]);
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

  it("passes dual-stack addresses from adapter to device interfaces", async () => {
    const { mdnsService, discovery, seen } = setup();
    await discovery.start();
    mdnsService.simulateServiceFound({
      name: "Dual-Stack Peer",
      ipv4: ["192.168.1.20"],
      ipv6: ["fe80::1"],
      port: DISCOVERY_PORT,
      txt: {
        device_id: "peer-dual",
        alias: "Dual Peer",
        platform: "linux",
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.interfaces[0]!.ipv4).toEqual(["192.168.1.20"]);
    expect(seen[0]!.interfaces[0]!.ipv6).toEqual(["fe80::1"]);
    await discovery.stop();
  });

  it("reports null/undefined TXT record without crashing", async () => {
    const { mdnsService, discovery, errors } = setup();
    await discovery.start();
    mdnsService.simulateServiceFound({
      name: "Null TXT",
      ipv4: ["192.168.1.30"],
      ipv6: [],
      port: DISCOVERY_PORT,
      txt: null as unknown as Record<string, string>,
    });
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toContain("empty or missing");
    await discovery.stop();
  });

  it("does not report onDeviceLost until all service names for a device are gone", async () => {
    const { mdnsService, discovery, lost } = setup();
    await discovery.start();

    // Same device discovered under two service names (e.g. dual interfaces)
    mdnsService.simulateServiceFound({
      name: "peer-iface-1",
      ipv4: ["192.168.1.20"],
      ipv6: [],
      port: DISCOVERY_PORT,
      txt: { device_id: "peer-1", alias: "Peer", platform: "ios" },
    });
    mdnsService.simulateServiceFound({
      name: "peer-iface-2",
      ipv4: ["192.168.1.21"],
      ipv6: [],
      port: DISCOVERY_PORT,
      txt: { device_id: "peer-1", alias: "Peer", platform: "ios" },
    });

    // Lose first service — device still reachable via the second
    mdnsService.simulateServiceLost("peer-iface-1");
    expect(lost).toEqual([]);

    // Lose second — now the device is truly gone
    mdnsService.simulateServiceLost("peer-iface-2");
    expect(lost).toEqual(["peer-1"]);

    await discovery.stop();
  });

  it("rollbacks advertisement if stop() runs during advertise()", async () => {
    const { mdnsService, discovery } = setup();
    let releaseAdvertise!: () => void;
    const advertisePending = new Promise<void>((resolve) => {
      releaseAdvertise = resolve;
    });

    // Patch the fake to block on advertise
    const origAdvertise = mdnsService.advertise.bind(mdnsService);
    mdnsService.advertise = async (st, name, port, txt) => {
      await advertisePending;
      await origAdvertise(st, name, port, txt);
    };

    const startPromise = discovery.start(); // blocked on advertise
    const stopPromise = discovery.stop();   // queues behind startPromise
    releaseAdvertise();                     // unblocks advertise -> rollback
    await startPromise;
    await stopPromise;

    // Service was advertised but then unpublished by the rollback
    expect(mdnsService.advertised).toHaveLength(1);
    expect(mdnsService.unpublished).toBe(true);
  });

  it("stop() during in-flight start() waits for start to finish before closing", async () => {
    const { mdnsService, discovery } = setup();
    let releaseAdvertise!: () => void;
    const advertisePending = new Promise<void>((resolve) => {
      releaseAdvertise = resolve;
    });
    const origAdvertise = mdnsService.advertise.bind(mdnsService);
    mdnsService.advertise = async (st, name, port, txt) => {
      await advertisePending;
      await origAdvertise(st, name, port, txt);
    };

    const startPromise = discovery.start(); // blocked on advertise
    const stopPromise = discovery.stop();   // should wait for start
    releaseAdvertise();
    await startPromise;
    await stopPromise;

    // close() ran after advertise() resolved (not before)
    expect(mdnsService.closed).toBe(true);
    expect(mdnsService.unpublished).toBe(true);
  });

  it("start() during an in-flight stop() waits and restarts cleanly", async () => {
    const { mdnsService, discovery } = setup();
    await discovery.start();
    let releaseClose!: () => void;
    const closePending = new Promise<void>((resolve) => {
      releaseClose = resolve;
    });

    const origClose = mdnsService.close.bind(mdnsService);
    mdnsService.close = async () => {
      await closePending;
      await origClose();
    };

    const stopPromise = discovery.stop(); // blocked on close
    const startPromise = discovery.start(); // must wait for stop
    releaseClose();
    await stopPromise;
    await startPromise;

    expect(mdnsService.advertised).toHaveLength(2);
    expect(mdnsService.browsed).toEqual([
      "_pairsync._tcp.local",
      "_pairsync._tcp.local",
    ]);
    await discovery.stop();
  });
});
