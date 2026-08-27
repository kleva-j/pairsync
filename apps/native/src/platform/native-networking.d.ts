declare module "react-native-udp" {
  type UdpSocketType = "udp4" | "udp6";
  type UdpRemoteInfo = { address: string; port: number };
  type UdpSocket = {
    bind(port: number, address?: string, callback?: (error?: Error) => void): void;
    on(event: "message", handler: (data: Uint8Array, remote: UdpRemoteInfo) => void): void;
    off(event: "message", handler: (data: Uint8Array, remote: UdpRemoteInfo) => void): void;
    once(event: "listening" | "close", handler: () => void): void;
    once(event: "error", handler: (error: Error) => void): void;
    send(
      data: Uint8Array,
      offset: number,
      length: number,
      port: number,
      address: string,
      callback?: (error?: Error) => void,
    ): void;
    addMembership(group: string, iface?: string): void;
    dropMembership(group: string, iface?: string): void;
    close(callback?: () => void): void;
  };
  const dgram: {
    createSocket(options: UdpSocketType | { type: UdpSocketType; reusePort?: boolean }): UdpSocket;
  };
  export default dgram;
}

declare module "react-native-zeroconf" {
  export type ZeroconfService = {
    name: string;
    port: number;
    addresses?: string[];
    txt?: Record<string, string | number | boolean>;
  };
  export default class Zeroconf {
    on(event: "resolved", handler: (service: ZeroconfService) => void): this;
    on(event: "remove", handler: (name: string) => void): this;
    on(event: "error", handler: (error: Error) => void): this;
    scan(type: string, protocol: "tcp" | "udp", domain: string): void;
    stop(): void;
    publishService(
      type: string,
      protocol: "tcp" | "udp",
      domain: string,
      name: string,
      port: number,
      txt?: Record<string, string>,
    ): void;
    unpublishService(name: string): void;
    removeDeviceListeners(): void;
  }
}

declare module "react-native-tcp-socket" {
  type TcpSocket = {
    on(event: "data", handler: (data: Uint8Array) => void): void;
    once(event: "error", handler: (error: Error) => void): void;
    write(data: Uint8Array, callback?: (error?: Error) => void): void;
    destroy(callback?: () => void): void;
  };
  const TcpSocketModule: {
    createConnection(
      options: { host: string; port: number; reuseAddress?: boolean; connectTimeout?: number },
      callback: () => void,
    ): TcpSocket;
  };
  export default TcpSocketModule;
}
