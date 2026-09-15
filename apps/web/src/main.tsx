import { RouterProvider, createRouter } from "@tanstack/react-router";
import {
  filterInterfacesForAdvertisement,
  isDesktop,
  type DiscoveryRuntime,
  type HeartbeatPayload,
  type NetworkInterface,
  type Platform,
  type Device,
} from "@pairsync/core";
import ReactDOM from "react-dom/client";

import Loader from "./components/loader";
import { routeTree } from "./routeTree.gen";
import { detectTauriLocalInterfaces } from "./platform";
import { getDesktopDeviceId } from "./deviceId";

const DEVICE_ALIAS_STORAGE_KEY = "pairsync.deviceAlias";

// Safety-net poll interval (ms) in case no browser network-state event fires
// for an IP-only change (DHCP renewal, VPN toggle, captive-portal handoff).
// Primary refresh is event-driven: `online`, `offline`, and `visibilitychange`
// listeners installed after the runtime starts. A full OS-native Tauri plugin
// (macOS SystemConfiguration, Windows NotifyRouteChange2) is a Phase-3
// follow-up.
const INTERFACE_REFRESH_SAFETY_INTERVAL_MS = 5 * 60_000;

function getDesktopPairSyncPlatform(userAgent = navigator.userAgent): Platform {
  if (/macintosh|mac os x/i.test(userAgent)) return "macos";
  if (/windows/i.test(userAgent)) return "windows";
  if (/linux|x11/i.test(userAgent)) return "linux";
  return "unknown";
}

function getDesktopDeviceAlias(): string {
  try {
    return (
      localStorage.getItem(DEVICE_ALIAS_STORAGE_KEY)?.trim() ||
      "PairSync Desktop"
    );
  } catch {
    return "PairSync Desktop";
  }
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
    // Use the core isDesktop() utility which correctly detects Tauri v2
    // (checks both __TAURI_INTERNALS__ and __TAURI__) so web bundles/tests
    // don't attempt to import Tauri-only modules.
    if (!isDesktop()) {
      return;
    }

    (async () => {
      try {
        const platformMod = await import("./platform");
        const core = await import("@pairsync/core");

        const adapter = platformMod.createTauriPlatformNetwork();

        const deviceId = getDesktopDeviceId();
        // Use a ref-like pattern with a mutable variable for interfaces
        // so heartbeat can always read the latest value
        let interfaces: NetworkInterface[] = filterInterfacesForAdvertisement(
          await detectTauriLocalInterfaces()
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
            onDeviceAdded: (device: Device) =>
              console.log("[discovery] device added", device),
            onDeviceUpdated: (device: Device) =>
              console.log("[discovery] device updated", device),
            onDeviceRemoved: (id: string) =>
              console.log("[discovery] device removed", id),
          },
          onError: (source, err) =>
            console.warn(`[discovery] ${source} error`, err),
        });

        await runtime.start();

        let refreshGeneration = 0;
        const refreshInterfaces = async () => {
          const generation = ++refreshGeneration;
          try {
            const detected = await detectTauriLocalInterfaces();
            // Only apply result if this is still the latest generation
            if (generation === refreshGeneration) {
              interfaces = filterInterfacesForAdvertisement(detected);
              console.log("[discovery] refreshed desktop interfaces");
            }
          } catch (err) {
            console.warn("[discovery] failed to refresh interfaces:", err);
          }
        };

        // Event-driven refresh: react to browser network state changes and
        // tab visibility. `visibilitychange` catches the case where the OS
        // network flipped while the tab was hidden (no `online`/`offline`
        // event delivered).
        const onOnline = () => {
          refreshInterfaces();
        };
        const onOffline = () => {
          refreshInterfaces();
        };
        const onVisibility = () => {
          if (document.visibilityState === "visible") {
            refreshInterfaces();
          }
        };
        window.addEventListener("online", onOnline);
        window.addEventListener("offline", onOffline);
        document.addEventListener("visibilitychange", onVisibility);

        // Safety-net poll for IP-only changes that don't raise a browser
        // network-state event (DHCP renewal, VPN toggle on the same SSID).
        const refreshInterval = setInterval(
          refreshInterfaces,
          INTERFACE_REFRESH_SAFETY_INTERVAL_MS
        );

        console.log("[discovery] started (desktop)");

        // Stop discovery when the window unloads
        window.addEventListener("beforeunload", async () => {
          clearInterval(refreshInterval);
          window.removeEventListener("online", onOnline);
          window.removeEventListener("offline", onOffline);
          document.removeEventListener("visibilitychange", onVisibility);
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
