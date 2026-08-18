/**
 * All valid runtime platform strings — the single source of truth for both
 * the {@link Platform} union and any runtime validators (Zod schemas, TXT
 * record parsers) that need to check against the full set.
 */
export const PLATFORM_VALUES = [
  "ios",
  "android",
  "macos",
  "windows",
  "linux",
  "web",
  "unknown",
] as const;

/** Runtime platforms a PairSync device can run on. */
export type Platform = (typeof PLATFORM_VALUES)[number];

/** A network interface advertised by a device in its heartbeat. */
export interface NetworkInterface {
  type: "Wi-Fi" | "Ethernet" | "Cellular" | "Other";
  ipv4: string[];
  ipv6: string[];
  preferred: boolean;
}

/** A device discovered on the local network. */
export interface Device {
  device_id: string;
  alias: string;
  platform: Platform;
  interfaces: NetworkInterface[];
  port: number;
  /** SHA-256 fingerprint of the sender's certificate (present once TLS lands). */
  cert_fingerprint?: string;
  /** Epoch ms of the last received heartbeat. */
  last_seen_at?: number;
}
