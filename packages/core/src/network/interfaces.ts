import { z } from "zod";

import { assertPositive } from "../utils";
import type { NetworkInterface } from "../types";

/**
 * Interface selection logic (Phase 1.7, N-245).
 *
 * Two concerns live here:
 *
 * 1. **Advertise side** — `filterInterfacesForAdvertisement` cleans up a
 *    platform's locally-detected interfaces (VPN/loopback adapters and
 *    non-local addresses dropped) before they are put in a heartbeat. The
 *    platform-specific enumeration itself is abstracted behind
 *    {@link InterfaceDetector}; each app implements it (Tauri Rust plugin,
 *    react-native-netinfo, …) and feeds the result through the filter.
 *
 * 2. **Select side** — `selectConnectionCandidates` ranks a *received*
 *    device's advertised interfaces and returns the ordered endpoints to
 *    try: Wi-Fi IPv4 > Wi-Fi IPv6 > Ethernet IPv4 > Ethernet IPv6 >
 *    Cellular > Other. The connection actor tries the first candidate and,
 *    on failure, waits `connectionBackoffDelay(n)` (1s, 2s, 4s, …) before
 *    the next; when the list is exhausted it marks the device unreachable
 *    (a `Device` state transition owned by the actor).
 *
 * Address locality: IPv4 is local when RFC1918 (10/8, 172.16/12,
 * 192.168/16) or link-local APIPA (169.254/16); IPv6 is local when
 * link-local (fe80::/10) or ULA (fc00::/7). Loopback (127/8, ::1) and
 * public/global addresses are never usable for direct LAN connections.
 */

/** Local adapter detected on the host, before advertisement filtering. */
export interface DetectedInterface extends NetworkInterface {
  /** OS adapter name (e.g. "en0", "wlan0", "tun0", "lo0"). */
  name: string;
}

/** Abstraction over platform-specific network enumeration. */
export interface InterfaceDetector {
  /** Enumerates local interfaces (with adapter names) for advertisement. */
  detectLocalInterfaces(): Promise<DetectedInterface[]>;
}

/** Address family used for a connection endpoint. */
export type AddressFamily = "ipv4" | "ipv6";

/** One concrete endpoint (interface + address) to try when connecting. */
export interface SelectedEndpoint {
  /** Index of the interface within the input `interfaces` array. */
  interfaceIndex: number;
  /** The interface the endpoint belongs to. */
  interface: NetworkInterface;
  family: AddressFamily;
  address: string;
  /** Lower is higher priority (0 = best). */
  priority: number;
}

/** Interface type priority: lower is tried first. */
export const INTERFACE_TYPE_PRIORITY = Object.freeze({
  "Wi-Fi": 0,
  Ethernet: 1,
  Cellular: 2,
  Other: 3,
} as const);

/** Address family priority within an interface: IPv4 before IPv6. */
export const ADDRESS_FAMILY_PRIORITY = Object.freeze({
  ipv4: 0,
  ipv6: 1,
} as const);

/** Adapter names never advertised or selected (VPN tunnels, loopback). */
const EXCLUDED_INTERFACE_NAMES = /^(lo|tun|tap|ppp|utun|wg|ipsec|vpn)\d*$/i;

function parseIpv4(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => {
    if (!/^\d{1,3}$/.test(part)) return Number.NaN;
    const n = Number(part);
    return n <= 255 ? n : Number.NaN;
  });
  return octets.every((n) => Number.isInteger(n) && n >= 0) ? octets : null;
}

/** First IPv6 hextet (0 for addresses starting with "::"), or null if malformed. */
function firstHextet(ip: string): number | null {
  const beforeColon = ip.split("%")[0]!.split(":")[0]!;
  if (beforeColon === "") return 0;
  if (!/^[0-9a-fA-F]{1,4}$/.test(beforeColon)) return null;
  return Number.parseInt(beforeColon, 16);
}

/** True for loopback addresses (127/8, ::1) — never usable for connections. */
export function isLoopbackAddress(ip: string): boolean {
  const v4 = parseIpv4(ip);
  if (v4 !== null) return v4[0] === 127;
  const cleaned = ip.split("%")[0]!;
  return cleaned === "::1" || cleaned === "0:0:0:0:0:0:0:1";
}

/**
 * True for addresses usable on a local network: RFC1918 or APIPA IPv4, and
 * link-local or ULA IPv6. Loopback, public/global, and malformed addresses
 * are not local.
 */
export function isLocalAddress(ip: string): boolean {
  if (isLoopbackAddress(ip)) return false;
  const v4 = parseIpv4(ip);
  if (v4 !== null) {
    const [a, b] = v4;
    return (
      a === 10 ||
      (a === 172 && b! >= 16 && b! <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    );
  }
  // Must be a real IPv6 address first — a local-looking prefix alone (e.g.
  // "fe80:garbage" or "fc00::1::2") is not reachable.
  if (!z.ipv6().safeParse(ip).success) return false;
  const hextet = firstHextet(ip);
  if (hextet === null) return false;
  // link-local fe80::/10 | ULA fc00::/7
  return (hextet & 0xffc0) === 0xfe80 || (hextet & 0xfe00) === 0xfc00;
}

/**
 * Cleans locally-detected interfaces for advertisement: drops VPN/loopback
 * adapter names, strips non-local addresses, and drops interfaces left
 * without any usable address. Returns the wire-safe shape — OS adapter
 * names are never advertised.
 */
export function filterInterfacesForAdvertisement(
  interfaces: DetectedInterface[],
): NetworkInterface[] {
  return interfaces
    .filter((iface) => !EXCLUDED_INTERFACE_NAMES.test(iface.name))
    .map((iface) => ({
      type: iface.type,
      ipv4: iface.ipv4.filter(isLocalAddress),
      ipv6: iface.ipv6.filter(isLocalAddress),
      preferred: iface.preferred,
    }))
    .filter((iface) => iface.ipv4.length > 0 || iface.ipv6.length > 0);
}

/**
 * Orders a received device's interfaces into connection candidates, best
 * first. Non-local (loopback/public/malformed) addresses are never selected.
 */
export function selectConnectionCandidates(
  interfaces: NetworkInterface[],
): SelectedEndpoint[] {
  const candidates: SelectedEndpoint[] = [];
  interfaces.forEach((iface, interfaceIndex) => {
    iface.ipv4.filter(isLocalAddress).forEach((address) => {
      candidates.push({
        interfaceIndex,
        interface: iface,
        family: "ipv4",
        address,
        priority: INTERFACE_TYPE_PRIORITY[iface.type] * 2 + ADDRESS_FAMILY_PRIORITY.ipv4,
      });
    });
    iface.ipv6.filter(isLocalAddress).forEach((address) => {
      candidates.push({
        interfaceIndex,
        interface: iface,
        family: "ipv6",
        address,
        priority: INTERFACE_TYPE_PRIORITY[iface.type] * 2 + ADDRESS_FAMILY_PRIORITY.ipv6,
      });
    });
  });
  return candidates.sort(
    (a, b) => a.priority - b.priority || a.interfaceIndex - b.interfaceIndex,
  );
}

/** The single best endpoint for a device, or null when none is reachable. */
export function selectInterface(interfaces: NetworkInterface[]): SelectedEndpoint | null {
  return selectConnectionCandidates(interfaces)[0] ?? null;
}

/**
 * Delay before the (attempt+1)-th connection attempt, ms. `attempt` 0 → 1s,
 * 1 → 2s, 2 → 4s, … (2^attempt × base).
 */
export function connectionBackoffDelay(attempt: number, baseMs: number = 1_000): number {
  if (!Number.isInteger(attempt) || attempt < 0) {
    throw new RangeError(`attempt must be a non-negative integer, got ${attempt}`);
  }
  assertPositive("baseMs", baseMs);
  const delay = baseMs * 2 ** attempt;
  if (!Number.isFinite(delay)) {
    throw new RangeError(
      `attempt ${attempt} produces a non-finite delay; use a smaller attempt or baseMs`,
    );
  }
  return delay;
}
