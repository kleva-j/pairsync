import React, { useEffect } from "react";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import {
  filterInterfacesForAdvertisement,
  type Device,
  type DiscoveryRuntime,
  type HeartbeatPayload,
  type NetworkInterface,
  type Platform,
} from "@pairsync/core";
import ReactDOM from "react-dom/client";

import Loader from "./components/loader";
import { routeTree } from "./routeTree.gen";
import { detectTauriLocalInterfaces } from "./platform";

const DEVICE_ALIAS_STORAGE_KEY = "pairsync.deviceAlias";

function getDesktopPairSyncPlatform(userAgent = navigator.userAgent): Platform {
  if (/macintosh|mac os x/i.test(userAgent)) return "macos";
  if (/windows/i.test(userAgent)) return "windows";
  if (/linux|x11/i.test(userAgent)) return "linux";
  return "unknown";
}

function getDesktopDeviceAlias(): string {
  return localStorage.getItem(DEVICE_ALIAS_STORAGE_KEY)?.trim() || "PairSync Desktop";
}

const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
  defaultPendingComponent: () => <Loader />,
  context: {},
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Wire platform adapters and start discovery only when running under Tauri
function startDesktopDiscoveryIfTauri() {
  try {
    // Tauri injects a global __TAURI__ object; guard on it so web bundles/tests
    // don't attempt to import Tauri-only modules.
    if (typeof window === "undefined" || (window as any).__TAURI__ == null) {
      return;
    }

    (async () => {
      try {
        const platformMod = await import("./platform");
        const core = await import("@pairsync/core");

        const adapter = platformMod.createTauriPlatformNetwork();

        const deviceId = `dev-${Math.floor(Math.random() * 1e9)}`;
        let interfaces: NetworkInterface[] = filterInterfacesForAdvertisement(
          await detectTauriLocalInterfaces(),
        );
        const heartbeat = (): HeartbeatPayload => ({
          device_id: deviceId,
          alias: getDesktopDeviceAlias(),
          platform: getDesktopPairSyncPlatform(),
          interfaces,
          port: core.DISCOVERY_PORT,
        });

        const runtime: DiscoveryRuntime = core.createDiscoveryRuntime({
          adapter,
          heartbeat,
          deviceManager: {
            onDeviceAdded: (device: Device) => console.log("[discovery] device added", device),
            onDeviceUpdated: (device: Device) => console.log("[discovery] device updated", device),
            onDeviceRemoved: (id: string) => console.log("[discovery] device removed", id),
          },
          onError: (source, err) => console.warn(`[discovery] ${source} error`, err),
        });

        await runtime.start();
        interfaces = filterInterfacesForAdvertisement(await detectTauriLocalInterfaces());

        console.log("[discovery] started (desktop)");

        // Stop discovery when the window unloads
        window.addEventListener("beforeunload", async () => {
          try {
            await runtime.stop();
          } catch {}
        });
      } catch (err) {
        console.warn("[discovery] failed to start desktop adapters:", err);
      }
    })();
  } catch (err) {
    // swallow any sync errors — discovery is optional at runtime
    console.warn("[discovery] init error", err);
  }
}

const rootElement = document.getElementById("app");

if (!rootElement) {
  throw new Error("Root element not found");
}

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  // Kick off desktop discovery if appropriate (non-blocking)
  startDesktopDiscoveryIfTauri();
  root.render(<RouterProvider router={router} />);
}
