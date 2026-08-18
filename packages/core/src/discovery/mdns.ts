import { SERVICE_TYPE, PROTOCOL_VERSION } from "../protocol";
import type { Device, HeartbeatPayload } from "../types";

/**
 * mDNS discovery (Phase 2.2, N-249) — Tier 2 of the discovery stack.
 *
 * Advertises the local device as a `_pairsync._tcp.local` service and
 * browses for peers on the network. Cross-subnet discovery relies on an
 * mDNS repeater (a separate concern outside this engine).
 *
 * The engine is **platform-agnostic**: all mDNS operations go through the
 * {@link MdnsService} contract. Each app provides an adapter
 * (react-native-mdns on mobile, a Rust/Tauri plugin on desktop) so the
 * same logic runs everywhere — same pattern as {@link MulticastDiscovery}
 * in `discovery/udp.ts`.
 *
 * When the platform adapter is unavailable, callers should skip Tier 2
 * entirely and fall back to manual IP entry (Tier 3).
 */

/** Platform mDNS service contract. Implemented by each app's adapter. */
export interface MdnsService {
  /**
   * Advertises a service under the given name.
   * @param name - The service name (e.g. "pairsync-abc123")
   * @param port - The port the service listens on
   * @param txt - TXT record key-value pairs
   */
  advertise(name: string, port: number, txt: Record<string, string>): Promise<void>;

  /**
   * Starts browsing for services of the given type.
   * Found/lost events are delivered via the registered callbacks.
   * @param serviceType - The mDNS service type (e.g. "_pairsync._tcp.local")
   */
  browse(serviceType: string): Promise<void>;

  /**
   * Registers a callback for when a matching service is found on the network.
   * The adapter should call this once during setup (before browse()).
   */
  onServiceFound(
    handler: (service: {
      name: string;
      host: string;
      port: number;
      txt: Record<string, string>;
    }) => void,
  ): void;

  /**
   * Registers a callback for when a previously-found service is lost.
   * The adapter should call this once during setup (before browse()).
   */
  onServiceLost(handler: (name: string) => void): void;

  /** Removes the advertised service. */
  unpublish(): Promise<void>;

  /** Releases all mDNS resources. */
  close(): Promise<void>;
}

export interface MdnsDiscoveryOptions {
  /** Platform mDNS adapter (see {@link MdnsService}). */
  mdnsService: MdnsService;

  /**
   * Returns the local heartbeat payload. The `device_id` must be stable
   * for the engine's lifetime — it is captured once for own-echo filtering.
   */
  heartbeat: () => HeartbeatPayload;

  /**
   * Service name for mDNS advertisement (default: "pairsync-{device_id}").
   * Override for custom naming schemes.
   */
  serviceName?: string;

  /** Injectable clock for `last_seen_at` (default `Date.now`). */
  now?: () => number;

  /** Called with each validated peer device. */
  onDeviceSeen?: (device: Device) => void;

  /** Called when a peer service disappears from the network. */
  onDeviceLost?: (deviceId: string) => void;

  /** Called for non-fatal mDNS/parse failures so discovery keeps running. */
  onError?: (error: unknown) => void;
}

/**
 * Validates a parsed TXT record for the minimum required fields.
 * Returns the validated device info or throws if the record is malformed.
 */
function parseTxtRecord(
  txt: Record<string, string>,
): { device_id: string; alias: string; platform: string } {
  const { device_id, alias, platform } = txt;
  if (typeof device_id !== "string" || device_id.length === 0) {
    throw new Error("mDNS TXT record missing device_id");
  }
  if (typeof alias !== "string") {
    throw new Error("mDNS TXT record missing alias");
  }
  if (typeof platform !== "string") {
    throw new Error("mDNS TXT record missing platform");
  }
  return { device_id, alias, platform };
}

/**
 * Drives mDNS discovery over a platform adapter: advertises the local
 * device and browses for peers. Found services are validated and surfaced
 * via `onDeviceSeen`; lost services via `onDeviceLost`. Failures are
 * non-fatal and reported through `onError`.
 */
export class MdnsDiscovery {
  private readonly mdnsService: MdnsService;
  private readonly heartbeat: () => HeartbeatPayload;
  private readonly serviceName: string;
  private readonly now: () => number;
  private readonly onDeviceSeen?: (device: Device) => void;
  private readonly onDeviceLost?: (deviceId: string) => void;
  private readonly onError?: (error: unknown) => void;
  private readonly ownDeviceId: string;

  private started = false;
  private startPromise: Promise<void> | null = null;
  private stopPromise: Promise<void> | null = null;
  /** Maps service names to device_ids for loss tracking. */
  private readonly serviceNameToDeviceId = new Map<string, string>();

  constructor(options: MdnsDiscoveryOptions) {
    this.mdnsService = options.mdnsService;
    this.heartbeat = options.heartbeat;
    this.ownDeviceId = this.heartbeat().device_id;
    this.serviceName =
      options.serviceName ?? `pairsync-${this.ownDeviceId}`;
    this.now = options.now ?? (() => Date.now());
    this.onDeviceSeen = options.onDeviceSeen;
    this.onDeviceLost = options.onDeviceLost;
    this.onError = options.onError;

    // Register handlers upfront — the started guard in the callbacks ensures
    // events are only surfaced while the engine is running.
    this.mdnsService.onServiceFound((service) => this.handleServiceFound(service));
    this.mdnsService.onServiceLost((name) => this.handleServiceLost(name));
  }

  /** Advertises the local service and starts browsing for peers. */
  async start(): Promise<void> {
    if (this.startPromise) return this.startPromise;
    if (this.started) return;
    // Wait for any in-flight stop to finish first.
    if (this.stopPromise) await this.stopPromise;
    if (this.started) return;
    this.started = true;

    const run = (async () => {
      const payload = this.heartbeat();
      const txt: Record<string, string> = {
        device_id: payload.device_id,
        alias: payload.alias,
        platform: payload.platform,
        version: PROTOCOL_VERSION,
      };
      if (payload.cert_fingerprint !== undefined) {
        txt.cert_fingerprint = payload.cert_fingerprint;
      }

      try {
        await this.mdnsService.advertise(this.serviceName, payload.port, txt);
      } catch (error) {
        this.reportError(error);
      }

      // Check if stopped during advertise
      if (!this.started) return;

      try {
        await this.mdnsService.browse(SERVICE_TYPE);
      } catch (error) {
        this.reportError(error);
      }
    })();

    this.startPromise = run.finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  /** Unpublishes the service and releases all mDNS resources. */
  async stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise;
    if (!this.started) return;
    this.started = false;

    const run = (async () => {
      try {
        await this.mdnsService.unpublish();
      } catch (error) {
        this.reportError(error);
      }
      try {
        await this.mdnsService.close();
      } catch (error) {
        this.reportError(error);
      }
      this.serviceNameToDeviceId.clear();
    })();

    this.stopPromise = run.finally(() => {
      this.stopPromise = null;
    });
    return this.stopPromise;
  }

  private handleServiceFound(service: {
    name: string;
    host: string;
    port: number;
    txt: Record<string, string>;
  }): void {
    if (!this.started) return;

    let parsed: { device_id: string; alias: string; platform: string };
    try {
      parsed = parseTxtRecord(service.txt);
    } catch (error) {
      this.reportError(error);
      return;
    }

    // Skip own service
    if (parsed.device_id === this.ownDeviceId) return;

    this.serviceNameToDeviceId.set(service.name, parsed.device_id);

    const device: Device = {
      device_id: parsed.device_id,
      alias: parsed.alias,
      platform: parsed.platform as Device["platform"],
      interfaces: [
        {
          type: "Other",
          ipv4: [service.host],
          ipv6: [],
          preferred: true,
        },
      ],
      port: service.port,
      last_seen_at: this.now(),
    };

    if (service.txt.cert_fingerprint !== undefined) {
      device.cert_fingerprint = service.txt.cert_fingerprint;
    }

    this.onDeviceSeen?.(device);
  }

  private handleServiceLost(name: string): void {
    if (!this.started) return;

    const deviceId = this.serviceNameToDeviceId.get(name);
    if (deviceId === undefined) return;

    this.serviceNameToDeviceId.delete(name);
    this.onDeviceLost?.(deviceId);
  }

  private reportError(error: unknown): void {
    this.onError?.(error);
  }
}
