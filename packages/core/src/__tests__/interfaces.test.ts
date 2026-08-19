import { describe, expect, it } from "vitest";

import type { NetworkInterface } from "../types";
import {
  connectionBackoffDelay,
  filterInterfacesForAdvertisement,
  isLocalAddress,
  isLoopbackAddress,
  selectConnectionCandidates,
  selectInterface,
} from "../network";

const wifiV4 = (ipv4: string[] = ["192.168.1.10"], ipv6: string[] = []): NetworkInterface => ({
  type: "Wi-Fi",
  ipv4,
  ipv6,
  preferred: true,
});

const wifiV6 = (ipv6: string[] = ["fe80::10"]): NetworkInterface => ({
  type: "Wi-Fi",
  ipv4: [],
  ipv6,
  preferred: true,
});

const ethV4 = (ipv4: string[] = ["192.168.1.11"]): NetworkInterface => ({
  type: "Ethernet",
  ipv4,
  ipv6: [],
  preferred: false,
});

const ethV6 = (ipv6: string[] = ["fe80::11"]): NetworkInterface => ({
  type: "Ethernet",
  ipv4: [],
  ipv6,
  preferred: false,
});

describe("isLoopbackAddress", () => {
  it("detects IPv4 loopback", () => {
    expect(isLoopbackAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("127.255.255.255")).toBe(true);
    expect(isLoopbackAddress("128.0.0.1")).toBe(false);
  });

  it("detects IPv6 loopback", () => {
    expect(isLoopbackAddress("::1")).toBe(true);
    expect(isLoopbackAddress("0:0:0:0:0:0:0:1")).toBe(true);
    expect(isLoopbackAddress("fe80::1")).toBe(false);
  });

  it("treats malformed input as non-loopback", () => {
    expect(isLoopbackAddress("not-an-ip")).toBe(false);
    expect(isLoopbackAddress("")).toBe(false);
  });
});

describe("isLocalAddress", () => {
  it("accepts RFC1918 private IPv4", () => {
    expect(isLocalAddress("10.0.0.1")).toBe(true);
    expect(isLocalAddress("10.255.255.255")).toBe(true);
    expect(isLocalAddress("172.16.0.1")).toBe(true);
    expect(isLocalAddress("172.31.255.255")).toBe(true);
    expect(isLocalAddress("192.168.1.10")).toBe(true);
    expect(isLocalAddress("192.168.255.255")).toBe(true);
  });

  it("rejects non-RFC1918 IPv4", () => {
    expect(isLocalAddress("11.0.0.1")).toBe(false);
    expect(isLocalAddress("172.15.255.255")).toBe(false);
    expect(isLocalAddress("172.32.0.1")).toBe(false);
    expect(isLocalAddress("192.169.0.1")).toBe(false);
    expect(isLocalAddress("8.8.8.8")).toBe(false);
    expect(isLocalAddress("1.1.1.1")).toBe(false);
  });

  it("accepts IPv4 link-local (APIPA) as local", () => {
    expect(isLocalAddress("169.254.1.1")).toBe(true);
  });

  it("accepts IPv6 link-local and ULA, rejects global unicast", () => {
    expect(isLocalAddress("fe80::1")).toBe(true);
    expect(isLocalAddress("febf::1")).toBe(true);
    expect(isLocalAddress("fc00::1")).toBe(true);
    expect(isLocalAddress("fd00::1")).toBe(true);
    expect(isLocalAddress("2001:db8::1")).toBe(false);
    expect(isLocalAddress("2606:4700::1")).toBe(false);
    expect(isLocalAddress("fec0::1")).toBe(false);
  });

  it("rejects malformed IPv6 even with a local-looking prefix", () => {
    expect(isLocalAddress("fe80:not-an-ip")).toBe(false);
    expect(isLocalAddress("fc00::1::2")).toBe(false);
    expect(isLocalAddress("fe80")).toBe(false);
    expect(isLocalAddress("fe80::")).toBe(true);
  });

  it("rejects loopback and malformed input as non-local", () => {
    expect(isLocalAddress("127.0.0.1")).toBe(false);
    expect(isLocalAddress("::1")).toBe(false);
    expect(isLocalAddress("not-an-ip")).toBe(false);
  });

  it("handles scoped IPv6 zone IDs as their base address", () => {
    expect(isLocalAddress("fe80::1%en0")).toBe(true);
  });

  it("rejects mapped-IPv6 and carrier-grade NAT as non-local", () => {
    // An IPv4-mapped address parses as IPv6 (`ipv4Mapped` range); even a
    // mapped RFC1918 address is not a directly reachable local endpoint.
    expect(isLocalAddress("::ffff:192.168.1.1")).toBe(false);
    // 100.64.0.0/10 (RFC 6598) is shared, not private.
    expect(isLocalAddress("100.64.0.2")).toBe(false);
    expect(isLocalAddress("100.127.255.254")).toBe(false);
  });
});

describe("selectConnectionCandidates", () => {
  it("ranks Wi-Fi IPv4 above Wi-Fi IPv6 above Ethernet IPv4 above Ethernet IPv6", () => {
    const candidates = selectConnectionCandidates([ethV6(), wifiV4(), ethV4(), wifiV6()]);
    expect(candidates.map((c) => `${c.interface.type}:${c.family}:${c.address}`)).toEqual([
      "Wi-Fi:ipv4:192.168.1.10",
      "Wi-Fi:ipv6:fe80::10",
      "Ethernet:ipv4:192.168.1.11",
      "Ethernet:ipv6:fe80::11",
    ]);
    expect(candidates.map((c) => c.priority)).toEqual([0, 1, 2, 3]);
  });

  it("places Cellular and Other after Ethernet", () => {
    const candidates = selectConnectionCandidates([
      { type: "Cellular", ipv4: ["10.0.0.2"], ipv6: [], preferred: false },
      { type: "Other", ipv4: ["10.0.0.3"], ipv6: [], preferred: false },
    ]);
    expect(candidates.map((c) => `${c.interface.type}:${c.family}`)).toEqual([
      "Cellular:ipv4",
      "Other:ipv4",
    ]);
  });

  it("emits one candidate per usable address, stable within an interface", () => {
    const candidates = selectConnectionCandidates([wifiV4(["192.168.1.10", "192.168.1.11"])]);
    expect(candidates.map((c) => c.address)).toEqual(["192.168.1.10", "192.168.1.11"]);
    expect(candidates.every((c) => c.interfaceIndex === 0)).toBe(true);
  });

  it("never yields a candidate from loopback, public, or malformed addresses", () => {
    const candidates = selectConnectionCandidates([
      wifiV4(["127.0.0.1", "8.8.8.8", "not-an-ip"]),
      ethV4(["192.168.1.5"]),
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.address).toBe("192.168.1.5");
  });

  it("yields nothing from a preferred-but-addressless interface", () => {
    const candidates = selectConnectionCandidates([wifiV4([], [])]);
    expect(candidates).toEqual([]);
    expect(selectInterface([wifiV4([], [])])).toBeNull();
  });

  it("handles an empty input", () => {
    expect(selectConnectionCandidates([])).toEqual([]);
    expect(selectInterface([])).toBeNull();
  });

  it("selectInterface returns the highest-priority endpoint", () => {
    const best = selectInterface([ethV4(), wifiV4(), wifiV6()]);
    expect(best?.address).toBe("192.168.1.10");
    expect(best?.family).toBe("ipv4");
    expect(best?.priority).toBe(0);
  });
});

describe("filterInterfacesForAdvertisement", () => {
  it("drops VPN and loopback adapter names", () => {
    const filtered = filterInterfacesForAdvertisement([
      { name: "en0", type: "Wi-Fi", ipv4: ["192.168.1.10"], ipv6: [], preferred: true },
      { name: "tun0", type: "Other", ipv4: ["10.8.0.2"], ipv6: [], preferred: false },
      { name: "ppp0", type: "Other", ipv4: ["10.64.0.2"], ipv6: [], preferred: false },
      { name: "utun3", type: "Other", ipv4: ["100.64.0.2"], ipv6: [], preferred: false },
      { name: "wg0", type: "Other", ipv4: ["10.0.0.9"], ipv6: [], preferred: false },
      { name: "lo0", type: "Other", ipv4: ["127.0.0.1"], ipv6: ["::1"], preferred: false },
    ]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toEqual({
      type: "Wi-Fi",
      ipv4: ["192.168.1.10"],
      ipv6: [],
      preferred: true,
    });
  });

  it("strips non-local addresses but keeps the interface", () => {
    const filtered = filterInterfacesForAdvertisement([
      {
        name: "en0",
        type: "Wi-Fi",
        ipv4: ["192.168.1.10", "8.8.8.8", "127.0.0.1"],
        ipv6: ["fe80::10", "2001:db8::1", "::1"],
        preferred: true,
      },
    ]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toEqual({
      type: "Wi-Fi",
      ipv4: ["192.168.1.10"],
      ipv6: ["fe80::10"],
      preferred: true,
    });
  });

  it("drops interfaces left without any usable address", () => {
    const filtered = filterInterfacesForAdvertisement([
      { name: "en1", type: "Ethernet", ipv4: ["8.8.8.8"], ipv6: [], preferred: false },
      { name: "en2", type: "Ethernet", ipv4: [], ipv6: [], preferred: false },
    ]);
    expect(filtered).toEqual([]);
  });
});

describe("connectionBackoffDelay", () => {
  it("follows the 1s, 2s, 4s schedule", () => {
    expect(connectionBackoffDelay(0)).toBe(1_000);
    expect(connectionBackoffDelay(1)).toBe(2_000);
    expect(connectionBackoffDelay(2)).toBe(4_000);
    expect(connectionBackoffDelay(3)).toBe(8_000);
  });

  it("honors a custom base delay", () => {
    expect(connectionBackoffDelay(0, 500)).toBe(500);
    expect(connectionBackoffDelay(1, 500)).toBe(1_000);
    expect(connectionBackoffDelay(2, 500)).toBe(2_000);
  });

  it("rejects invalid attempts and base delays", () => {
    expect(() => connectionBackoffDelay(-1)).toThrow(RangeError);
    expect(() => connectionBackoffDelay(0.5)).toThrow(RangeError);
    expect(() => connectionBackoffDelay(Number.NaN)).toThrow(RangeError);
    expect(() => connectionBackoffDelay(0, 0)).toThrow(RangeError);
    expect(() => connectionBackoffDelay(0, -1)).toThrow(RangeError);
  });

  it("rejects attempts whose delay overflows a finite number", () => {
    expect(() => connectionBackoffDelay(1024)).toThrow(RangeError);
    expect(Number.isFinite(connectionBackoffDelay(1023, 1))).toBe(true);
  });
});
