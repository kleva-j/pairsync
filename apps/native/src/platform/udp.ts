import type { MulticastSocket } from "@pairsync/core";
import dgram from "react-native-udp";

type RemoteInfo = { address: string; port: number };
type UdpFamily = "udp4" | "udp6";

function familyForAddress(address: string): UdpFamily {
  return address.includes(":") ? "udp6" : "udp4";
}

function createSocket(family: UdpFamily) {
  return dgram.createSocket({ type: family, reusePort: true });
}

function bindSocket(
  socket: ReturnType<typeof dgram.createSocket>,
  port: number,
  address: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve();
    };
    socket.once("error", finish);
    socket.bind(port, address, finish);
  });
}

function closeSocket(socket: ReturnType<typeof dgram.createSocket>): Promise<void> {
  return new Promise((resolve) => {
    socket.close(resolve);
  });
}

export class ReactNativeMulticastSocket implements MulticastSocket {
  private sockets: { udp4?: ReturnType<typeof dgram.createSocket>; udp6?: ReturnType<typeof dgram.createSocket> } = {};
  private messageHandler?: (data: Uint8Array, remote: RemoteInfo) => void;
  private messageHandlers: Map<ReturnType<typeof dgram.createSocket>, (data: Uint8Array, remote: RemoteInfo) => void> = new Map();

  private ensureSocket(family: UdpFamily): ReturnType<typeof dgram.createSocket> {
    if (this.sockets[family]) {
      return this.sockets[family]!;
    }
    const socket = createSocket(family);
    const handler = (data: Uint8Array, remote: RemoteInfo) => {
      this.messageHandler?.(data, remote);
    };
    socket.on("message", handler);
    this.messageHandlers.set(socket, handler);
    this.sockets[family] = socket;
    return socket;
  }

  async bind(port: number, address?: string): Promise<void> {
    if (address !== undefined) {
      const family = familyForAddress(address);
      await bindSocket(this.ensureSocket(family), port, address);
      const otherFamily = family === "udp4" ? "udp6" : "udp4";
      if (this.sockets[otherFamily]) {
        try {
          await closeSocket(this.sockets[otherFamily]!);
        } catch {
          // swallow close errors to prevent bind failure
        }
        this.sockets[otherFamily] = undefined;
      }
      return;
    }
    await Promise.all([
      bindSocket(this.ensureSocket("udp4"), port, "0.0.0.0"),
      bindSocket(this.ensureSocket("udp6"), port, "::"),
    ]);
  }

  onMessage(handler: (data: Uint8Array, remote: RemoteInfo) => void): void {
    this.messageHandler = handler;
  }

  send(data: Uint8Array, port: number, address: string): Promise<void> {
    const socket = this.ensureSocket(familyForAddress(address));
    return new Promise((resolve, reject) => {
      socket.send(data, 0, data.byteLength, port, address, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  async joinGroup(group: string, iface?: string): Promise<void> {
    try {
      this.ensureSocket(familyForAddress(group)).addMembership(group, iface);
    } catch (error) {
      throw new Error(`Failed to join multicast group ${group}: ${error}`);
    }
  }

  async leaveGroup(group: string, iface?: string): Promise<void> {
    try {
      this.ensureSocket(familyForAddress(group)).dropMembership(group, iface);
    } catch (error) {
      throw new Error(`Failed to leave multicast group ${group}: ${error}`);
    }
  }

  async close(): Promise<void> {
    const udp4 = this.sockets.udp4;
    const udp6 = this.sockets.udp6;
    this.sockets = {};

    // Remove event handlers before closing
    if (udp4) {
      const handler = this.messageHandlers.get(udp4);
      if (handler) udp4.off("message", handler);
      this.messageHandlers.delete(udp4);
    }
    if (udp6) {
      const handler = this.messageHandlers.get(udp6);
      if (handler) udp6.off("message", handler);
      this.messageHandlers.delete(udp6);
    }

    await Promise.all([
      udp4 ? closeSocket(udp4) : Promise.resolve(),
      udp6 ? closeSocket(udp6) : Promise.resolve(),
    ]);
  }
}

export function createReactNativeMulticastSocket(): MulticastSocket {
  return new ReactNativeMulticastSocket();
}
