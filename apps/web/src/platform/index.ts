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
