import { HEARTBEAT_TIMEOUT } from "../constants";
import type { Device } from "../types";

/** Options for {@link DeviceManager}. All optional. */
export interface DeviceManagerOptions {
  /** Timeout in ms before an un-renewed device is removed (default `HEARTBEAT_TIMEOUT`). */
  timeoutMs?: number;
  /** Called when a new device_id is added to the list. */
  onDeviceAdded?: (device: Device) => void;
  /** Called when an existing device's metadata is updated. */
  onDeviceUpdated?: (device: Device) => void;
  /** Called when a device is removed (timeout or explicit). */
  onDeviceRemoved?: (deviceId: string) => void;
}

/**
 * Maintains the canonical in-memory device list discovered via UDP/mDNS.
 *
 * Each device is keyed by `device_id` (deduplication). When a device is
 * added or updated, a timeout timer is (re)armed; if the device is not
 * re-discovered before the timer fires, it is removed and
 * `onDeviceRemoved` is called. Explicit removal via `remove()` cancels
 * the timer and also fires `onDeviceRemoved`.
 *
 * Discovery engines call `addOrUpdate()` from their `onDeviceSeen`
 * callback; the mDNS engine additionally calls `remove()` from its
 * `onDeviceLost` callback.
 */
export class DeviceManager {
  private readonly devices = new Map<string, Device>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly timeoutMs: number;
  private readonly onDeviceAdded?: (device: Device) => void;
  private readonly onDeviceUpdated?: (device: Device) => void;
  private readonly onDeviceRemoved?: (deviceId: string) => void;

  constructor(options: DeviceManagerOptions = {}) {
    if (options.timeoutMs !== undefined) {
      if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
        throw new RangeError(
          `timeoutMs must be a positive finite number, got ${options.timeoutMs}`,
        );
      }
    }
    this.timeoutMs = options.timeoutMs ?? HEARTBEAT_TIMEOUT;
    this.onDeviceAdded = options.onDeviceAdded;
    this.onDeviceUpdated = options.onDeviceUpdated;
    this.onDeviceRemoved = options.onDeviceRemoved;
  }

  /** Number of tracked devices. */
  get size(): number {
    return this.devices.size;
  }

  /**
   * Adds a new device or updates an existing one (keyed by `device_id`).
   * Returns `true` if the device was added or its meaningful fields changed
   * (i.e. `onDeviceAdded` or `onDeviceUpdated` was fired), `false` if the
   * update was a no-op (only `last_seen_at` or identical data).
   */
  addOrUpdate(device: Device): boolean {
    const existing = this.devices.get(device.device_id);

    if (existing === undefined) {
      // New device
      this.devices.set(device.device_id, device);
      this.armTimer(device.device_id);
      this.onDeviceAdded?.(device);
      return true;
    }

    // Check if any meaningful field changed (skip last_seen_at — it always changes)
    if (this.isMeaningfullyDifferent(existing, device)) {
      // Preserve the original last_seen_at from the existing record if the
      // incoming device doesn't set it, so we don't confuse callers with
      // stale timestamps.
      const updated: Device = {
        ...device,
        last_seen_at: device.last_seen_at ?? existing.last_seen_at,
      };
      this.devices.set(device.device_id, updated);
      this.armTimer(device.device_id);
      this.onDeviceUpdated?.(updated);
      return true;
    }

    // Only last_seen_at or identical data — re-arm the timer and replace the
    // stored object so callers always get a fresh reference (no in-place mutation).
    this.devices.set(device.device_id, {
      ...existing,
      last_seen_at: device.last_seen_at ?? existing.last_seen_at,
    });
    this.armTimer(device.device_id);
    return false;
  }

  /** Removes a device by id. Fires `onDeviceRemoved` if the device existed. */
  remove(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (device === undefined) return;
    this.devices.delete(deviceId);
    this.cancelTimer(deviceId);
    this.onDeviceRemoved?.(deviceId);
  }

  /** Returns all currently tracked devices (shallow copy). */
  getDevices(): Device[] {
    return Array.from(this.devices.values());
  }

  /** Returns a specific device, or `undefined` if unknown. */
  getDevice(deviceId: string): Device | undefined {
    return this.devices.get(deviceId);
  }

  /** Removes all devices and cancels all pending timers. */
  clear(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    const ids = Array.from(this.devices.keys());
    this.devices.clear();
    for (const id of ids) {
      this.onDeviceRemoved?.(id);
    }
  }

  // ── Private ───────────────────────────────────────────────────────

  /** (Re)arms the expiry timer for `deviceId`. */
  private armTimer(deviceId: string): void {
    this.cancelTimer(deviceId);
    this.timers.set(
      deviceId,
      setTimeout(() => {
        // Delete the handle first so a re-entrant addOrUpdate (triggered by
        // onDeviceRemoved below) arms a fresh timer without confusion.
        this.timers.delete(deviceId);
        // Only remove if still tracked (a concurrent remove/clear may have
        // run before this callback).
        if (this.devices.has(deviceId)) {
          this.devices.delete(deviceId);
          this.onDeviceRemoved?.(deviceId);
        }
      }, this.timeoutMs),
    );
  }

  /** Cancels a pending timer without removing the device. */
  private cancelTimer(deviceId: string): void {
    const timer = this.timers.get(deviceId);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(deviceId);
    }
  }

  /**
   * Checks whether `incoming` has any meaningful field difference compared
   * to `existing`. `last_seen_at` is excluded — it always changes and is
   * not meaningful for update detection.
   */
  private isMeaningfullyDifferent(existing: Device, incoming: Device): boolean {
    return (
      existing.alias !== incoming.alias ||
      existing.platform !== incoming.platform ||
      existing.port !== incoming.port ||
      existing.cert_fingerprint !== incoming.cert_fingerprint ||
      JSON.stringify(existing.interfaces) !==
        JSON.stringify(incoming.interfaces)
    );
  }
}
