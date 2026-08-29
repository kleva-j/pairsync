/**
 * Mobile (React Native) platform network adapters for PairSync.
 * 
 * NOTE: Not yet integrated into the application (Phase 2.5 infrastructure).
 * These exports will be consumed in Phase 3 when the transfer engine is implemented.
 * 
 * @see packages/core/CONTEXT.md - Phase 2.5 status
 * @see IMPLEMENTATION_PLAN.md - Phase 3 integration plan
 */

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

/**
 * Creates a React Native mobile platform network adapter.
 * 
 * TODO(Phase 3): Wire this into apps/native/app/_layout.tsx to enable mobile networking
 * 
 * @returns Platform network adapter for React Native mobile environment
 */
export function createReactNativePlatformNetwork(): PlatformNetworkAdapter {
  return {
    runtime: "mobile",
    capabilities: { udp: true, mdns: true, tcp: true },
    createMulticastSocket: createReactNativeMulticastSocket,
    createMdnsService: createReactNativeMdnsService,
    createTcpSocket: createReactNativeTcpSocket,
  };
}
