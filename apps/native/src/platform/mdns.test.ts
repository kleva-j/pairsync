import Zeroconf from "react-native-zeroconf";

import { ReactNativeMdnsService } from "./mdns";

jest.mock("react-native-zeroconf", () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      on: jest.fn().mockReturnThis(),
      publishService: jest.fn(),
      scan: jest.fn(),
      unpublishService: jest.fn(),
      stop: jest.fn(),
      removeDeviceListeners: jest.fn(),
    })),
  };
});

type FakeZeroconf = {
  on: jest.Mock;
  publishService: jest.Mock;
  scan: jest.Mock;
  unpublishService: jest.Mock;
  stop: jest.Mock;
  removeDeviceListeners: jest.Mock;
};

function makeZeroconf(): FakeZeroconf {
  return {
    on: jest.fn().mockReturnThis(),
    publishService: jest.fn(),
    scan: jest.fn(),
    unpublishService: jest.fn(),
    stop: jest.fn(),
    removeDeviceListeners: jest.fn(),
  };
}

describe("ReactNativeMdnsService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("subscribes to resolved and remove events on construction", () => {
    const zeroconf = makeZeroconf();
    jest.mocked(Zeroconf).mockImplementation(() => zeroconf as never);

    new ReactNativeMdnsService();

    expect(zeroconf.on).toHaveBeenCalledWith("resolved", expect.any(Function));
    expect(zeroconf.on).toHaveBeenCalledWith("remove", expect.any(Function));
  });

  it("advertises under the parsed type/protocol/domain", async () => {
    const zeroconf = makeZeroconf();
    jest.mocked(Zeroconf).mockImplementation(() => zeroconf as never);

    const service = new ReactNativeMdnsService();
    await service.advertise("_pairsync._tcp.local", "pairsync-d1", 53350, {
      device_id: "d1",
    });

    expect(zeroconf.publishService).toHaveBeenCalledWith(
      "pairsync",
      "tcp",
      "local.",
      "pairsync-d1",
      53350,
      { device_id: "d1" },
    );
  });

  it("scans for the service type when browsing", async () => {
    const zeroconf = makeZeroconf();
    jest.mocked(Zeroconf).mockImplementation(() => zeroconf as never);

    const service = new ReactNativeMdnsService();
    await service.browse("_pairsync._tcp.local");

    expect(zeroconf.scan).toHaveBeenCalledWith("pairsync", "tcp", "local.");
  });

  it("delivers found services with split IPv4/IPv6 addresses and string TXT", () => {
    const zeroconf = makeZeroconf();
    jest.mocked(Zeroconf).mockImplementation(() => zeroconf as never);

    const service = new ReactNativeMdnsService();
    const found: Array<unknown> = [];
    service.onServiceFound((s) => found.push(s));

    const resolvedHandler = zeroconf.on.mock.calls.find(
      (call: [string, unknown]) => call[0] === "resolved",
    )?.[1] as (service: Record<string, unknown>) => void;

    resolvedHandler({
      name: "pairsync-peer",
      port: 53350,
      addresses: ["192.168.1.9", "fe80::9"],
      txt: { device_id: "peer-1", alias: "Peer", count: 42 },
    });

    expect(found).toEqual([
      {
        name: "pairsync-peer",
        ipv4: ["192.168.1.9"],
        ipv6: ["fe80::9"],
        port: 53350,
        txt: { device_id: "peer-1", alias: "Peer", count: "42" },
      },
    ]);
  });

  it("delivers lost service names", () => {
    const zeroconf = makeZeroconf();
    jest.mocked(Zeroconf).mockImplementation(() => zeroconf as never);

    const service = new ReactNativeMdnsService();
    const lost: string[] = [];
    service.onServiceLost((name) => lost.push(name));

    const removeHandler = zeroconf.on.mock.calls.find(
      (call: [string, unknown]) => call[0] === "remove",
    )?.[1] as (name: string) => void;

    removeHandler("pairsync-peer");
    expect(lost).toEqual(["pairsync-peer"]);
  });

  it("unpublishes the advertised service and stops", async () => {
    const zeroconf = makeZeroconf();
    jest.mocked(Zeroconf).mockImplementation(() => zeroconf as never);

    const service = new ReactNativeMdnsService();
    await service.advertise("_pairsync._tcp.local", "pairsync-d1", 53350, {});
    await service.unpublish();

    expect(zeroconf.unpublishService).toHaveBeenCalledWith("pairsync-d1");
    expect(zeroconf.stop).toHaveBeenCalled();
  });

  it("close removes device listeners", async () => {
    const zeroconf = makeZeroconf();
    jest.mocked(Zeroconf).mockImplementation(() => zeroconf as never);

    const service = new ReactNativeMdnsService();
    await service.close();

    expect(zeroconf.removeDeviceListeners).toHaveBeenCalled();
  });
});
