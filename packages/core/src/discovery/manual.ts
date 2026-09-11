import ipaddr from "ipaddr.js";

import type { DeviceManager } from "./deviceManager";
import type { Device } from "../types";

import { isLoopbackAddress, normalizeAddress } from "../network";
import { HEARTBEAT_INTERVAL } from "../constants";
import { DISCOVERY_PORT } from "../protocol";

import { ConnectionError, type ConnectionInitiator } from "./connection";

/**
 * Manual peer entry (Phase 2.8, PRD Tier 3) — the fallback when both UDP
 * multicast (2.1) and mDNS (2.2) are blocked.
 *
 * The registry:
 *
 * 1. Validates a user-supplied `host` (IPv4 / IPv6, no loopback) and `port`.
 * 2. Probes reachability with the shared {@link ConnectionInitiator} (2.4)
 *    and closes the probe socket immediately — transfers use their own
 *    connection once Phase 3 lands.
 * 3. Synthesises a {@link Device} and feeds it into the shared
 *    {@link DeviceManager} (2.3) so manual peers surface next to discovered
 *    peers in the UI, keyed by a deterministic `device_id`.
 * 4. Re-inserts the device every `refreshIntervalMs` so `DeviceManager`'s
 *    heartbeat-based expiry never drops a manual peer while it's registered
 *    (there is no wire heartbeat for these peers — the registry *is* their
 *    heartbeat).
 *
 * Removal cancels the refresh timer and forwards to `DeviceManager.remove`.
 */

/** Why a manual peer add failed. */
export type ManualPeerErrorCode =
  | "invalid_address"
  | "invalid_port"
  | "loopback_address"
  | "unreachable";

/** Thrown by {@link ManualPeerRegistry.addPeer} on validation/probe failure. */
export class ManualPeerError extends Error {
  readonly code: ManualPeerErrorCode;
  readonly host: string;
  readonly port: number;
  readonly cause?: unknown;

  constructor(
    code: ManualPeerErrorCode,
    host: string,
    port: number,
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = "ManualPeerError";
    this.code = code; 
    this.host = host;
    this.port = port;
    if (cause !== undefined) this.cause = cause;
  }
}

/** User-supplied manual peer input. */
export interface ManualPeerInput {
  /** IPv4 or IPv6 literal. Hostnames are not accepted — resolve first. */
  host: string;
  /** TCP port (1–65535). Defaults to {@link DISCOVERY_PORT}. */
  port?: number;
  /** Optional display alias; defaults to `Manual (${host})`. */
  alias?: string;
}

/** Timer abstraction so the refresh cadence works with any timer source. */
export interface ManualPeerScheduler {
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

/** Default scheduler backed by the global timers. */
export const defaultManualPeerScheduler: ManualPeerScheduler = {
  setInterval: (callback, ms) => setInterval(callback, ms),
  clearInterval: (handle) => clearInterval(handle as NodeJS.Timeout),
};

export interface ManualPeerRegistryOptions {
  /** Shared device list (2.3). Manual peers surface here alongside discovered ones. */
  deviceManager: DeviceManager;
  /** Shared TCP initiator (2.4) used to probe reachability on add. */
  connectionInitiator: ConnectionInitiator;
  /**
   * How often to re-feed each manual peer into `DeviceManager` so its
   * expiry timer stays armed. Defaults to {@link HEARTBEAT_INTERVAL} (5s),
   * matching the discovered-peer cadence.
   */
  refreshIntervalMs?: number;
  /** Timer source (default: global timers; inject a manual one in tests). */
  scheduler?: ManualPeerScheduler;
  /** Injectable clock for `last_seen_at` (default `Date.now`). */
  now?: () => number;
}

/** True for a usable TCP port (1–65535). */
function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65_535;
}

/**
 * Parses `host` into a canonical, non-loopback IP literal. Returns the
 * normalised form (zone IDs stripped) plus the family, or throws
 * {@link ManualPeerError} for malformed / loopback input.
 */
function parseHost(
  host: string,
  port: number,
): { address: string; family: "ipv4" | "ipv6" } {
  const trimmed = host.trim();
  if (trimmed.length === 0) {
    throw new ManualPeerError(
      "invalid_address",
      host,
      port,
      "Manual peer host is empty",
    );
  }
  const normalised = normalizeAddress(trimmed);
  if (normalised === null) {
    throw new ManualPeerError(
      "invalid_address",
      host,
      port,
      `Manual peer host "${host}" is not a valid IP address`,
    );
  }
  if (isLoopbackAddress(normalised)) {
    throw new ManualPeerError(
      "loopback_address",
      host,
      port,
      `Manual peer host "${host}" is a loopback address`,
    );
  }
  const family = ipaddr.parse(normalised).kind() === "ipv6" ? "ipv6" : "ipv4";
  return { address: normalised, family };
}

/**
 * Builds the deterministic device id used to key a manual peer. Same input
 * → same id, so re-adding is a no-op update rather than a duplicate row.
 */
function manualDeviceId(address: string, port: number): string {
  return `manual:${address}:${port}`;
}

/** Builds the synthetic Device fed into `DeviceManager`. */
function buildManualDevice(
  address: string,
  family: "ipv4" | "ipv6",
  port: number,
  alias: string,
  now: number,
): Device {
  return {
    device_id: manualDeviceId(address, port),
    alias,
    platform: "unknown",
    interfaces: [
      {
        type: "Other",
        ipv4: family === "ipv4" ? [address] : [],
        ipv6: family === "ipv6" ? [address] : [],
        preferred: true,
      },
    ],
    port,
    last_seen_at: now,
  };
}

/** Internal record for each registered manual peer. */
interface ManualPeerRecord {
  device: Device;
  timer: unknown;
}

/**
 * Registers manually-entered peers, keeps them alive in the shared
 * {@link DeviceManager}, and cleans up on stop.
 */
export class ManualPeerRegistry {
  private readonly deviceManager: DeviceManager;
  private readonly connectionInitiator: ConnectionInitiator;
  private readonly refreshIntervalMs: number;
  private readonly scheduler: ManualPeerScheduler;
  private readonly now: () => number;
  private readonly records = new Map<string, ManualPeerRecord>();
  private stopped = false;

  constructor(options: ManualPeerRegistryOptions) {
    this.deviceManager = options.deviceManager;
    this.connectionInitiator = options.connectionInitiator;
    this.refreshIntervalMs = options.refreshIntervalMs ?? HEARTBEAT_INTERVAL;
    if (
      !Number.isFinite(this.refreshIntervalMs) ||
      this.refreshIntervalMs <= 0
    ) {
      throw new RangeError(
        `refreshIntervalMs must be a positive finite number, got ${this.refreshIntervalMs}`,
      );
    }
    this.scheduler = options.scheduler ?? defaultManualPeerScheduler;
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * Validates, probes, and registers a manual peer. Resolves with the
   * synthesised {@link Device} that was added to `DeviceManager`. Adding
   * the same `host:port` twice is idempotent — the existing record is
   * refreshed (alias updated) and returned.
   */
  async addPeer(input: ManualPeerInput): Promise<Device> {
    if (this.stopped) {
      throw new Error("ManualPeerRegistry is stopped");
    }
    const port = input.port ?? DISCOVERY_PORT;
    if (!isValidPort(port)) {
      throw new ManualPeerError(
        "invalid_port",
        input.host,
        port,
        `Manual peer port ${port} is out of range (1-65535)`,
      );
    }
    const { address, family } = parseHost(input.host, port);
    const alias = input.alias?.trim() || `Manual (${address})`;

    const device = buildManualDevice(address, family, port, alias, this.now());

    // Probe reachability with the shared TCP initiator (2.4). Close the
    // probe socket immediately — Phase 3's transfer engine owns its own
    // connection.
    try {
      const connection = await this.connectionInitiator.connect(device);
      try {
        await connection.close();
      } catch {
        // Best-effort close; nothing to do if the adapter throws.
      }
    } catch (error) {
      throw new ManualPeerError(
        "unreachable",
        address,
        port,
        error instanceof ConnectionError
          ? `Manual peer ${address}:${port} is unreachable (${error.code})`
          : `Manual peer ${address}:${port} is unreachable`,
        error,
      );
    }

    // Cancel any previous refresh timer for this id before re-arming.
    const existing = this.records.get(device.device_id);
    if (existing !== undefined) {
      this.scheduler.clearInterval(existing.timer);
    }

    // Feed into DeviceManager (add or update) and arm the refresh timer so
    // its heartbeat-timeout doesn't evict the peer.
    this.deviceManager.addOrUpdate(device);
    const timer = this.scheduler.setInterval(() => {
      const stored = this.records.get(device.device_id);
      if (stored === undefined) return; // removed between ticks
      const refreshed: Device = { ...stored.device, last_seen_at: this.now() };
      stored.device = refreshed;
      this.deviceManager.addOrUpdate(refreshed);
    }, this.refreshIntervalMs);

    this.records.set(device.device_id, { device, timer });
    return device;
  }

  /**
   * Removes a manual peer by device id (as returned from {@link addPeer}).
   * Cancels the refresh timer and forwards to `DeviceManager.remove`. A no-op
   * when the id is unknown.
   */
  removePeer(deviceId: string): void {
    const record = this.records.get(deviceId);
    if (record === undefined) return;
    this.scheduler.clearInterval(record.timer);
    this.records.delete(deviceId);
    this.deviceManager.remove(deviceId);
  }

  /**
   * Returns a snapshot of every currently-registered manual peer. Shallow
   * copies — callers may mutate the array but not the devices.
   */
  getPeers(): Device[] {
    return Array.from(this.records.values(), (record) => record.device);
  }

  /** True once {@link stop} has been called. */
  isStopped(): boolean {
    return this.stopped;
  }

  /**
   * Cancels every refresh timer and removes every registered peer from
   * `DeviceManager`. Idempotent.
   */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    for (const [deviceId, record] of this.records) {
      this.scheduler.clearInterval(record.timer);
      this.deviceManager.remove(deviceId);
    }
    this.records.clear();
  }
}
