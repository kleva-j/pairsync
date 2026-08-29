import type { TcpSocket } from "@pairsync/core";
import TcpSocketModule from "react-native-tcp-socket";

type NativeTcpSocket = ReturnType<typeof TcpSocketModule.createConnection>;

export class ReactNativeTcpSocket implements TcpSocket {
  private socket: NativeTcpSocket | null = null;
  private dataHandler?: (data: Uint8Array) => void;
  private closed = false;

  connect(host: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.closed) {
        reject(new Error("TCP socket is closed"));
        return;
      }
      const socket = TcpSocketModule.createConnection(
        { host, port, reuseAddress: true },
        () => resolve(),
      );
      this.socket = socket;
      socket.once("error", (error: Error) => {
        this.socket = null;
        reject(error);
      });
      socket.on("data", (data) => {
        this.dataHandler?.(new Uint8Array(data));
      });
    });
  }

  send(data: Uint8Array): Promise<void> {
    if (this.closed) {
      return Promise.reject(new Error("TCP socket is closed"));
    }
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
    this.closed = true;
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