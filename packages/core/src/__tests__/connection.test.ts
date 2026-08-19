import { afterEach, describe, expect, it, vi } from "vitest";

import { CONNECTION_TIMEOUT } from "../constants";
import { DISCOVERY_PORT } from "../protocol";
import { ConnectionInitiator } from "../discovery";
import type { ConnectionError, TcpSocket } from "../discovery";
import type { Device } from "../types";

/** In-memory socket implementing the platform contract (N-251). */
class FakeSocket implements TcpSocket {
  readonly attempts: Array<{ host: string; port: number }> = [];
  refuseHosts = new Set<string>();
  hangHosts = new Set<string>();
  connected = false;
  closeCount = 0;
  private readonly pendingHangs: Array<{
    reject: (error: Error) => void;
  }> = [];

  async connect(host: string, port: number): Promise<void> {
    this.attempts.push({ host, port });
    if (this.hangHosts.has(host)) {
      // Mimics the contract: close() aborts the in-flight connect.
      await new Promise<void>((_resolve, reject) => {
        this.pendingHangs.push({ reject });
      });
    }
    if (this.refuseHosts.has(host)) {
      throw new Error(`ECONNREFUSED ${host}`);
    }
    this.connected = true;
  }

  async close(): Promise<void> {
    this.closeCount += 1;
    this.connected = false;
    for (const hang of this.pendingHangs) {
      hang.reject(new Error("socket closed while connecting"));
    }
    this.pendingHangs.length = 0;
  }
}

const peerDevice = (overrides: Partial<Device> = {}): Device => ({
  device_id: "peer-1",
  alias: "Peer",
  platform: "ios",
  interfaces: [
    { type: "Wi-Fi", ipv4: ["192.168.1.20"], ipv6: [], preferred: true },
  ],
  port: DISCOVERY_PORT,
  ...overrides,
});

/** Attaches a rejection handler immediately so a rejection is never unhandled. */
function captureRejection<T>(promise: Promise<T>): Promise<unknown> {
  return promise.then(
    (value) => value,
    (error) => error
  );
}

describe("ConnectionInitiator", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("connects to the device's best candidate on its heartbeat port", async () => {
    const socket = new FakeSocket();
    const initiator = new ConnectionInitiator({
      createSocket: () => socket,
      sleep: async () => {},
    });
    const conn = await initiator.connect(peerDevice({ port: 53_351 }));

    expect(socket.attempts).toEqual([{ host: "192.168.1.20", port: 53_351 }]);
    expect(socket.connected).toBe(true);
    expect(conn).toMatchObject({
      deviceId: "peer-1",
      address: "192.168.1.20",
      port: 53_351,
    });
    expect(conn.socket).toBe(socket);
  });

  it("defaults the TCP port to 53350 when the advertised port is unusable", async () => {
    const socket = new FakeSocket();
    const initiator = new ConnectionInitiator({
      createSocket: () => socket,
      sleep: async () => {},
    });

    await initiator.connect(peerDevice({ port: 0 }));
    await initiator.connect(peerDevice({ port: 70_000 }));
    await initiator.connect(peerDevice({ port: 3.5 }));

    expect(socket.attempts).toEqual([
      { host: "192.168.1.20", port: DISCOVERY_PORT },
      { host: "192.168.1.20", port: DISCOVERY_PORT },
      { host: "192.168.1.20", port: DISCOVERY_PORT },
    ]);
  });

  it("tries the highest-priority candidate first across multiple interfaces", async () => {
    const socket = new FakeSocket();
    const initiator = new ConnectionInitiator({
      createSocket: () => socket,
      sleep: async () => {},
    });
    await initiator.connect(
      peerDevice({
        interfaces: [
          { type: "Ethernet", ipv4: ["10.0.0.5"], ipv6: [], preferred: false },
          { type: "Wi-Fi", ipv4: ["192.168.1.20"], ipv6: [], preferred: true },
          { type: "Wi-Fi", ipv4: [], ipv6: ["fe80::20"], preferred: false },
        ],
      })
    );

    expect(socket.attempts[0]).toEqual({
      host: "192.168.1.20",
      port: DISCOVERY_PORT,
    });
  });

  it("falls back to the next candidate after a refusal, with a 1s backoff", async () => {
    const socket = new FakeSocket();
    socket.refuseHosts.add("192.168.1.20");
    const sleeps: number[] = [];
    const initiator = new ConnectionInitiator({
      createSocket: () => socket,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    const conn = await initiator.connect(
      peerDevice({
        interfaces: [
          { type: "Wi-Fi", ipv4: ["192.168.1.20"], ipv6: [], preferred: true },
          { type: "Ethernet", ipv4: ["10.0.0.5"], ipv6: [], preferred: false },
        ],
      })
    );

    expect(sleeps).toEqual([1_000]);
    expect(socket.attempts).toEqual([
      { host: "192.168.1.20", port: DISCOVERY_PORT },
      { host: "10.0.0.5", port: DISCOVERY_PORT },
    ]);
    expect(conn.address).toBe("10.0.0.5");
  });

  it("delays 1s then 2s across three candidates", async () => {
    const socket = new FakeSocket();
    socket.refuseHosts.add("192.168.1.20");
    socket.refuseHosts.add("192.168.1.30");
    const sleeps: number[] = [];
    const initiator = new ConnectionInitiator({
      createSocket: () => socket,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    const conn = await initiator.connect(
      peerDevice({
        interfaces: [
          { type: "Wi-Fi", ipv4: ["192.168.1.20"], ipv6: [], preferred: true },
          { type: "Wi-Fi", ipv4: ["192.168.1.30"], ipv6: [], preferred: false },
          { type: "Ethernet", ipv4: ["10.0.0.5"], ipv6: [], preferred: false },
        ],
      })
    );

    expect(sleeps).toEqual([1_000, 2_000]);
    expect(conn.address).toBe("10.0.0.5");
  });

  it("honors a custom backoff base", async () => {
    const socket = new FakeSocket();
    socket.refuseHosts.add("192.168.1.20");
    const sleeps: number[] = [];
    const initiator = new ConnectionInitiator({
      createSocket: () => socket,
      backoffBaseMs: 500,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    await initiator.connect(
      peerDevice({
        interfaces: [
          { type: "Wi-Fi", ipv4: ["192.168.1.20"], ipv6: [], preferred: true },
          { type: "Ethernet", ipv4: ["10.0.0.5"], ipv6: [], preferred: false },
        ],
      })
    );

    expect(sleeps).toEqual([500]);
  });

  it("aborts a hanging attempt after the connection timeout", async () => {
    vi.useFakeTimers();
    const socket = new FakeSocket();
    socket.hangHosts.add("192.168.1.20");
    const errors: ConnectionError[] = [];
    const initiator = new ConnectionInitiator({
      createSocket: () => socket,
      sleep: async () => {},
      onError: (error) => errors.push(error),
    });

    const promise = initiator.connect(peerDevice());
    const outcome = captureRejection(promise);
    await vi.advanceTimersByTimeAsync(CONNECTION_TIMEOUT);

    expect(await outcome).toMatchObject({
      code: "timeout",
      deviceId: "peer-1",
      attempt: 1,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.code).toBe("timeout");
    expect(errors[0]?.attempt).toBe(1);
    // The half-open socket is reset before failing.
    expect(socket.closeCount).toBeGreaterThan(0);
  });

  it("defaults to a 10s connection timeout", async () => {
    vi.useFakeTimers();
    const socket = new FakeSocket();
    socket.hangHosts.add("192.168.1.20");
    const initiator = new ConnectionInitiator({
      createSocket: () => socket,
      sleep: async () => {},
    });

    const promise = initiator.connect(peerDevice());
    const outcome = captureRejection(promise);
    await vi.advanceTimersByTimeAsync(CONNECTION_TIMEOUT);

    expect(await outcome).toMatchObject({ code: "timeout" });
  });

  it("recovers from a timed-out attempt on the next candidate", async () => {
    vi.useFakeTimers();
    const socket = new FakeSocket();
    socket.hangHosts.add("192.168.1.20");
    const initiator = new ConnectionInitiator({
      createSocket: () => socket,
      sleep: async () => {},
    });

    const promise = initiator.connect(
      peerDevice({
        interfaces: [
          { type: "Wi-Fi", ipv4: ["192.168.1.20"], ipv6: [], preferred: true },
          { type: "Ethernet", ipv4: ["10.0.0.5"], ipv6: [], preferred: false },
        ],
      })
    );
    const outcome = captureRejection(promise);
    await vi.advanceTimersByTimeAsync(CONNECTION_TIMEOUT);

    expect(await outcome).toMatchObject({
      address: "10.0.0.5",
      port: DISCOVERY_PORT,
    });
    // The half-open attempt was reset (close() aborted the hung connect),
    // then the next candidate was tried on the same socket.
    expect(socket.closeCount).toBeGreaterThan(0);
    expect(socket.attempts).toEqual([
      { host: "192.168.1.20", port: DISCOVERY_PORT },
      { host: "10.0.0.5", port: DISCOVERY_PORT },
    ]);
  });

  it("throws connect_failed when every candidate is refused, reporting each attempt", async () => {
    const socket = new FakeSocket();
    socket.refuseHosts.add("192.168.1.20");
    socket.refuseHosts.add("10.0.0.5");
    const errors: ConnectionError[] = [];
    const initiator = new ConnectionInitiator({
      createSocket: () => socket,
      sleep: async () => {},
      onError: (error) => errors.push(error),
    });

    const promise = initiator.connect(
      peerDevice({
        interfaces: [
          { type: "Wi-Fi", ipv4: ["192.168.1.20"], ipv6: [], preferred: true },
          { type: "Ethernet", ipv4: ["10.0.0.5"], ipv6: [], preferred: false },
        ],
      })
    );
    const outcome = captureRejection(promise);

    expect(await outcome).toMatchObject({
      code: "connect_failed",
      deviceId: "peer-1",
      attempt: 2,
    });
    // Each failed attempt is surfaced via onError.
    expect(errors).toHaveLength(2);
    expect(errors.map((error) => error.code)).toEqual([
      "connect_failed",
      "connect_failed",
    ]);
    expect(errors.map((error) => error.attempt)).toEqual([1, 2]);
    expect((errors[1]?.lastError as Error).message).toContain("ECONNREFUSED");
  });

  it("marks the terminal failure as timeout when the final attempt timed out", async () => {
    vi.useFakeTimers();
    const socket = new FakeSocket();
    socket.refuseHosts.add("192.168.1.20");
    socket.hangHosts.add("10.0.0.5");
    const initiator = new ConnectionInitiator({
      createSocket: () => socket,
      sleep: async () => {},
    });

    const promise = initiator.connect(
      peerDevice({
        interfaces: [
          { type: "Wi-Fi", ipv4: ["192.168.1.20"], ipv6: [], preferred: true },
          { type: "Ethernet", ipv4: ["10.0.0.5"], ipv6: [], preferred: false },
        ],
      })
    );
    const outcome = captureRejection(promise);
    await vi.advanceTimersByTimeAsync(CONNECTION_TIMEOUT);

    expect(await outcome).toMatchObject({
      code: "timeout",
      attempt: 2,
    });
  });

  it("throws no_candidates when the device advertises no interfaces", async () => {
    const socket = new FakeSocket();
    const initiator = new ConnectionInitiator({
      createSocket: () => socket,
      sleep: async () => {},
    });

    const promise = initiator.connect(peerDevice({ interfaces: [] }));
    const outcome = captureRejection(promise);

    expect(await outcome).toMatchObject({
      code: "no_candidates",
      deviceId: "peer-1",
      attempt: 0,
    });
    expect(socket.attempts).toHaveLength(0);
  });

  it("throws no_candidates when every advertised address is unreachable", async () => {
    const socket = new FakeSocket();
    const initiator = new ConnectionInitiator({
      createSocket: () => socket,
      sleep: async () => {},
    });

    const promise = initiator.connect(
      peerDevice({
        interfaces: [
          {
            type: "Wi-Fi",
            ipv4: ["8.8.8.8", "127.0.0.1"],
            ipv6: ["::1"],
            preferred: true,
          },
        ],
      })
    );
    const outcome = captureRejection(promise);

    expect(await outcome).toMatchObject({ code: "no_candidates" });
    expect(socket.attempts).toHaveLength(0);
  });

  it("rejects non-positive timeout and backoff options", () => {
    const socket = new FakeSocket();
    expect(
      () =>
        new ConnectionInitiator({ createSocket: () => socket, timeoutMs: 0 })
    ).toThrow(RangeError);
    expect(
      () =>
        new ConnectionInitiator({ createSocket: () => socket, timeoutMs: -1 })
    ).toThrow(RangeError);
    expect(
      () =>
        new ConnectionInitiator({
          createSocket: () => socket,
          timeoutMs: Number.NaN,
        })
    ).toThrow(RangeError);
    expect(
      () =>
        new ConnectionInitiator({
          createSocket: () => socket,
          backoffBaseMs: 0,
        })
    ).toThrow(RangeError);
    expect(
      () =>
        new ConnectionInitiator({
          createSocket: () => socket,
          backoffBaseMs: Number.NaN,
        })
    ).toThrow(RangeError);
  });

  it("close() on the established connection delegates to the socket", async () => {
    const socket = new FakeSocket();
    const initiator = new ConnectionInitiator({
      createSocket: () => socket,
      sleep: async () => {},
    });
    const conn = await initiator.connect(peerDevice());

    expect(socket.connected).toBe(true);
    await conn.close();
    expect(socket.closeCount).toBe(1);
    expect(socket.connected).toBe(false);
  });

  it("uses a distinct socket per connect() call, so connections stay isolated", async () => {
    const sockets = [new FakeSocket(), new FakeSocket()];
    let next = 0;
    const initiator = new ConnectionInitiator({
      createSocket: () => sockets[next++]!,
      sleep: async () => {},
    });

    const first = await initiator.connect(peerDevice({ device_id: "peer-1" }));
    const second = await initiator.connect(peerDevice({ device_id: "peer-2" }));

    expect(first.socket).toBe(sockets[0]);
    expect(second.socket).toBe(sockets[1]);

    // Closing one connection must not disturb the other's socket.
    await first.close();
    expect(sockets[0]!.connected).toBe(false);
    expect(sockets[1]!.connected).toBe(true);
    await second.close();
  });

  it("stamps connectedAt from the injected clock", async () => {
    const socket = new FakeSocket();
    const initiator = new ConnectionInitiator({
      createSocket: () => socket,
      sleep: async () => {},
      now: () => 42_000,
    });
    const conn = await initiator.connect(peerDevice());

    expect(conn.connectedAt).toBe(42_000);
  });
});
