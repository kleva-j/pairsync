import TcpSocketModule from "react-native-tcp-socket";

import { ReactNativeTcpSocket } from "./tcp";

jest.mock("react-native-tcp-socket", () => ({
  __esModule: true,
  default: {
    createConnection: jest.fn(),
  },
}));

type FakeSocket = {
  once: jest.Mock;
  on: jest.Mock;
  write: jest.Mock;
  destroy: jest.Mock;
};

function makeSocket(): FakeSocket {
  return {
    once: jest.fn(),
    on: jest.fn(),
    write: jest.fn(
      (_data: Uint8Array, callback: (error?: Error) => void) => callback(),
    ),
    destroy: jest.fn((callback?: () => void) => callback?.()),
  };
}

describe("ReactNativeTcpSocket", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates a native connection to host:port on connect", async () => {
    const native = makeSocket();
    jest.mocked(TcpSocketModule.createConnection).mockReturnValue(
      native as never,
    );

    const socket = new ReactNativeTcpSocket();
    const connectPromise = socket.connect("192.168.1.9", 53351);

    // The connect callback fires once the TCP handshake completes.
    const connected = native.once.mock.calls.find(
      (call: [string, unknown]) => call[0] === "error",
    );
    expect(connected).toBeDefined();

    // Simulate the "connected" callback passed as the 2nd arg to createConnection.
    const connectCallback = jest.mocked(TcpSocketModule.createConnection).mock
      .calls[0][1] as () => void;
    connectCallback();

    await connectPromise;

    expect(TcpSocketModule.createConnection).toHaveBeenCalledWith(
      { host: "192.168.1.9", port: 53351, reuseAddress: true },
      expect.any(Function),
    );
  });

  it("rejects connect on native error", async () => {
    const native = makeSocket();
    jest.mocked(TcpSocketModule.createConnection).mockReturnValue(
      native as never,
    );

    const socket = new ReactNativeTcpSocket();
    const connectPromise = socket.connect("192.168.1.9", 53351);

    const errorHandler = native.once.mock.calls.find(
      (call: [string, unknown]) => call[0] === "error",
    )?.[1] as (error: Error) => void;
    errorHandler(new Error("ECONNREFUSED"));

    await expect(connectPromise).rejects.toThrow("ECONNREFUSED");
  });

  it("sends bytes on an established connection", async () => {
    const native = makeSocket();
    jest.mocked(TcpSocketModule.createConnection).mockReturnValue(
      native as never,
    );

    const socket = new ReactNativeTcpSocket();
    const connectPromise = socket.connect("192.168.1.9", 53351);
    const connectCallback = jest.mocked(TcpSocketModule.createConnection).mock
      .calls[0][1] as () => void;
    connectCallback();
    await connectPromise;

    await socket.send(new Uint8Array([1, 2, 3]));
    expect(native.write).toHaveBeenCalledWith(
      new Uint8Array([1, 2, 3]),
      expect.any(Function),
    );
  });

  it("rejects send when not connected", async () => {
    const socket = new ReactNativeTcpSocket();
    await expect(socket.send(new Uint8Array([1]))).rejects.toThrow(
      /not connected/,
    );
  });

  it("delivers inbound bytes through onData", async () => {
    const native = makeSocket();
    jest.mocked(TcpSocketModule.createConnection).mockReturnValue(
      native as never,
    );

    const socket = new ReactNativeTcpSocket();
    const connectPromise = socket.connect("192.168.1.9", 53351);
    const connectCallback = jest.mocked(TcpSocketModule.createConnection).mock
      .calls[0][1] as () => void;
    connectCallback();
    await connectPromise;

    const received: Uint8Array[] = [];
    socket.onData((data) => received.push(data));

    const dataHandler = native.on.mock.calls.find(
      (call: [string, unknown]) => call[0] === "data",
    )?.[1] as (data: Uint8Array) => void;
    dataHandler(new Uint8Array([4, 5, 6]));

    expect(received).toEqual([new Uint8Array([4, 5, 6])]);
  });

  it("destroys the socket on close", async () => {
    const native = makeSocket();
    jest.mocked(TcpSocketModule.createConnection).mockReturnValue(
      native as never,
    );

    const socket = new ReactNativeTcpSocket();
    const connectPromise = socket.connect("192.168.1.9", 53351);
    const connectCallback = jest.mocked(TcpSocketModule.createConnection).mock
      .calls[0][1] as () => void;
    connectCallback();
    await connectPromise;

    await socket.close();
    expect(native.destroy).toHaveBeenCalled();
  });
});
