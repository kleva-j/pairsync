import { assign, setup } from "xstate";

import { HEARTBEAT_TIMEOUT } from "../../constants";
import type { Device } from "../../types";

/**
 * Discovery machine: manages the network scan lifecycle, the in-memory
 * device list, and expiry of stale devices.
 *
 * The machine is purely declarative — the actual socket/mDNS work lives in
 * the discovery actor (Phase 1.3), which feeds it DEVICE_FOUND /
 * DEVICE_EXPIRED events.
 */
export interface DiscoveryMachineContext {
  /** Devices seen during the current scan, keyed by device_id. */
  devices: Map<string, Device>;
  /** Epoch ms when the current scan started (null when idle). */
  scanStartedAt: number | null;
}

export type DiscoveryMachineEvent =
  | { type: "START_SCAN" }
  | { type: "STOP_SCAN" }
  | { type: "DEVICE_FOUND"; device: Device }
  | { type: "DEVICE_EXPIRED"; deviceId: string }
  | { type: "CLEAR" };

const initialContext: DiscoveryMachineContext = {
  devices: new Map(),
  scanStartedAt: null,
};

export const discoveryMachine = setup({
  types: {} as {
    context: DiscoveryMachineContext;
    events: DiscoveryMachineEvent;
  },
  guards: {
    /** A device is new to this scan (not already tracked). */
    isNewDevice: ({ context, event }) =>
      event.type === "DEVICE_FOUND" && !context.devices.has(event.device.device_id),
    /** A device must be tracked before it can be expired. */
    isTrackedDevice: ({ context, event }) =>
      event.type === "DEVICE_EXPIRED" && context.devices.has(event.deviceId),
  },
  actions: {
    addDevice: assign({
      devices: ({ context, event }) => {
        const devices = new Map(context.devices);
        if (event.type === "DEVICE_FOUND") {
          devices.set(event.device.device_id, event.device);
        }
        return devices;
      },
    }),
    removeDevice: assign({
      devices: ({ context, event }) => {
        const devices = new Map(context.devices);
        if (event.type === "DEVICE_EXPIRED") {
          devices.delete(event.deviceId);
        }
        return devices;
      },
    }),
    clearDevices: assign({ devices: () => new Map() }),
    startScan: assign({
      scanStartedAt: () => Date.now(),
      devices: () => new Map(),
    }),
    stopScan: assign({ scanStartedAt: () => null }),
  },
}).createMachine({
  id: "discovery",
  initial: "idle",
  context: initialContext,
  states: {
    idle: {
      on: {
        START_SCAN: { target: "scanning", actions: "startScan" },
      },
    },
    scanning: {
      on: {
        DEVICE_FOUND: {
          target: "scanning",
          guard: "isNewDevice",
          actions: "addDevice",
        },
        DEVICE_EXPIRED: {
          target: "scanning",
          guard: "isTrackedDevice",
          actions: "removeDevice",
        },
        STOP_SCAN: { target: "idle", actions: "stopScan" },
        CLEAR: { target: "scanning", actions: "clearDevices" },
      },
      after: {
        // Stale-device sweep: devices that have not been refreshed within
        // HEARTBEAT_TIMEOUT are dropped. The actor sends DEVICE_EXPIRED per
        // device; this self-loop simply documents the expiry cadence.
        [HEARTBEAT_TIMEOUT]: { target: "scanning" },
      },
    },
  },
});
