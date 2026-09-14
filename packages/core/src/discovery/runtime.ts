import type { PlatformNetworkAdapter } from "../platform";
import type { Device, HeartbeatPayload } from "../types";

import { MulticastDiscovery, type MulticastDiscoveryOptions } from "./udp";
import { DeviceManager, type DeviceManagerOptions } from "./deviceManager";
import { MdnsDiscovery, type MdnsDiscoveryOptions } from "./mdns";

export type DiscoveryRuntimeErrorSource = "multicast" | "mdns";

export interface DiscoveryRuntimeOptions {
  adapter: Pick<PlatformNetworkAdapter, "createMulticastSocket" | "createMdnsService">;
  heartbeat: () => HeartbeatPayload;
  deviceManager?: DeviceManagerOptions;
  multicast?: Omit<
    MulticastDiscoveryOptions,
    "socket" | "heartbeat" | "onDeviceSeen" | "onError"
  >;
  mdns?: Omit<
    MdnsDiscoveryOptions,
    "mdnsService" | "heartbeat" | "onDeviceSeen" | "onDeviceLost" | "onError"
  >;
  onError?: (source: DiscoveryRuntimeErrorSource, error: unknown) => void;
}

export interface DiscoveryRuntime {
  deviceManager: DeviceManager;
  multicast: MulticastDiscovery;
  mdns: MdnsDiscovery;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function createDiscoveryRuntime(
  options: DiscoveryRuntimeOptions,
): DiscoveryRuntime {
  // Track which discovery sources have seen each device to prevent
  // premature removal when one source loses a device that another
  // source still reports.
  const devicePresence = new Map<string, Set<"multicast" | "mdns">>();

  const deviceManager = new DeviceManager({
    ...options.deviceManager,
    onDeviceRemoved: (deviceId: string) => {
      // Clean up presence tracking when DeviceManager removes a device
      // (e.g., due to heartbeat timeout)
      devicePresence.delete(deviceId);
      options.deviceManager?.onDeviceRemoved?.(deviceId);
    },
  });

  const multicast = new MulticastDiscovery({
    ...options.multicast,
    socket: options.adapter.createMulticastSocket(),
    heartbeat: options.heartbeat,
    onDeviceSeen: (device: Device) => {
      deviceManager.addOrUpdate(device);
      // Track that multicast has seen this device
      const sources = devicePresence.get(device.device_id) ?? new Set();
      sources.add("multicast");
      devicePresence.set(device.device_id, sources);
    },
    onError: (error: unknown) => {
      options.onError?.("multicast", error);
    },
  });

  const mdns = new MdnsDiscovery({
    ...options.mdns,
    mdnsService: options.adapter.createMdnsService(),
    heartbeat: options.heartbeat,
    onDeviceSeen: (device: Device) => {
      deviceManager.addOrUpdate(device);
      // Track that mDNS has seen this device
      const sources = devicePresence.get(device.device_id) ?? new Set();
      sources.add("mdns");
      devicePresence.set(device.device_id, sources);
    },
    onDeviceLost: (deviceId: string) => {
      // Remove mDNS from this device's presence tracking
      const sources = devicePresence.get(deviceId);
      if (sources) {
        sources.delete("mdns");
        // Only remove the device if no sources are still reporting it
        if (sources.size === 0) {
          deviceManager.remove(deviceId);
          devicePresence.delete(deviceId);
        } else {
          devicePresence.set(deviceId, sources);
        }
      }
    },
    onError: (error: unknown) => {
      options.onError?.("mdns", error);
    },
  });

  return {
    deviceManager,
    multicast,
    mdns,
    async start(): Promise<void> {
      try {
        await multicast.start();
        await mdns.start();
      } catch (error) {
        // Roll back multicast if mDNS startup fails. The rollback error itself
        // goes through `onError` (not thrown) so the original startup error can
        // propagate — callers watching `onError` see the rollback failure,
        // callers catching the throw see the primary cause.
        try {
          await multicast.stop();
        } catch (stopError) {
          options.onError?.("multicast", stopError);
        }
        throw error;
      }
    },
    async stop(): Promise<void> {
      const errors: Array<{ source: DiscoveryRuntimeErrorSource; error: unknown }> = [];
      try {
        await multicast.stop();
      } catch (error) {
        errors.push({ source: "multicast", error });
      }
      try {
        await mdns.stop();
      } catch (error) {
        errors.push({ source: "mdns", error });
      }
      // Always clear the device manager and presence tracking, even if either stop() failed.
      deviceManager.clear();
      devicePresence.clear();
      if (errors.length > 0) {
        // Wrap each failure so callers can inspect source + original cause:
        //   err.errors[i].source  — "multicast" | "mdns"
        //   err.errors[i].cause   — the original thrown value
        throw new AggregateError(
          errors.map(({ source, error }) => {
            const message =
              error instanceof Error ? error.message : String(error);
            return Object.assign(new Error(`[${source}] ${message}`), {
              source,
              cause: error,
            });
          }),
          "Discovery runtime shutdown failed",
        );
      }
    },
  };
}
