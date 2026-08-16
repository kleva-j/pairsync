import { assign, setup } from "xstate";

import { CONNECTION_TIMEOUT } from "../../constants";
import type { Device } from "../../types";

/**
 * Maximum consecutive connection attempts before a retry is refused.
 * After this the caller must send RESET to return to IDLE.
 */
export const MAX_CONNECT_ATTEMPTS = 3;

/** Context carried by the device lifecycle machine. */
export interface DeviceMachineContext {
  /** The device currently being tracked, if any. */
  device: Device | null;
  /** Human-readable reason for the most recent failure, if any. */
  lastError: string | null;
  /** Consecutive connection attempts since the last success/reset. */
  connectAttempts: number;
}

export type DeviceMachineEvent =
  | { type: "START_SCAN" }
  | { type: "DEVICE_DISCOVERED"; device: Device }
  | { type: "DEVICE_LOST" }
  | { type: "CONNECT"; device: Device }
  | { type: "CONNECTED" }
  | { type: "CONNECT_FAILED"; reason: string }
  | { type: "DISCONNECT" }
  | { type: "RETRY" }
  | { type: "RESET" };

export const deviceMachine = setup({
  types: {} as {
    context: DeviceMachineContext;
    events: DeviceMachineEvent;
  },
  guards: {
    /**
     * A device is connectable when it advertises a transfer port and at
     * least one usable network interface.
     */
    canConnect: ({ event }) =>
      event.type === "CONNECT" &&
      event.device.port > 0 &&
      event.device.interfaces.some(
        (iface) => iface.preferred || iface.ipv4.length > 0 || iface.ipv6.length > 0,
      ),
    /** Retries are allowed up to MAX_CONNECT_ATTEMPTS. */
    canRetry: ({ context }) => context.connectAttempts < MAX_CONNECT_ATTEMPTS,
  },
  actions: {
    setDevice: assign({
      device: ({ event }) =>
        event.type === "DEVICE_DISCOVERED" || event.type === "CONNECT" ? event.device : null,
    }),
    clearDevice: assign({ device: null }),
    setError: assign({
      lastError: ({ event }) => (event.type === "CONNECT_FAILED" ? event.reason : null),
    }),
    setTimeoutError: assign({ lastError: () => `Connection timed out after ${CONNECTION_TIMEOUT}ms` }),
    clearError: assign({ lastError: null }),
    incrementAttempts: assign({ connectAttempts: ({ context }) => context.connectAttempts + 1 }),
    resetAttempts: assign({ connectAttempts: 0 }),
  },
}).createMachine({
  id: "device",
  initial: "idle",
  context: { device: null, lastError: null, connectAttempts: 0 },
  states: {
    idle: {
      on: {
        START_SCAN: "scanning",
      },
    },
    scanning: {
      on: {
        DEVICE_DISCOVERED: { target: "discovered", actions: "setDevice" },
        DEVICE_LOST: { target: "idle", actions: "clearDevice" },
      },
    },
    discovered: {
      on: {
        CONNECT: {
          target: "connecting",
          guard: "canConnect",
          actions: ["setDevice", "clearError", "incrementAttempts"],
        },
        DEVICE_LOST: { target: "scanning", actions: "clearDevice" },
      },
    },
    connecting: {
      after: {
        [CONNECTION_TIMEOUT]: { target: "error", actions: "setTimeoutError" },
      },
      on: {
        CONNECTED: { target: "connected", actions: ["clearError", "resetAttempts"] },
        CONNECT_FAILED: { target: "error", actions: "setError" },
      },
    },
    connected: {
      on: {
        DISCONNECT: { target: "idle", actions: ["clearDevice", "clearError", "resetAttempts"] },
        CONNECT_FAILED: { target: "error", actions: "setError" },
      },
    },
    error: {
      on: {
        RETRY: {
          target: "connecting",
          guard: "canRetry",
          actions: ["clearError", "incrementAttempts"],
        },
        RESET: { target: "idle", actions: ["clearDevice", "clearError", "resetAttempts"] },
      },
    },
  },
});
