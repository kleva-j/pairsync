import { EventEmitter } from "events";

import dgram from "react-native-udp";

import { ReactNativeMulticastSocket } from "./udp";

jest.mock("react-native-udp", () => ({
  __esModule: true,
  default: {
    createSocket: jest.fn(),
  },
}));

type FakeUdpSocket = EventEmitter & {
  bind: jest.Mock;
  send: jest.Mock;
  addMembership: jest.Mock;
  dropMembership: jest.Mock;
  close: jest.Mock;
};

function makeSocket(): FakeUdpSocket {
  const socket = new EventEmitter() as unknown as FakeUdpSocket;
  socket.bind = jest.fn(
    (
      _port: number,
      _address: string | undefined,
      callback?: (error?: Error) => void,
    ) => callback?.(),
  );
  socket.send = jest.fn(
    (
      _data: Uint8Array,
      _offset: number,
      _length: number,
      _port: number,
      _address: string,
      callback: (error?: Error) => void,
    ) => callback(),
  );
  socket.addMembership = jest.fn();
  socket.dropMembership = jest.fn();
  socket.close = jest.fn((callback: () => void) => callback());
  return socket;
}

describe("ReactNativeMulticastSocket", () => {
  let udp4: FakeUdpSocket;
  let udp6: FakeUdpSocket;

  beforeEach(() => {
    jest.resetAllMocks();
    udp4 = makeSocket();
    udp6 = makeSocket();
    jest.mocked(dgram.createSocket).mockImplementation((opts: string | { type: string; reusePort?: boolean }) => {
      const type = typeof opts === "string" ? opts : opts.type;
      return type === "udp4" ? udp4 : udp6;
    });
  });

  it("does not create sockets until bind is called", () => {
    new ReactNativeMulticastSocket();

    expect(dgram.createSocket).not.toHaveBeenCalled();
  });

  it("creates a dual-stack udp4/udp6 socket pair on first bind", async () => {
    const socket = new ReactNativeMulticastSocket();
    await socket.bind(53350);

    expect(dgram.createSocket).toHaveBeenCalledTimes(2);
    expect(dgram.createSocket).toHaveBeenCalledWith({ type: "udp4", reusePort: true });
    expect(dgram.createSocket).toHaveBeenCalledWith({ type: "udp6", reusePort: true });
  });

  it("binds both stacks to the discovery port when no address is given", async () => {
    const socket = new ReactNativeMulticastSocket();
    await socket.bind(53350);

    expect(udp4.bind).toHaveBeenCalledWith(53350, "0.0.0.0", expect.any(Function));
    expect(udp6.bind).toHaveBeenCalledWith(53350, "::", expect.any(Function));
  });

  it("binds only the matching stack when an address is given", async () => {
    const socket = new ReactNativeMulticastSocket();
    await socket.bind(53350, "224.0.0.1");

    expect(udp4.bind).toHaveBeenCalledWith(53350, "224.0.0.1", expect.any(Function));
    expect(udp6.bind).not.toHaveBeenCalled();
  });

  it("forwards inbound datagrams from either stack to onMessage", async () => {
    const socket = new ReactNativeMulticastSocket();
    await socket.bind(53350);
    const received: Array<{ data: Uint8Array; address: string; port: number }> = [];
    socket.onMessage((data, remote) =>
      received.push({ data, address: remote.address, port: remote.port }),
    );

    const payload = new Uint8Array([1, 2, 3]);
    udp4.emit("message", payload, { address: "192.168.1.1", port: 53350 });
    udp6.emit("message", new Uint8Array([4, 5, 6]), {
      address: "fe80::1",
      port: 53350,
    });

    expect(received).toEqual([
      { data: payload, address: "192.168.1.1", port: 53350 },
      { data: new Uint8Array([4, 5, 6]), address: "fe80::1", port: 53350 },
    ]);
  });

  it("routes sends to the v4 stack for IPv4 and v6 stack for IPv6", async () => {
    const socket = new ReactNativeMulticastSocket();
    await socket.bind(53350);
    await socket.send(new Uint8Array([1]), 53350, "224.0.0.1");
    await socket.send(new Uint8Array([2]), 53350, "ff02::1");

    expect(udp4.send).toHaveBeenCalledWith(
      new Uint8Array([1]),
      0,
      1,
      53350,
      "224.0.0.1",
      expect.any(Function),
    );
    expect(udp6.send).toHaveBeenCalledWith(
      new Uint8Array([2]),
      0,
      1,
      53350,
      "ff02::1",
      expect.any(Function),
    );
  });

  it("joins and leaves multicast groups on the matching stack", async () => {
    const socket = new ReactNativeMulticastSocket();
    await socket.bind(53350);
    await socket.joinGroup("224.0.0.1");
    await socket.joinGroup("ff02::1");
    await socket.leaveGroup("224.0.0.1");

    expect(udp4.addMembership).toHaveBeenCalledWith("224.0.0.1", undefined);
    expect(udp6.addMembership).toHaveBeenCalledWith("ff02::1", undefined);
    expect(udp4.dropMembership).toHaveBeenCalledWith("224.0.0.1", undefined);
  });

  it("closes both stacks after bind", async () => {
    const socket = new ReactNativeMulticastSocket();
    await socket.bind(53350);
    await socket.close();

    expect(udp4.close).toHaveBeenCalled();
    expect(udp6.close).toHaveBeenCalled();
  });

  it("closes only created stacks when bind was called with address", async () => {
    const socket = new ReactNativeMulticastSocket();
    await socket.bind(53350, "224.0.0.1");
    await socket.close();

    expect(udp4.close).toHaveBeenCalled();
    expect(udp6.close).not.toHaveBeenCalled();
  });
});