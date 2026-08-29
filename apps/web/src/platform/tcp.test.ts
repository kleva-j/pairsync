import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TcpSocket } from "@pairsync/core";

import { emitTauriEvent, registeredListeners, resetIpc } from "./test-support";
import { TauriTcpSocket } from "./tcp";
import { fromByteArray } from "base64-js";

vi.mock("@tauri-apps/api/core");
vi.mock("@tauri-apps/api/event");

beforeEach(() => {
  resetIpc();
  vi.mocked(invoke).mockResolvedValue(undefined);
});

describe("TauriTcpSocket", () => {
  it("connects through the tcp plugin", async () => {
    const socket = new TauriTcpSocket();
    await socket.connect("192.168.1.9", 53351);

    expect(invoke).toHaveBeenCalledWith("plugin:pairsync-tcp|connect", {
      socketId: expect.any(Number),
      host: "192.168.1.9",
      port: 53351,
    });
  });

  it("sends bytes as base64 once connected", async () => {
    const socket: TcpSocket = new TauriTcpSocket();
    await socket.connect("peer", 53351);
    vi.mocked(invoke).mockClear();

    const payload = new Uint8Array([1, 2, 3]);
    await socket.send(payload);

    expect(invoke).toHaveBeenCalledWith("plugin:pairsync-tcp|send", {
      socketId: expect.any(Number),
      data: fromByteArray(payload),
    });
  });

  it("rejects send before connect", async () => {
    const socket = new TauriTcpSocket();
    await expect(socket.send(new Uint8Array([1]))).rejects.toThrow(
      /not connected/,
    );
  });

  it("delivers inbound bytes through the data event", async () => {
    const socket = new TauriTcpSocket();
    await socket.connect("peer", 53351);
    const onData = vi.fn();
    socket.onData(onData);

    const payload = new Uint8Array([4, 5, 6]);
    await emitTauriEvent("pairsync-tcp:data", {
      socketId: connectedSocketId(),
      data: fromByteArray(payload),
    });

    expect(onData).toHaveBeenCalledWith(payload);
  });

  it("ignores data events for other sockets", async () => {
    const socket = new TauriTcpSocket();
    await socket.connect("peer", 53351);
    const onData = vi.fn();
    socket.onData(onData);

    await emitTauriEvent("pairsync-tcp:data", {
      socketId: connectedSocketId() + 42,
      data: fromByteArray(new Uint8Array([1])),
    });

    expect(onData).not.toHaveBeenCalled();
  });

  it("close tears down the connection and listener", async () => {
    const socket = new TauriTcpSocket();
    await socket.connect("peer", 53351);
    const onData = vi.fn();
    socket.onData(onData);

    await socket.close();

    expect(invoke).toHaveBeenCalledWith("plugin:pairsync-tcp|close", {
      socketId: connectedSocketId(),
    });
    expect(registeredListeners()).toHaveLength(0);

    await emitTauriEvent("pairsync-tcp:data", {
      socketId: connectedSocketId(),
      data: "",
    });
    expect(onData).not.toHaveBeenCalled();
  });
});

function connectedSocketId(): number {
  const [, args] = vi.mocked(invoke).mock.calls[0];
  return (args as { socketId: number }).socketId;
}
