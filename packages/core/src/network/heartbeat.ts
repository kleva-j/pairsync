import { z } from "zod";

import { HEARTBEAT_INTERVAL, HEARTBEAT_TIMEOUT } from "../constants";
import { MESSAGE_TYPES } from "../protocol";
import { assertPositive } from "../utils";
import { PLATFORM_VALUES } from "../types";
import type { HeartbeatPayload } from "../types";

/**
 * Heartbeat protocol logic (Phase 1.6, N-244).
 *
 * Devices announce presence over UDP with a heartbeat JSON payload every
 * `HEARTBEAT_INTERVAL`; receivers drop devices that go silent for
 * `HEARTBEAT_TIMEOUT` (`MISSED_HEARTBEATS_LIMIT` missed × `HEARTBEAT_INTERVAL`).
 * The expiry logic is timestamp-based and never touches platform timers
 * directly — the discovery actor feeds `now` (from whichever timer primitive
 * the platform provides), so this module works identically on iOS, Android,
 * and desktop.
 */

/** Wire format: the heartbeat payload plus its message-type discriminator. */
export type HeartbeatMessage = HeartbeatPayload & { type: typeof MESSAGE_TYPES.HEARTBEAT };

/** Zod schema validating a heartbeat datagram. */
export const heartbeatSchema = z.object({
  type: z.literal(MESSAGE_TYPES.HEARTBEAT),
  device_id: z.string().min(1),
  alias: z.string(),
  platform: z.enum(PLATFORM_VALUES),
  interfaces: z.array(
    z.object({
      type: z.enum(["Wi-Fi", "Ethernet", "Cellular", "Other"]),
      ipv4: z.array(z.ipv4()),
      ipv6: z.array(z.ipv6()),
      preferred: z.boolean(),
    }),
  ),
  port: z.number().int().min(1).max(65_535),
  cert_fingerprint: z.string().optional(),
});

/** Thrown when a received datagram is not a valid heartbeat. */
export class HeartbeatParseError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "HeartbeatParseError";
  }
}

function describeZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? ` at ${issue.path.join(".")}` : "";
      return `${issue.message}${path}`;
    })
    .join("; ");
}

/**
 * Builds the wire JSON for a heartbeat. `port` should be the discovery port
 * (`DISCOVERY_PORT`) the sender listens on. `cert_fingerprint` is optional
 * and currently unused (TLS isn't shipped yet): it is serialized only when
 * the sender provides it.
 */
export function buildHeartbeat(payload: HeartbeatPayload): string {
  // Discriminator last so a runtime payload can never override the wire type.
  return JSON.stringify({ ...payload, type: MESSAGE_TYPES.HEARTBEAT });
}

/** Parses and validates a received heartbeat datagram. */
export function parseHeartbeat(json: string): HeartbeatMessage {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new HeartbeatParseError("Invalid heartbeat payload: not valid JSON");
  }

  const result = heartbeatSchema.safeParse(raw);
  if (!result.success) {
    throw new HeartbeatParseError(
      `Invalid heartbeat payload: ${describeZodIssues(result.error)}`,
      result.error,
    );
  }
  return result.data;
}

/** Missed heartbeat intervals elapsed since `lastSeenAt` (0 when fresh). */
export function missedHeartbeats(
  lastSeenAt: number,
  now: number,
  interval: number = HEARTBEAT_INTERVAL,
): number {
  assertPositive("interval", interval);
  const elapsed = now - lastSeenAt;
  return elapsed <= 0 ? 0 : Math.floor(elapsed / interval);
}

/** True when `now - lastSeenAt` has reached the device-removal timeout. */
export function isHeartbeatStale(
  lastSeenAt: number,
  now: number,
  timeout: number = HEARTBEAT_TIMEOUT,
): boolean {
  assertPositive("timeout", timeout);
  return now - lastSeenAt >= timeout;
}

/** Options for {@link HeartbeatTracker}; all optional for platform defaults. */
export interface HeartbeatTrackerOptions {
  /** Missed-heartbeat window before expiry (default `HEARTBEAT_TIMEOUT`). */
  timeout?: number;
  /** Heartbeat interval used for missed-count math (default `HEARTBEAT_INTERVAL`). */
  interval?: number;
  /** Injectable clock for tests (default `Date.now`). */
  now?: () => number;
}

/**
 * Tracks per-device last-seen times and expiry. Platform-agnostic: callers
 * invoke `record()` on each received heartbeat and sweep `expired()` on their
 * own schedule (e.g. every `HEARTBEAT_INTERVAL`), feeding the resulting ids
 * to the discovery machine's `DEVICE_EXPIRED` event.
 */
export class HeartbeatTracker {
  private readonly seen = new Map<string, number>();
  private readonly timeout: number;
  private readonly interval: number;
  private readonly now: () => number;

  constructor(options: HeartbeatTrackerOptions = {}) {
    this.timeout = options.timeout ?? HEARTBEAT_TIMEOUT;
    this.interval = options.interval ?? HEARTBEAT_INTERVAL;
    assertPositive("timeout", this.timeout);
    assertPositive("interval", this.interval);
    this.now = options.now ?? (() => Date.now());
  }

  /** Number of tracked devices. */
  get size(): number {
    return this.seen.size;
  }

  /** Records a heartbeat for `deviceId` at the current clock time. */
  record(deviceId: string): void {
    this.seen.set(deviceId, this.now());
  }

  /** Epoch ms of the last heartbeat for `deviceId`, or undefined if unknown. */
  lastSeen(deviceId: string): number | undefined {
    return this.seen.get(deviceId);
  }

  /** Missed heartbeat count for `deviceId`, or undefined if unknown. */
  missed(deviceId: string): number | undefined {
    const lastSeen = this.seen.get(deviceId);
    return lastSeen === undefined ? undefined : missedHeartbeats(lastSeen, this.now(), this.interval);
  }

  /** True when the device has been silent for at least the configured `timeout`. */
  isExpired(deviceId: string): boolean {
    const lastSeen = this.seen.get(deviceId);
    return lastSeen !== undefined && isHeartbeatStale(lastSeen, this.now(), this.timeout);
  }

  /** Device ids that have crossed the timeout at the current clock time. */
  expired(): string[] {
    const now = this.now();
    const expired: string[] = [];
    for (const [deviceId, lastSeen] of this.seen) {
      if (isHeartbeatStale(lastSeen, now, this.timeout)) {
        expired.push(deviceId);
      }
    }
    return expired;
  }

  /** Drops a single device (e.g. after its `DEVICE_EXPIRED` event is handled). */
  clear(deviceId: string): void {
    this.seen.delete(deviceId);
  }

  /** Drops every tracked device (e.g. on scan stop). */
  clearAll(): void {
    this.seen.clear();
  }
}
