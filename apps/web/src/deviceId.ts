/**
 * Persistent desktop device identifier.
 *
 * `device_id` is used by the discovery layer to deduplicate peers. If it changed
 * on every reload, other devices would see this desktop as a new peer each time
 * (and take up to `HEARTBEAT_TIMEOUT` to expire the old entry). This module
 * persists a collision-resistant id in `localStorage` and reuses it across
 * reloads.
 */

export const DEVICE_ID_STORAGE_KEY = "pairsync.deviceId";

/**
 * Accepts both the current UUID format and the legacy numeric format so
 * existing installations don't regenerate their id on upgrade.
 */
const VALID_ID_PATTERN =
  /^dev-(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+)$/i;

/** Minimal `localStorage`-shaped contract so the caller can inject a fake in tests. */
export interface DeviceIdStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface GetDesktopDeviceIdOptions {
  /** Defaults to `globalThis.localStorage`. Inject a Map-backed fake in tests. */
  storage?: DeviceIdStorage;
  /** Defaults to `crypto.randomUUID`. Inject a deterministic value in tests. */
  randomUUID?: () => string;
}

/**
 * Returns the desktop's stable `device_id`, generating and persisting a new
 * one if none is stored (or the stored value is malformed).
 *
 * Falls back to an ephemeral id if storage access throws — the desktop will
 * look like a new device to peers on the next reload, but discovery still
 * starts.
 */
export function getDesktopDeviceId(
  options: GetDesktopDeviceIdOptions = {},
): string {
  const randomUUID = options.randomUUID ?? (() => crypto.randomUUID());
  const storage = options.storage ?? getDefaultStorage();

  try {
    if (storage === undefined) throw new Error("storage unavailable");
    const stored = storage.getItem(DEVICE_ID_STORAGE_KEY);
    if (stored !== null && VALID_ID_PATTERN.test(stored)) {
      return stored;
    }
    const newId = `dev-${randomUUID()}`;
    storage.setItem(DEVICE_ID_STORAGE_KEY, newId);
    return newId;
  } catch {
    // Storage unavailable (private mode, quota, disabled, or thrown by the
    // caller-supplied fake). Fall back to an ephemeral id.
    return `dev-${randomUUID()}`;
  }
}

function getDefaultStorage(): DeviceIdStorage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
