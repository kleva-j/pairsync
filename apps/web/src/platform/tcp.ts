import type { TcpSocket } from "@pairsync/core";

import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { fromByteArray, toByteArray } from "base64-js";
import { invoke } from "@tauri-apps/api/core";

/**
 * Desktop TCP client socket backed by the `pairsync-tcp` Tauri plugin.
 * Inbound bytes arrive as `pairsync-tcp:data` events tagged with the
 * logical `socketId`.
 */
export class TauriTcpSocket implements TcpSocket {
  private static nextId = 1;

  private readonly socketId = TauriTcpSocket.nextId++;
  private dataHandler?: (data: Uint8Array) => void;
  private dataUnlisten?: Promise<UnlistenFn>;
  private connected = false;
  private closed = false;

  constructor() {
    this.dataUnlisten = listen<{ socketId: number; data: string }>("pairsync-tcp:data", (event) => {
      if (event.payload.socketId !== this.socketId) return;
      this.dataHandler?.(toByteArray(event.payload.data));
    });
  }

  async connect(host: string, port: number): Promise<void> {
    await this.dataUnlisten;
    await invoke("plugin:pairsync-tcp|connect", {
      socketId: this.socketId,
      host,
      port,
    });
    this.connected = true;
  }

  async send(data: Uint8Array): Promise<void> {
    if (this.closed) {
      throw new Error("TCP socket is closed");
    }
    if (!this.connected) {
      throw new Error("TCP socket is not connected");
    }
    await invoke("plugin:pairsync-tcp|send", {
      socketId: this.socketId,
      data: fromByteArray(data),
    });
  }

  onData(handler: (data: Uint8Array) => void): void {
    this.dataHandler = handler;
  }

  async close(): Promise<void> {
    this.connected = false;
    this.closed = true;
    try {
      await invoke("plugin:pairsync-tcp|close", { socketId: this.socketId });
    } finally {
      if (this.dataUnlisten) {
        const unlisten = await this.dataUnlisten;
        unlisten();
      }
    }
  }
}
