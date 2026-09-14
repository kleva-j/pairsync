import "@/global.css";

import * as Network from "expo-network";
import Constants from "expo-constants";
import {
  filterInterfacesForAdvertisement,
  type DiscoveryRuntime,
  type HeartbeatPayload,
  type NetworkInterface,
  type Platform,
  type Device,
} from "@pairsync/core";

import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { Platform as ReactNativePlatform } from "react-native";
import { HeroUINativeProvider } from "heroui-native";
import { useEffect, useRef } from "react";
import { Stack } from "expo-router";

import { AppThemeProvider } from "@/contexts/app-theme-context";

export const unstable_settings = {
  initialRouteName: "(drawer)",
};

function StackLayout() {
  return (
    <Stack screenOptions={{}}>
      <Stack.Screen name="(drawer)" options={{ headerShown: false }} />
      <Stack.Screen
        name="modal"
        options={{ title: "Modal", presentation: "modal" }}
      />
    </Stack>
  );
}

function getNativePairSyncPlatform(): Platform {
  if (ReactNativePlatform.OS === "ios") return "ios";
  if (ReactNativePlatform.OS === "android") return "android";
  return "unknown";
}

function getNativeDeviceAlias(): string {
  return Constants.deviceName?.trim() || "PairSync Device";
}

function toPairSyncInterfaceType(
  type: Network.NetworkStateType | undefined
): NetworkInterface["type"] {
  switch (type) {
    case Network.NetworkStateType.WIFI:
      return "Wi-Fi";
    case Network.NetworkStateType.ETHERNET:
      return "Ethernet";
    case Network.NetworkStateType.CELLULAR:
      return "Cellular";
    default:
      return "Other";
  }
}

// Safety-net poll interval (ms) in case no `Network.addNetworkStateListener`
// event fires for an IP-only change (DHCP renewal, VPN toggle on the same
// SSID, captive-portal handoff). Primary refresh is event-driven via the
// expo-network listener wired up inside the effect below.
const INTERFACE_REFRESH_SAFETY_INTERVAL_MS = 5 * 60_000;

async function detectNativeInterfaces(): Promise<NetworkInterface[]> {
  const [state, ipAddress] = await Promise.all([
    Network.getNetworkStateAsync(),
    Network.getIpAddressAsync(),
  ]);
  if (state.isConnected === false || ipAddress === "0.0.0.0") return [];
  return filterInterfacesForAdvertisement([
    {
      name: "expo-network",
      type: toPairSyncInterfaceType(state.type),
      ipv4: [ipAddress],
      ipv6: [],
      preferred: true,
    },
  ]);
}

export default function Layout() {
  // Stable device id for this app instance (kept for the lifetime of the layout)
  const deviceIdRef = useRef<string>(`dev-${Math.floor(Math.random() * 1e9)}`);

  useEffect(() => {
    // Only attempt wiring on real React Native runtimes. This guard prevents test
    // environments (jsdom) and web from importing native adapters.
    const isReactNative =
      typeof navigator !== "undefined" &&
      (navigator as any).product === "ReactNative";
    if (!isReactNative) return undefined;

    let stopped = false;
    let runtime: DiscoveryRuntime | null = null;
    let refreshTimer: ReturnType<typeof setInterval> | null = null;
    let networkSubscription: { remove: () => void } | null = null;
    // Closure variable holds the current interfaces so heartbeat() can
    // always read the latest value. Scoped to this effect's lifetime; no
    // ref is needed because there are no re-renders (deps: []).
    let interfaces: NetworkInterface[] = [];

    const refreshInterfaces = async () => {
      if (stopped) return;
      try {
        interfaces = await detectNativeInterfaces();
        console.log("[discovery] refreshed native interfaces");
      } catch (err) {
        console.warn("[discovery] failed to refresh interfaces:", err);
      }
    };

    (async () => {
      try {
        // Dynamic import prevents bundlers/tests from resolving native-only
        // modules at load time.
        const platformMod = await import("../src/platform");
        const core = await import("@pairsync/core");

        const adapter = platformMod.createReactNativePlatformNetwork();

        // Initial interface detection
        await refreshInterfaces();

        // Build a minimal heartbeat payload provider. Platform and interfaces
        // are intentionally conservative here — apps should provide a richer
        // value in production.
        const heartbeat = (): HeartbeatPayload => ({
          device_id: deviceIdRef.current,
          alias: getNativeDeviceAlias(),
          platform: getNativePairSyncPlatform(),
          interfaces,
          port: core.DISCOVERY_PORT,
        });

        runtime = core.createDiscoveryRuntime({
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

        if (stopped) {
          await runtime.stop();
          return;
        }

        await runtime.start();

        if (stopped) {
          await runtime.stop();
          return;
        }

        // Event-driven refresh: OS reports a network-state change (SSID
        // change, cellular <-> Wi-Fi handoff, connection lost/regained).
        networkSubscription = Network.addNetworkStateListener(() => {
          refreshInterfaces();
        });

        // Safety-net poll for IP-only changes that don't fire a network
        // state event (DHCP renewal, VPN toggle on the same SSID).
        refreshTimer = setInterval(
          refreshInterfaces,
          INTERFACE_REFRESH_SAFETY_INTERVAL_MS
        );

        console.log("[discovery] started (native)");
      } catch (err) {
        console.warn("[discovery] failed to start native adapters:", err);
      }
    })();

    return () => {
      if (stopped) return;
      stopped = true;
      if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
      if (networkSubscription) {
        networkSubscription.remove();
        networkSubscription = null;
      }
      (async () => {
        try {
          if (runtime) await runtime.stop();
        } catch {
          /* ignore */
        }
        console.log("[discovery] stopped (native)");
      })();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <AppThemeProvider>
          <HeroUINativeProvider>
            <StackLayout />
          </HeroUINativeProvider>
        </AppThemeProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
