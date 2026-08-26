import type { MdnsService, MulticastSocket, TcpSocket } from "../discovery";
import { getPlatform } from "../utils";
import type { RuntimePlatform } from "../utils";

export type NetworkCapability = "udp" | "mdns" | "tcp";

export interface PlatformNetworkCapabilities {
  udp: boolean;
  mdns: boolean;
  tcp: boolean;
}

export interface PlatformNetworkAdapter {
  readonly runtime: RuntimePlatform;
  readonly capabilities: PlatformNetworkCapabilities;
  createMulticastSocket(): MulticastSocket;
  createMdnsService(): MdnsService;
  createTcpSocket(): TcpSocket;
}

export interface PlatformNetworkAdapters {
  mobile?: PlatformNetworkAdapter | (() => PlatformNetworkAdapter);
  desktop?: PlatformNetworkAdapter | (() => PlatformNetworkAdapter);
  web?: PlatformNetworkAdapter | (() => PlatformNetworkAdapter);
  node?: PlatformNetworkAdapter | (() => PlatformNetworkAdapter);
  unknown?: PlatformNetworkAdapter | (() => PlatformNetworkAdapter);
}

export class PlatformNetworkUnsupportedError extends Error {
  readonly runtime: RuntimePlatform;
  readonly capability: NetworkCapability;

  constructor(runtime: RuntimePlatform, capability: NetworkCapability) {
    super(`${capability} networking is not supported on ${runtime}`);
    this.name = "PlatformNetworkUnsupportedError";
    this.runtime = runtime;
    this.capability = capability;
  }
}

function resolveAdapter(
  adapter: PlatformNetworkAdapter | (() => PlatformNetworkAdapter) | undefined,
): PlatformNetworkAdapter | undefined {
  return typeof adapter === "function" ? adapter() : adapter;
}

export function createPlatformNetwork(
  adapters: PlatformNetworkAdapters = {},
  runtime: RuntimePlatform = getPlatform(),
): PlatformNetworkAdapter {
  const adapter = resolveAdapter(adapters[runtime]);
  return adapter ?? createUnsupportedPlatformNetwork(runtime);
}

export function createUnsupportedPlatformNetwork(
  runtime: RuntimePlatform,
): PlatformNetworkAdapter {
  return {
    runtime,
    capabilities: { udp: false, mdns: false, tcp: false },
    createMulticastSocket: () => createUnsupportedMulticastSocket(runtime),
    createMdnsService: () => createUnsupportedMdnsService(runtime),
    createTcpSocket: () => createUnsupportedTcpSocket(runtime),
  };
}

function unsupported(runtime: RuntimePlatform, capability: NetworkCapability): Promise<never> {
  return Promise.reject(new PlatformNetworkUnsupportedError(runtime, capability));
}

export function createUnsupportedMulticastSocket(
  runtime: RuntimePlatform,
): MulticastSocket {
  return {
    bind: () => unsupported(runtime, "udp"),
    onMessage: () => {
      // Unsupported adapters never emit network data.
    },
    send: () => unsupported(runtime, "udp"),
    joinGroup: () => unsupported(runtime, "udp"),
    leaveGroup: () => unsupported(runtime, "udp"),
    close: () => unsupported(runtime, "udp"),
  };
}

export function createUnsupportedMdnsService(runtime: RuntimePlatform): MdnsService {
  return {
    advertise: () => unsupported(runtime, "mdns"),
    browse: () => unsupported(runtime, "mdns"),
    onServiceFound: () => {
      // Unsupported adapters never emit service events.
    },
    onServiceLost: () => {
      // Unsupported adapters never emit service events.
    },
    unpublish: () => unsupported(runtime, "mdns"),
    close: () => unsupported(runtime, "mdns"),
  };
}

export function createUnsupportedTcpSocket(runtime: RuntimePlatform): TcpSocket {
  return {
    connect: () => unsupported(runtime, "tcp"),
    send: () => unsupported(runtime, "tcp"),
    onData: () => {
      // Unsupported adapters never emit stream data.
    },
    close: () => unsupported(runtime, "tcp"),
  };
}
