import ipaddr from "ipaddr.js";

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
 * Address locality is classified with ipaddr.js's `range()`: IPv4 is local
 * when `private` (RFC1918 10/8, 172.16/12, 192.168/16) or `linkLocal`
 * (APIPA 169.254/16); IPv6 is local when `linkLocal` (fe80::/10) or
 * `uniqueLocal` (ULA fc00::/7). Loopback (127/8, ::1) and every other range
 * (public/global, carrier-grade NAT, IPv4-mapped IPv6, deprecated
 * site-local, documentation, …) are never usable for direct LAN
 * connections. Scoped IPv6 (zone IDs like "%en0") is classified by its base
 * address and normalized to the plain form before it is advertised or
 * selected, because a scope is only meaningful on the host that owns it.
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

/** `ipaddr.js` range labels usable on a local network. */
const LOCAL_RANGES = new Set(["private", "linkLocal", "uniqueLocal"]);

/**
 * Parses an address with ipaddr.js, returning null for anything malformed.
 * ipaddr.js 2.x carries IPv6 zone IDs (RFC 4007) on the parsed object (e.g.
 * "fe80::1%en0" parses with `zoneId === "en0"`), so scoped addresses are
 * handled without pre-stripping.
 */
function parseIp(ip: string): ipaddr.IPv4 | ipaddr.IPv6 | null {
  try {
    return ipaddr.parse(ip);
  } catch {
    return null;
  }
}

/** True for loopback addresses (127/8, ::1) — never usable for connections. */
export function isLoopbackAddress(ip: string): boolean {
  return parseIp(ip)?.range() === "loopback";
}

/**
 * True for addresses usable on a local network: RFC1918 or APIPA IPv4, and
 * link-local or ULA IPv6. Loopback, public/global, mapped, and malformed
 * addresses are not local.
 */
export function isLocalAddress(ip: string): boolean {
  const addr = parseIp(ip);
  return addr !== null && LOCAL_RANGES.has(addr.range());
}

/**
 * Canonical form of an address, or null when malformed. IPv6 zone IDs
 * (RFC 4007, e.g. "%en0") are stripped — a scope only identifies an
 * interface on the *sender's* host, so it must never be advertised or used
 * as a connection endpoint.
 */
export function normalizeAddress(ip: string): string | null {
  const addr = parseIp(ip);
  if (addr === null) {
    return null;
  }
  if ("zoneId" in addr) {
    addr.zoneId = undefined;
  }
  return addr.toString();
}

/** Local addresses in canonical plain form (zone IDs stripped). */
function localAddresses(ips: string[]): string[] {
  return ips
    .filter(isLocalAddress)
    .map(normalizeAddress)
    .filter((ip): ip is string => ip !== null);
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
      ipv4: localAddresses(iface.ipv4),
      ipv6: localAddresses(iface.ipv6),
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
    localAddresses(iface.ipv4).forEach((address) => {
      candidates.push({
        interfaceIndex,
        interface: iface,
        family: "ipv4",
        address,
        priority: INTERFACE_TYPE_PRIORITY[iface.type] * 2 + ADDRESS_FAMILY_PRIORITY.ipv4,
      });
    });
    localAddresses(iface.ipv6).forEach((address) => {
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
