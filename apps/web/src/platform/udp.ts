import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { MulticastSocket } from "@pairsync/core";

import { fromByteArray, toByteArray } from "base64-js";

/**
 * Desktop multicast socket backed by the `pairsync-udp` Tauri plugin.
 * The plugin owns the native sockets (IPv4 + IPv6) under one logical
 * `socketId` and emits `pairsync-udp:message` events for inbound datagrams.
 */
export class TauriMulticastSocket implements MulticastSocket {
  private static nextId = 1;

  private readonly socketId = TauriMulticastSocket.nextId++;
  private messageHandler?: (
    data: Uint8Array,
    remote: { address: string; port: number },
  ) => void;
  private unlisten?: UnlistenFn;
  private bound = false;
  private closed = false;

  async bind(port: number, address?: string): Promise<void> {
    if (this.closed) {
      throw new Error("Socket is closed");
    }
    await invoke("plugin:pairsync-udp|bind", { socketId: this.socketId, port, address });
    const unlisten = await listen<{
      socketId: number;
      data: string;
      remote: { address: string; port: number };
    }>("pairsync-udp:message", (event) => {
      if (event.payload.socketId !== this.socketId) return;
      this.messageHandler?.(toByteArray(event.payload.data), event.payload.remote);
    });
    this.bound = true;
    this.unlisten = unlisten;
  }

  onMessage(
    handler: (
      data: Uint8Array,
      remote: { address: string; port: number },
    ) => void,
  ): void {
    this.messageHandler = handler;
  }

  async send(data: Uint8Array, port: number, address: string): Promise<void> {
    await invoke("plugin:pairsync-udp|send", {
      socketId: this.socketId,
      data: fromByteArray(data),
      port,
      address,
    });
  }

  async joinGroup(group: string): Promise<void> {
    await invoke("plugin:pairsync-udp|join_group", {
      socketId: this.socketId,
      group,
    });
  }

  async leaveGroup(group: string): Promise<void> {
    await invoke("plugin:pairsync-udp|leave_group", {
      socketId: this.socketId,
      group,
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      await invoke("plugin:pairsync-udp|close", { socketId: this.socketId });
    } finally {
      this.bound = false;
      this.unlisten?.();
      this.unlisten = undefined;
    }
  }
}