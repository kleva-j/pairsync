import { HEARTBEAT_INTERVAL } from "../constants";
import { DISCOVERY_PORT } from "../protocol";
import { buildHeartbeat, parseHeartbeat } from "../network";
import type { Device, HeartbeatPayload } from "../types";

/**
 * UDP multicast discovery (Phase 2.1, N-248) — Tier 1 of the discovery
 * stack.
 *
 * The engine is **platform-agnostic**: it owns the multicast group set, the
 * heartbeat send cadence, and inbound heartbeat handling, but all socket
 * work goes through the {@link MulticastSocket} contract. Each app provides
 * an adapter (react-native-udp on mobile, a Rust/Tauri plugin on desktop)
 * so the same logic runs everywhere — same pattern as
 * {@link InterfaceDetector} in `network/interfaces.ts`.
 *
 * Sends the local heartbeat immediately on start and then every
 * `HEARTBEAT_INTERVAL` (5s) to the IPv4 and IPv6 multicast groups;
 * inbound datagrams are validated with `parseHeartbeat` and surfaced via
 * `onDeviceSeen` (own echoes and malformed datagrams are dropped). The
 * caller wires the resulting devices into the discovery state machine and
 * a `HeartbeatTracker` for expiry.
 */

/** One multicast group (address + port) heartbeats are sent to. */
export interface MulticastGroup {
  address: string;
  port: number;
}

/** IPv4 and IPv6 multicast groups per the PRD/plan (both on port 53350). */
export const MULTICAST_GROUPS = Object.freeze({
  IPV4: Object.freeze({ address: "224.0.0.1", port: DISCOVERY_PORT }),
  IPV6: Object.freeze({ address: "ff02::1", port: DISCOVERY_PORT }),
} as const);

/**
 * Platform socket contract. Implemented by each app's adapter; the engine
 * only depends on this interface. `data` is a UTF-8 encoded heartbeat JSON
 * payload.
 *
 * Adapters own IPv6 link-local scoping: `ff02::1` is zone-scoped, so on
 * hosts with multiple interfaces the adapter must join per-interface (the
 * optional `iface` parameter exists for exactly this). The engine cannot
 * pick an interface — that's the platform interface-detector concern
 * (`network/interfaces.ts`) — so it always joins without a scope and
 * relies on the adapter.
 */
export interface MulticastSocket {
  /** Registers the inbound-datagram handler (called by the adapter). */
  onMessage(handler: (data: Uint8Array, remote: { address: string; port: number }) => void): void;
  /** Sends a datagram to `address:port`. */
  send(data: Uint8Array, port: number, address: string): Promise<void>;
  /** Joins a multicast group, optionally on a specific interface. */
  joinGroup(group: string, iface?: string): Promise<void>;
  /** Leaves a multicast group. */
  leaveGroup(group: string, iface?: string): Promise<void>;
  /** Releases the socket (unbinds, drops membership). */
  close(): Promise<void>;
}

/** Platform timer abstraction so the cadence works with any timer source. */
export interface DiscoveryScheduler {
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

/** Default scheduler backed by the global timers (Node, browsers, Hermes). */
export const defaultDiscoveryScheduler: DiscoveryScheduler = {
  setInterval: (callback, ms) => setInterval(callback, ms),
  clearInterval: (handle) => clearInterval(handle as NodeJS.Timeout),
};

export interface MulticastDiscoveryOptions {
  /** Platform socket adapter (see {@link MulticastSocket}). */
  socket: MulticastSocket;
  /** Returns a fresh heartbeat payload for each send (interfaces refresh). */
  heartbeat: () => HeartbeatPayload;
  /** Timer source (defaults to global timers; inject a manual one in tests). */
  scheduler?: DiscoveryScheduler;
  /** Send cadence in ms (default `HEARTBEAT_INTERVAL` = 5s). */
  intervalMs?: number;
  /** Groups to join and send to (defaults to IPv4 + IPv6). */
  groups?: readonly MulticastGroup[];
  /** Injectable clock for `last_seen_at` (default `Date.now`). */
  now?: () => number;
  /** Called with each validated device heartbeat (already deduped/parsed). */
  onDeviceSeen?: (device: Device) => void;
  /** Called for non-fatal socket/parse failures so discovery keeps running. */
  onError?: (error: unknown) => void;
}

/**
 * Drives UDP multicast discovery over a platform socket: joins the groups,
 * announces the local heartbeat immediately and every `intervalMs`, and
 * surfaces inbound device heartbeats via `onDeviceSeen`. Failures on any
 * one group (e.g. no IPv6 connectivity) are reported through `onError` and
 * never stop the remaining groups.
 */
export class MulticastDiscovery {
  private readonly socket: MulticastSocket;
  private readonly heartbeat: () => HeartbeatPayload;
  private readonly scheduler: DiscoveryScheduler;
  private readonly intervalMs: number;
  private readonly groups: readonly MulticastGroup[];
  private readonly now: () => number;
  private readonly onDeviceSeen?: (device: Device) => void;
  private readonly onError?: (error: unknown) => void;
  private readonly ownDeviceId: string;

  private timer: unknown = null;
  private started = false;
  /** In-flight start, so concurrent calls share one lifecycle run. */
  private startPromise: Promise<void> | null = null;
  /** In-flight stop, so concurrent calls share one cleanup run. */
  private stopPromise: Promise<void> | null = null;

  constructor(options: MulticastDiscoveryOptions) {
    this.socket = options.socket;
    this.heartbeat = options.heartbeat;
    this.scheduler = options.scheduler ?? defaultDiscoveryScheduler;
    this.intervalMs = options.intervalMs ?? HEARTBEAT_INTERVAL;
    this.groups = options.groups ?? [MULTICAST_GROUPS.IPV4, MULTICAST_GROUPS.IPV6];
    this.now = options.now ?? (() => Date.now());
    this.onDeviceSeen = options.onDeviceSeen;
    this.onError = options.onError;
    this.ownDeviceId = this.heartbeat().device_id;
    this.socket.onMessage((data, _remote) => this.handleMessage(data));
  }

  /** Joins the multicast groups and starts the heartbeat cadence. */
  async start(): Promise<void> {
    if (this.startPromise) return this.startPromise;
    if (this.started) return;
    this.started = true;
    const run = (async () => {
      for (const group of this.groups) {
        try {
          await this.socket.joinGroup(group.address);
        } catch (error) {
          this.reportError(error);
        }
      }
      // Announce immediately, then on the interval. The callback returns the
      // send promise so schedulers (e.g. tests) can await a completed tick.
      await this.sendHeartbeat();
      // stop() may have run while we were joining; never arm a timer for a
      // stopped engine (that would leak a 5s send loop on a closed socket).
      if (this.started) {
        this.timer = this.scheduler.setInterval(
          () => this.sendHeartbeat(),
          this.intervalMs,
        );
      }
    })();
    this.startPromise = run.finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  /** Stops the cadence, leaves the groups, and releases the socket. */
  async stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise;
    if (!this.started) return;
    this.started = false;
    const run = (async () => {
      if (this.timer !== null) {
        this.scheduler.clearInterval(this.timer);
        this.timer = null;
      }
      for (const group of this.groups) {
        try {
          await this.socket.leaveGroup(group.address);
        } catch (error) {
          this.reportError(error);
        }
      }
      await this.socket.close();
    })();
    this.stopPromise = run.finally(() => {
      this.stopPromise = null;
    });
    return this.stopPromise;
  }

  /** Sends one heartbeat to every configured group. */
  async sendHeartbeat(): Promise<void> {
    const payload = this.heartbeat();
    const data = new TextEncoder().encode(buildHeartbeat(payload));
    for (const group of this.groups) {
      try {
        await this.socket.send(data, group.port, group.address);
      } catch (error) {
        this.reportError(error);
      }
    }
  }

  private handleMessage(data: Uint8Array): void {
    let heartbeat: HeartbeatPayload;
    try {
      heartbeat = parseHeartbeat(new TextDecoder().decode(data));
    } catch (error) {
      this.reportError(error);
      return;
    }
    // Multicast echoes our own datagrams back; drop them before dedupe.
    if (heartbeat.device_id === this.ownDeviceId) return;

    const device: Device = {
      device_id: heartbeat.device_id,
      alias: heartbeat.alias,
      platform: heartbeat.platform,
      interfaces: heartbeat.interfaces,
      port: heartbeat.port,
      last_seen_at: this.now(),
    };
    if (heartbeat.cert_fingerprint !== undefined) {
      device.cert_fingerprint = heartbeat.cert_fingerprint;
    }
    this.onDeviceSeen?.(device);
  }

  private reportError(error: unknown): void {
    this.onError?.(error);
  }
}
