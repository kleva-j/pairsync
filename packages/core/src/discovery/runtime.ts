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
  const deviceManager = new DeviceManager(options.deviceManager);

  const multicast = new MulticastDiscovery({
    ...options.multicast,
    socket: options.adapter.createMulticastSocket(),
    heartbeat: options.heartbeat,
    onDeviceSeen: (device: Device) => {
      deviceManager.addOrUpdate(device);
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
    },
    onDeviceLost: (deviceId: string) => {
      deviceManager.remove(deviceId);
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
      await multicast.start();
      await mdns.start();
    },
    async stop(): Promise<void> {
      await multicast.stop();
      await mdns.stop();
      deviceManager.clear();
    },
  };
}
