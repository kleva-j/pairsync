import * as Application from "expo-application";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * Native `device_id` derived from device traits.
 *
 * Discovery deduplicates peers by `device_id`. Regenerating it on every reload
 * would make this device look new to peers each time (and take up to
 * `HEARTBEAT_TIMEOUT` to expire the old entry). Instead of persisting an id in
 * secure storage, we compose a small set of stable device traits (Android
 * hardware ID, iOS OS build + model + user-set device name) and hash them
 * into a compact fingerprint. Same device → same id across reloads.
 *
 * Fingerprint drift: on iOS, `osBuildId` changes with an OS update, so the
 * device will look new to peers once after each OS upgrade. Acceptable for
 * LAN peer discovery.
 *
 * Fallback: if no device-unique trait is available (broken simulator, all
 * fields null) or the native modules throw, an ephemeral random id is
 * returned so discovery still starts — the device just looks new on the
 * next reload, matching the previous behavior.
 */

const HEX_CHARS = "0123456789abcdef";

/** Fingerprint sources gathered from the host device. */
export interface DeviceIdSources {
  /** Android hardware ID (Settings.Secure.ANDROID_ID). Null on other platforms. */
  androidId: string | null;
  /** Native OS build identifier (iOS build number, Android build tag). */
  osBuildId: string | null;
  /** Hardware model identifier (e.g. "iPhone14,3"). */
  modelId: string | null;
  /** Human-readable model name (e.g. "iPhone 13 Pro"). */
  modelName: string | null;
  /** User-set device nickname (e.g. "John's iPhone"). */
  deviceName: string | null;
  /** react-native `Platform.OS`. */
  platformOS: string;
  /** react-native `Platform.Version`. */
  platformVersion: string | number;
}

export interface GetNativeDeviceIdOptions {
  /** Override the platform trait gatherer in tests. */
  sources?: () => Promise<DeviceIdSources>;
  /**
   * Override the fallback ephemeral-id generator in tests. Called only when
   * no device-unique trait is available or gathering throws. Returns the raw
   * suffix (without the `dev-` prefix).
   */
  random?: () => string;
}

/**
 * Returns a stable `device_id` derived from device traits. Same device →
 * same id across reloads; different devices on the same LAN → different
 * ids in the overwhelming majority of cases.
 *
 * Falls back to an ephemeral random id when no device-unique trait is
 * available or the trait gatherer throws.
 */
export async function getNativeDeviceId(
  options: GetNativeDeviceIdOptions = {},
): Promise<string> {
  const gather = options.sources ?? gatherPlatformSources;
  const random = options.random ?? defaultRandom;
  try {
    const sources = await gather();
    if (!hasDeviceUniqueSignal(sources)) {
      return `dev-${random()}`;
    }
    return `dev-${fnv1a64(composeFingerprint(sources))}`;
  } catch {
    return `dev-${random()}`;
  }
}

function hasDeviceUniqueSignal(s: DeviceIdSources): boolean {
  // Platform OS + version alone is not device-unique (every iOS 17 phone
  // collides). Require at least one hardware- or user-scoped signal.
  return Boolean(
    s.androidId || s.osBuildId || s.modelId || s.modelName || s.deviceName,
  );
}

function composeFingerprint(s: DeviceIdSources): string {
  // Order and key format are part of the id contract — changing either
  // invalidates every previously-generated fingerprint. The OS prefix keeps
  // an iPhone and an Android device with (unlikely) matching device names
  // from hashing to the same value.
  const parts: string[] = [`os:${s.platformOS}`, `v:${s.platformVersion}`];
  if (s.androidId) parts.push(`aid:${s.androidId}`);
  if (s.osBuildId) parts.push(`bid:${s.osBuildId}`);
  if (s.modelId) parts.push(`mid:${s.modelId}`);
  if (s.modelName) parts.push(`mn:${s.modelName}`);
  if (s.deviceName) parts.push(`dn:${s.deviceName}`);
  return parts.join("|");
}

/**
 * FNV-1a-64 over the UTF-16 code units of `input`. Not cryptographic; used
 * for a compact deterministic device fingerprint on a LAN. Collision
 * headroom (~4 billion at the birthday bound) is more than adequate for
 * dozens-to-hundreds of peers.
 */
function fnv1a64(input: string): string {
  const FNV_OFFSET = 0xcbf29ce484222325n;
  const FNV_PRIME = 0x100000001b3n;
  const MASK = 0xffffffffffffffffn;
  let hash = FNV_OFFSET;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * FNV_PRIME) & MASK;
  }
  return hash.toString(16).padStart(16, "0");
}

async function gatherPlatformSources(): Promise<DeviceIdSources> {
  // Some Android stubs return "" instead of null; treat empty as absent so
  // `hasDeviceUniqueSignal` doesn't count it as a real trait.
  const androidId =
    Platform.OS === "android"
      ? (Application.getAndroidId?.() ?? null) || null
      : null;
  return {
    androidId,
    osBuildId: Device.osBuildId ?? null,
    modelId: Device.modelId ?? null,
    modelName: Device.modelName ?? null,
    deviceName: Constants.deviceName ?? null,
    platformOS: Platform.OS,
    platformVersion: Platform.Version,
  };
}

function defaultRandom(): string {
  // 12 random hex chars — enough entropy to avoid collisions per session
  // when the fingerprint fallback path is taken. Not cryptographic.
  let out = "";
  for (let i = 0; i < 12; i++) {
    out += HEX_CHARS[Math.floor(Math.random() * 16)];
  }
  return out;
}
