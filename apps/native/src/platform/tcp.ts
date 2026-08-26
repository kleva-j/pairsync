import type { TcpSocket } from "@pairsync/core";
import TcpSocketModule from "react-native-tcp-socket";

type NativeTcpSocket = ReturnType<typeof TcpSocketModule.createConnection>;

export class ReactNativeTcpSocket implements TcpSocket {
  private socket: NativeTcpSocket | null = null;
  private dataHandler?: (data: Uint8Array) => void;

  connect(host: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = TcpSocketModule.createConnection(
        { host, port, reuseAddress: true },
        () => resolve(),
      );
      socket.once("error", reject);
      socket.on("data", (data) => {
        this.dataHandler?.(new Uint8Array(data));
      });
      this.socket = socket;
    });
  }

  send(data: Uint8Array): Promise<void> {
    const socket = this.socket;
    if (socket === null) {
      return Promise.reject(new Error("TCP socket is not connected"));
    }
    return new Promise((resolve, reject) => {
      socket.write(data, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  onData(handler: (data: Uint8Array) => void): void {
    this.dataHandler = handler;
  }

  async close(): Promise<void> {
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      await new Promise<void>((resolve) => {
        socket.destroy(resolve);
      });
    }
  }
}

export function createReactNativeTcpSocket(): TcpSocket {
  return new ReactNativeTcpSocket();
}