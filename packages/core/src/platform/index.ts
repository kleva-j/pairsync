import type { MdnsService, MulticastSocket, TcpSocket } from "../discovery";
import type { RuntimePlatform } from "../utils";

import { getPlatform } from "../utils";

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

function unsupportedOperation(runtime: RuntimePlatform, capability: NetworkCapability) {
  return (..._args: unknown[]) => unsupported(runtime, capability);
}

const noop = () => {};
const noopAsync = async () => {};

export function createUnsupportedMulticastSocket(
  runtime: RuntimePlatform,
): MulticastSocket {
  const unsupportedUdpOperation = unsupportedOperation(runtime, "udp");

  return {
    bind: unsupportedUdpOperation,
    onMessage: noop,
    send: unsupportedUdpOperation,
    joinGroup: unsupportedUdpOperation,
    leaveGroup: unsupportedUdpOperation,
    close: noopAsync,
  };
}

export function createUnsupportedMdnsService(runtime: RuntimePlatform): MdnsService {
  const unsupportedMdnsOperation = unsupportedOperation(runtime, "mdns");

  return {
    advertise: unsupportedMdnsOperation,
    browse: unsupportedMdnsOperation,
    onServiceFound: noop,
    onServiceLost: noop,
    unpublish: noopAsync,
    close: noopAsync,
  };
}

export function createUnsupportedTcpSocket(runtime: RuntimePlatform): TcpSocket {
  const unsupportedTcpOperation = unsupportedOperation(runtime, "tcp");

  return {
    connect: unsupportedTcpOperation,
    send: unsupportedTcpOperation,
    onData: noop,
    close: noopAsync,
  };
}
