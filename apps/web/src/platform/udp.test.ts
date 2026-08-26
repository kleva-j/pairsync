import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { fromByteArray } from "base64-js";

import type { MulticastSocket } from "@pairsync/core";
import { MULTICAST_GROUPS } from "@pairsync/core";

import { TauriMulticastSocket } from "./udp";
import {
  registeredListeners,
  emitTauriEvent,
  asciiBytes,
  resetIpc,
} from "./test-support";

vi.mock("@tauri-apps/api/core");
vi.mock("@tauri-apps/api/event");

const DISCOVERY_PORT = 53350;

beforeEach(() => {
  resetIpc();
  vi.mocked(invoke).mockResolvedValue(undefined);
});

describe("TauriMulticastSocket", () => {
  it("binds the discovery port through the udp plugin", async () => {
    const socket = new TauriMulticastSocket();
    await socket.bind(DISCOVERY_PORT);

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("plugin:pairsync-udp|bind", {
      socketId: expect.any(Number),
      port: DISCOVERY_PORT,
    });
  });

  it("joins and leaves groups on the bound socket", async () => {
    const socket = new TauriMulticastSocket();
    await socket.bind(DISCOVERY_PORT);
    vi.mocked(invoke).mockClear();

    await socket.joinGroup(MULTICAST_GROUPS.IPV4.address);
    await socket.joinGroup(MULTICAST_GROUPS.IPV6.address);
    await socket.leaveGroup(MULTICAST_GROUPS.IPV4.address);

    expect(vi.mocked(invoke).mock.calls).toEqual([
      [
        "plugin:pairsync-udp|join_group",
        { socketId: expect.any(Number), group: MULTICAST_GROUPS.IPV4.address },
      ],
      [
        "plugin:pairsync-udp|join_group",
        { socketId: expect.any(Number), group: MULTICAST_GROUPS.IPV6.address },
      ],
      [
        "plugin:pairsync-udp|leave_group",
        { socketId: expect.any(Number), group: MULTICAST_GROUPS.IPV4.address },
      ],
    ]);
  });

  it("sends datagrams as base64", async () => {
    const socket = new TauriMulticastSocket();
    await socket.bind(DISCOVERY_PORT);
    vi.mocked(invoke).mockClear();

    const payload = asciiBytes('{"type":"heartbeat"}');
    await socket.send(payload, DISCOVERY_PORT, MULTICAST_GROUPS.IPV4.address);

    expect(vi.mocked(invoke)).toHaveBeenCalledWith("plugin:pairsync-udp|send", {
      socketId: expect.any(Number),
      data: fromByteArray(payload),
      port: DISCOVERY_PORT,
      address: MULTICAST_GROUPS.IPV4.address,
    });
  });

  it("delivers inbound datagrams through the message event", async () => {
    const socket: MulticastSocket = new TauriMulticastSocket();
    await socket.bind(DISCOVERY_PORT);
    const received: Array<{
      data: Uint8Array;
      address: string;
      port: number;
    }> = [];
    socket.onMessage((data, remote) =>
      received.push({ data, address: remote.address, port: remote.port }),
    );

    const payload = asciiBytes("hello");
    await emitTauriEvent("pairsync-udp:message", {
      socketId: boundSocketId(),
      data: fromByteArray(payload),
      remote: { address: "192.168.1.7", port: DISCOVERY_PORT },
    });

    expect(received).toEqual([
      { data: payload, address: "192.168.1.7", port: DISCOVERY_PORT },
    ]);
  });

  it("ignores datagrams for other sockets", async () => {
    const socket = new TauriMulticastSocket();
    await socket.bind(DISCOVERY_PORT);
    const onMessage = vi.fn();
    socket.onMessage(onMessage);

    await emitTauriEvent("pairsync-udp:message", {
      socketId: boundSocketId() + 100,
      data: "",
      remote: { address: "10.0.0.1", port: 1000 },
    });

    expect(onMessage).not.toHaveBeenCalled();
  });

  it("close tears down the socket and listener", async () => {
    const socket = new TauriMulticastSocket();
    await socket.bind(DISCOVERY_PORT);
    const onMessage = vi.fn();
    socket.onMessage(onMessage);

    await socket.close();

    expect(invoke).toHaveBeenCalledWith("plugin:pairsync-udp|close", {
      socketId: boundSocketId(),
    });
    expect(registeredListeners()).toHaveLength(0);

    await emitTauriEvent("pairsync-udp:message", {
      socketId: boundSocketId(),
      data: "",
      remote: { address: "10.0.0.2", port: 1000 },
    });
    expect(onMessage).not.toHaveBeenCalled();
  });
});

function boundSocketId(): number {
  const [, args] = vi.mocked(invoke).mock.calls[0];
  return (args as { socketId: number }).socketId;
}
