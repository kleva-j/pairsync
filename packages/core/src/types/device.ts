/** Runtime platforms a PairSync device can run on. */
export type Platform =
  | "ios"
  | "android"
  | "macos"
  | "windows"
  | "linux"
  | "web"
  | "unknown";

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
