/**
 * Desktop (Tauri) platform network adapters for PairSync.
 * 
 * NOTE: Not yet integrated into the application (Phase 2.5 infrastructure).
 * These exports will be consumed in Phase 3 when the transfer engine is implemented.
 * 
 * @see packages/core/CONTEXT.md - Phase 2.5 status
 * @see IMPLEMENTATION_PLAN.md - Phase 3 integration plan
 */

import type { PlatformNetworkAdapter } from "@pairsync/core";

import { TauriMdnsService } from "./mdns";
import { TauriTcpSocket } from "./tcp";
import { TauriMulticastSocket } from "./udp";

export { TauriMdnsService } from "./mdns";
export { TauriTcpSocket } from "./tcp";
export { TauriMulticastSocket } from "./udp";

/**
 * Desktop networking adapter backed by the local Tauri plugins
 * (`pairsync-udp`, `pairsync-mdns`, `pairsync-tcp` in
 * `src-tauri/plugins/`). Conforms to the shared core contract so the
 * platform-agnostic discovery/connection engines drive it unchanged.
 * 
 * TODO(Phase 3): Wire this into apps/web/src/main.tsx to enable desktop networking
 * 
 * @returns Platform network adapter for Tauri desktop environment
 */
export function createTauriPlatformNetwork(): PlatformNetworkAdapter {
  return {
    runtime: "desktop",
    capabilities: { udp: true, mdns: true, tcp: true },
    createMulticastSocket: () => new TauriMulticastSocket(),
    createMdnsService: () => new TauriMdnsService(),
    createTcpSocket: () => new TauriTcpSocket(),
  };
}
