import { describe, expect, it } from "vitest";

import { DISCOVERY_PORT } from "../protocol";
import { buildHeartbeat } from "../network";
import { MulticastDiscovery } from "../discovery";
import type { DiscoveryScheduler, MulticastSocket } from "../discovery";
import type { Device, HeartbeatPayload } from "../types";

/** In-memory socket implementing the platform contract (N-248). */
class FakeSocket implements MulticastSocket {
  readonly messages: Array<{ data: Uint8Array; port: number; address: string }> = [];
  readonly joined: string[] = [];
  readonly left: string[] = [];
  closed = false;
  failNextSend = false;
  failGroup?: string;

  private handler?: (data: Uint8Array, remote: { address: string; port: number }) => void;

  onMessage(handler: (data: Uint8Array, remote: { address: string; port: number }) => void): void {
    this.handler = handler;
  }

  async send(data: Uint8Array, port: number, address: string): Promise<void> {
    if (this.failNextSend) {
      this.failNextSend = false;
      throw new Error("send failed");
    }
    this.messages.push({ data, port, address });
  }

  async joinGroup(group: string): Promise<void> {
    if (this.failGroup === group) throw new Error(`join ${group} failed`);
    this.joined.push(group);
  }

  async leaveGroup(group: string): Promise<void> {
    this.left.push(group);
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  /** Simulates an inbound datagram from the network. */
  receive(
    data: Uint8Array,
    from: { address: string; port: number } = { address: "192.168.1.50", port: DISCOVERY_PORT },
  ): void {
    this.handler?.(data, from);
  }
}

/** Manual scheduler so tests control the 5s cadence. */
class ManualScheduler implements DiscoveryScheduler {
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

  async tick(): Promise<void> {
    // Await each callback so tests observe fully-completed sends (socket
    // ops resolve on the microtask queue, not synchronously).
    for (const callback of [...this.callbacks.values()]) await callback();
  }

  get pending(): number {
    return this.callbacks.size;
  }
}

const ownPayload = (deviceId = "own-1", alias = "Swift Cheetah"): HeartbeatPayload => ({
  device_id: deviceId,
  alias,
  platform: "macos",
  interfaces: [{ type: "Wi-Fi", ipv4: ["192.168.1.10"], ipv6: [], preferred: true }],
  port: DISCOVERY_PORT,
});

function setup() {
  const socket = new FakeSocket();
  const scheduler = new ManualScheduler();
  const seen: Device[] = [];
  const errors: unknown[] = [];
  let alias = "Swift Cheetah";

  const discovery = new MulticastDiscovery({
    socket,
    scheduler,
    heartbeat: () => ownPayload("own-1", alias),
    now: () => 1_000,
    onDeviceSeen: (device) => seen.push(device),
    onError: (error) => errors.push(error),
  });

  return {
    socket,
    scheduler,
    discovery,
    seen,
    errors,
    setAlias: (next: string): void => {
      alias = next;
    },
  };
}

describe("MulticastDiscovery", () => {
  it("joins the IPv4 and IPv6 multicast groups on start", async () => {
    const { socket, discovery } = setup();
    await discovery.start();
    expect(socket.joined).toEqual(["224.0.0.1", "ff02::1"]);
    await discovery.stop();
  });

  it("announces immediately and then once per interval", async () => {
    const { socket, scheduler, discovery } = setup();
    await discovery.start();
    expect(socket.messages.length).toBe(2); // both groups
    await scheduler.tick();
    expect(socket.messages.length).toBe(4);
    await scheduler.tick();
    expect(socket.messages.length).toBe(6);
    await discovery.stop();
  });

  it("sends the heartbeat wire payload to both groups on port 53350", async () => {
    const { socket, discovery } = setup();
    await discovery.start();
    const [v4, v6] = socket.messages;
    expect(v4!.address).toBe("224.0.0.1");
    expect(v6!.address).toBe("ff02::1");
    expect(v4!.port).toBe(DISCOVERY_PORT);
    expect(v6!.port).toBe(DISCOVERY_PORT);
    const parsed = JSON.parse(new TextDecoder().decode(v4!.data)) as {
      type: string;
      device_id: string;
    };
    expect(parsed.type).toBe("heartbeat");
    expect(parsed.device_id).toBe("own-1");
    await discovery.stop();
  });

  it("re-serializes a fresh heartbeat each interval", async () => {
    const { socket, scheduler, discovery, setAlias } = setup();
    await discovery.start();
    setAlias("Golden Eagle");
    await scheduler.tick();
    const last = JSON.parse(
      new TextDecoder().decode(socket.messages.at(-1)!.data),
    ) as { alias: string };
    expect(last.alias).toBe("Golden Eagle");
    await discovery.stop();
  });

  it("emits onDeviceSeen for a heartbeat from another device", async () => {
    const { socket, discovery, seen } = setup();
    await discovery.start();
    socket.receive(
      new TextEncoder().encode(
        buildHeartbeat({
          device_id: "peer-1",
          alias: "Peer",
          platform: "ios",
          interfaces: [{ type: "Wi-Fi", ipv4: ["192.168.1.20"], ipv6: [], preferred: true }],
          port: DISCOVERY_PORT,
        }),
      ),
    );
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

  it("ignores its own echoed heartbeat", async () => {
    const { socket, discovery, seen } = setup();
    await discovery.start();
    socket.receive(new TextEncoder().encode(buildHeartbeat(ownPayload("own-1"))));
    expect(seen).toHaveLength(0);
    await discovery.stop();
  });

  it("reports malformed datagrams without crashing", async () => {
    const { socket, discovery, errors, seen } = setup();
    await discovery.start();
    socket.receive(new TextEncoder().encode("{not json"));
    expect(errors).toHaveLength(1);
    socket.receive(
      new TextEncoder().encode(
        buildHeartbeat({ ...ownPayload("peer-2"), alias: "Peer 2" }),
      ),
    );
    expect(seen).toHaveLength(1); // engine still works afterwards
    await discovery.stop();
  });

  it("continues after a send failure", async () => {
    const { socket, scheduler, discovery, errors } = setup();
    await discovery.start();
    socket.failNextSend = true;
    await scheduler.tick(); // IPv4 send fails, IPv6 succeeds
    expect(errors).toHaveLength(1);
    expect(socket.messages.length).toBe(3);
    await scheduler.tick();
    expect(socket.messages.length).toBe(5);
    await discovery.stop();
  });

  it("reports group join failures but keeps discovering", async () => {
    const { socket, discovery, errors } = setup();
    socket.failGroup = "224.0.0.1";
    await discovery.start();
    expect(errors).toHaveLength(1);
    expect(socket.joined).toEqual(["ff02::1"]);
    expect(socket.messages.length).toBe(2); // still announces over IPv6
    await discovery.stop();
  });

  it("stop clears the timer, leaves the groups, and closes the socket", async () => {
    const { socket, scheduler, discovery } = setup();
    await discovery.start();
    await discovery.stop();
    expect(scheduler.pending).toBe(0);
    expect(socket.left).toEqual(["224.0.0.1", "ff02::1"]);
    expect(socket.closed).toBe(true);
    await scheduler.tick();
    expect(socket.messages.length).toBe(2); // no sends after stop
  });
});
