import { describe, expect, it } from "vitest";

import type { MdnsService, MulticastSocket, TcpSocket } from "../discovery";
import {
  PlatformNetworkUnsupportedError,
  createPlatformNetwork,
} from "../platform";
import type { PlatformNetworkAdapter } from "../platform";

function multicastSocket(): MulticastSocket {
  return {
    bind: async () => {},
    onMessage: () => {},
    send: async () => {},
    joinGroup: async () => {},
    leaveGroup: async () => {},
    close: async () => {},
  };
}

function mdnsService(): MdnsService {
  return {
    advertise: async () => {},
    browse: async () => {},
    onServiceFound: () => {},
    onServiceLost: () => {},
    unpublish: async () => {},
    close: async () => {},
  };
}

function tcpSocket(): TcpSocket {
  return {
    connect: async () => {},
    send: async () => {},
    onData: () => {},
    close: async () => {},
  };
}

function adapter(runtime: "mobile" | "desktop"): PlatformNetworkAdapter {
  return {
    runtime,
    capabilities: { udp: true, mdns: true, tcp: true },
    createMulticastSocket: multicastSocket,
    createMdnsService: mdnsService,
    createTcpSocket: tcpSocket,
  };
}

describe("createPlatformNetwork", () => {
  it("selects the injected mobile adapter", () => {
    const mobile = adapter("mobile");
    expect(createPlatformNetwork({ mobile }, "mobile")).toBe(mobile);
  });

  it("selects the injected desktop adapter lazily", () => {
    const desktop = adapter("desktop");
    let called = false;
    const factory = () => {
      called = true;
      return desktop;
    };

    expect(createPlatformNetwork({ desktop: factory }, "desktop")).toBe(desktop);
    expect(called).toBe(true);
  });

  it("returns unsupported networking for browser web", async () => {
    const network = createPlatformNetwork({}, "web");

    expect(network.runtime).toBe("web");
    expect(network.capabilities).toEqual({ udp: false, mdns: false, tcp: false });
    await expect(network.createMulticastSocket().bind(53350)).rejects.toMatchObject({
      capability: "udp",
      runtime: "web",
    });
  });

  it("classifies unsupported node and unknown runtimes", async () => {
    await expect(
      createPlatformNetwork({}, "node").createTcpSocket().connect("127.0.0.1", 1),
    ).rejects.toBeInstanceOf(PlatformNetworkUnsupportedError);
    await expect(
      createPlatformNetwork({}, "unknown").createMdnsService().browse("_pairsync._tcp.local"),
    ).rejects.toMatchObject({ capability: "mdns", runtime: "unknown" });
  });
});
