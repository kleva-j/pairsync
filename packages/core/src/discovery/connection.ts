import { CONNECTION_TIMEOUT } from "../constants";
import { DISCOVERY_PORT } from "../protocol";
import { connectionBackoffDelay, selectConnectionCandidates } from "../network";
import { assertPositive } from "../utils";
import type { Device } from "../types";

/**
 * TCP connection initiation (Phase 2.4, N-251) — establishes the link
 * between two discovered devices before any transfer.
 *
 * The engine is **platform-agnostic**: all socket work goes through the
 * {@link TcpSocket} contract. Each app provides an adapter
 * (react-native-tcp-socket on mobile, a Rust/Tauri plugin on desktop, a
 * WebSocket bridge on web) so the same logic runs everywhere — same pattern
 * as {@link MulticastSocket} in `discovery/udp.ts`.
 *
 * For this phase the **handshake is the TCP connection establishment**
 * itself (the SYN/SYN-ACK/ACK + socket open). Plain TCP only — TLS is added
 * in Phase 4, and the application-level handshake messages (`prepare`,
 * `chunk`, ...) arrive with the transfer engine in Phase 3. The engine:
 *
 * 1. Ranks the device's advertised interfaces with
 *    `selectConnectionCandidates` (Wi-Fi IPv4 first, then Wi-Fi IPv6,
 *    Ethernet, Cellular, Other) and connects to the port from the device's
 *    heartbeat (`Device.port`, defaulting to `DISCOVERY_PORT` / 53350).
 * 2. Bounds each attempt by the connection timeout (`CONNECTION_TIMEOUT`,
 *    10s) and aborts a hanging attempt, resetting the socket before moving
 *    on.
 * 3. Falls back to the next candidate with exponential backoff
 *    (`connectionBackoffDelay`: 1s, 2s, 4s, …).
 * 4. When every candidate fails, rejects with a typed
 *    {@link ConnectionError}; per-attempt failures are also surfaced via
 *    `onError` so callers can observe retries.
 */

/** Platform TCP socket contract. Implemented by each app's adapter. */
export interface TcpSocket {
  /**
   * Opens a connection to `host:port`. Rejects when the peer refuses or is
   * unreachable. Adapters must support being called again after a
   * {@link TcpSocket.close} (a fresh attempt re-binds lazily).
   *
   * IPv6 link-local candidates (`fe80::/10`) are zone-scoped: adapters should
   * resolve the connecting interface themselves (as {@link MulticastDiscovery}
   * requires of its adapters) or the connect may fail on multi-interface hosts.
   */
  connect(host: string, port: number): Promise<void>;
  /**
   * Closes the socket (a no-op when nothing is connected). Must also abort
   * any connect still in flight, so the engine's timeout can move on to the
   * next candidate without waiting on a hung handshake.
   */
  close(): Promise<void>;
}

/** Why a connection attempt failed. */
export type ConnectionErrorCode = "no_candidates" | "timeout" | "connect_failed";

/**
 * Thrown when a connection cannot be established. `code` classifies the
 * terminal failure; `attempt` counts the attempts made (0 when the device
 * advertised nothing to try); `lastError` carries the underlying adapter or
 * socket error of the final attempt.
 */
export class ConnectionError extends Error {
  readonly code: ConnectionErrorCode;
  readonly deviceId: string;
  readonly attempt: number;
  readonly lastError: unknown;

  constructor(
    code: ConnectionErrorCode,
    deviceId: string,
    message: string,
    options: { attempt?: number; lastError?: unknown } = {},
  ) {
    super(message);
    this.name = "ConnectionError";
    this.code = code;
    this.deviceId = deviceId;
    this.attempt = options.attempt ?? 0;
    this.lastError = options.lastError;
  }
}

/** An established (handed-off) TCP connection to a device. */
export interface EstablishedConnection {
  readonly deviceId: string;
  /** The candidate address the connection was established on. */
  readonly address: string;
  /** The TCP port the connection was established on. */
  readonly port: number;
  /** The underlying socket, for the transfer engine to send over (Phase 3). */
  readonly socket: TcpSocket;
  /** Epoch ms when the connection completed. */
  readonly connectedAt: number;
  /** Closes the connection. */
  close(): Promise<void>;
}

/** Options for {@link ConnectionInitiator}; all optional except `socket`. */
export interface ConnectionInitiatorOptions {
  /** Platform socket adapter (see {@link TcpSocket}). */
  socket: TcpSocket;
  /** Per-attempt connection timeout in ms (default `CONNECTION_TIMEOUT` = 10s). */
  timeoutMs?: number;
  /** Backoff base in ms; the (n+1)-th attempt waits `base × 2^n` after n failures (default 1s). */
  backoffBaseMs?: number;
  /** Injectable sleep for tests (default `setTimeout`). */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable clock for `connectedAt` (default `Date.now`). */
  now?: () => number;
  /** Called with each per-attempt failure so callers observe retries. */
  onError?: (error: ConnectionError) => void;
}

/** True for a usable TCP port (1–65535). */
function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65_535;
}

/** The port to connect on: the device's advertised port, else 53350. */
function resolvePort(port: number): number {
  return isValidPort(port) ? port : DISCOVERY_PORT;
}

/**
 * Establishes TCP connections to discovered devices: picks the best
 * advertised endpoint, opens a socket to the heartbeated port within the
 * connection timeout, and retries every candidate with exponential backoff
 * until one succeeds or the list is exhausted.
 */
export class ConnectionInitiator {
  private readonly socket: TcpSocket;
  private readonly timeoutMs: number;
  private readonly backoffBaseMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly onError?: (error: ConnectionError) => void;

  constructor(options: ConnectionInitiatorOptions) {
    assertPositive("timeoutMs", options.timeoutMs ?? CONNECTION_TIMEOUT);
    assertPositive("backoffBaseMs", options.backoffBaseMs ?? 1_000);
    this.socket = options.socket;
    this.timeoutMs = options.timeoutMs ?? CONNECTION_TIMEOUT;
    this.backoffBaseMs = options.backoffBaseMs ?? 1_000;
    this.sleep =
      options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? (() => Date.now());
    this.onError = options.onError;
  }

  /**
   * Connects to `device`, trying its advertised candidates in priority
   * order. Resolves with an established connection on success; rejects with
   * a {@link ConnectionError} when nothing can be reached.
   */
  async connect(device: Device): Promise<EstablishedConnection> {
    const candidates = selectConnectionCandidates(device.interfaces);
    if (candidates.length === 0) {
      throw new ConnectionError(
        "no_candidates",
        device.device_id,
        `Device ${device.device_id} advertises no reachable connection endpoint`,
      );
    }

    const port = resolvePort(device.port);
    let lastCode: ConnectionErrorCode = "connect_failed";
    let lastError: unknown;

    for (let index = 0; index < candidates.length; index++) {
      const candidate = candidates[index]!;
      if (index > 0) {
        await this.sleep(connectionBackoffDelay(index - 1, this.backoffBaseMs));
      }

      try {
        await this.connectWithTimeout(candidate.address, port, device.device_id);
        const connection: EstablishedConnection = {
          deviceId: device.device_id,
          address: candidate.address,
          port,
          socket: this.socket,
          connectedAt: this.now(),
          close: () => this.socket.close(),
        };
        return connection;
      } catch (error) {
        if (isTimeoutError(error)) {
          lastCode = "timeout";
          // Best effort: a half-open socket must not leak into the next attempt.
          try {
            await this.socket.close();
          } catch {
            // Non-fatal during failure handling.
          }
        } else {
          lastCode = "connect_failed";
        }
        lastError = error;
        this.onError?.(
          new ConnectionError(
            lastCode,
            device.device_id,
            `Connection attempt ${index + 1} to ${candidate.address}:${port} failed`,
            { attempt: index + 1, lastError: error },
          ),
        );
      }
    }

    throw new ConnectionError(
      lastCode,
      device.device_id,
      `Unable to connect to ${device.device_id} after ${candidates.length} attempt(s)`,
      { attempt: candidates.length, lastError },
    );
  }

  /** Races the socket connect against the per-attempt timeout. */
  private connectWithTimeout(
    address: string,
    port: number,
    deviceId: string,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const handle = setTimeout(() => {
        reject(
          new ConnectionError(
            "timeout",
            deviceId,
            `Connection to ${address}:${port} timed out after ${this.timeoutMs}ms`,
          ),
        );
      }, this.timeoutMs);
      this.socket.connect(address, port).then(
        (value) => {
          clearTimeout(handle);
          resolve(value);
        },
        (error) => {
          clearTimeout(handle);
          reject(error);
        },
      );
    });
  }
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof ConnectionError && error.code === "timeout";
}
