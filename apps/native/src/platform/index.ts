import type { PlatformNetworkAdapter } from "@pairsync/core";

import { createReactNativeMdnsService } from "./mdns";
import { createReactNativeTcpSocket } from "./tcp";
import { createReactNativeMulticastSocket } from "./udp";

export { ReactNativeMdnsService, createReactNativeMdnsService } from "./mdns";
export { ReactNativeTcpSocket, createReactNativeTcpSocket } from "./tcp";
export {
  ReactNativeMulticastSocket,
  createReactNativeMulticastSocket,
} from "./udp";

export function createReactNativePlatformNetwork(): PlatformNetworkAdapter {
  return {
    runtime: "mobile",
    capabilities: { udp: true, mdns: true, tcp: true },
    createMulticastSocket: createReactNativeMulticastSocket,
    createMdnsService: createReactNativeMdnsService,
    createTcpSocket: createReactNativeTcpSocket,
  };
}
