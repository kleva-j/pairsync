import type { MdnsService } from "@pairsync/core";
import Zeroconf from "react-native-zeroconf";

type ZeroconfResolvedService = {
  name: string;
  port: number;
  addresses?: string[];
  txt?: Record<string, string | number | boolean>;
};

export class MdnsServiceTypeError extends Error {
  constructor(serviceType: string, reason: string) {
    super(`Invalid mDNS service type '${serviceType}': ${reason}`);
    this.name = "MdnsServiceTypeError";
  }
}

function splitServiceType(serviceType: string): {
  type: string;
  protocol: "tcp" | "udp";
  domain: string;
} {
  const normalized = serviceType.replace(/^_/, "").replace(/\.$/, "");
  const [type, protocol, ...domainParts] = normalized.split(".");
  if (!type) {
    throw new MdnsServiceTypeError(serviceType, "missing service type");
  }
  if (protocol !== "_tcp" && protocol !== "_udp") {
    throw new MdnsServiceTypeError(
      serviceType,
      `invalid protocol '${protocol}', expected _tcp or _udp`,
    );
  }
  return {
    type,
    protocol: protocol.slice(1) as "tcp" | "udp",
    domain: `${domainParts.join(".")}.`,
  };
}

function txtRecord(
  txt: ZeroconfResolvedService["txt"],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(txt ?? {})) {
    result[key] = String(value);
  }
  return result;
}

function serviceAddresses(addresses: string[] | undefined): {
  ipv4: string[];
  ipv6: string[];
} {
  const ipv4: string[] = [];
  const ipv6: string[] = [];
  for (const address of addresses ?? []) {
    if (address.includes(":")) ipv6.push(address);
    else ipv4.push(address);
  }
  return { ipv4, ipv6 };
}

export class ReactNativeMdnsService implements MdnsService {
  private readonly zeroconf = new Zeroconf();
  private serviceName?: string;
  private foundHandler?: Parameters<MdnsService["onServiceFound"]>[0];
  private lostHandler?: Parameters<MdnsService["onServiceLost"]>[0];

  constructor() {
    this.zeroconf.on("resolved", (service: ZeroconfResolvedService) => {
      const { ipv4, ipv6 } = serviceAddresses(service.addresses);
      this.foundHandler?.({
        name: service.name,
        ipv4,
        ipv6,
        port: service.port,
        txt: txtRecord(service.txt),
      });
    });
    this.zeroconf.on("remove", (name: string) => {
      if (name !== this.serviceName) {
        this.lostHandler?.(name);
      }
    });
  }

  async advertise(
    serviceType: string,
    name: string,
    port: number,
    txt: Record<string, string>,
  ): Promise<void> {
    const service = splitServiceType(serviceType);
    this.serviceName = name;
    this.zeroconf.publishService(
      service.type,
      service.protocol,
      service.domain,
      name,
      port,
      txt,
    );
  }

  async browse(serviceType: string): Promise<void> {
    const service = splitServiceType(serviceType);
    this.zeroconf.scan(service.type, service.protocol, service.domain);
  }

  onServiceFound(handler: Parameters<MdnsService["onServiceFound"]>[0]): void {
    this.foundHandler = handler;
  }

  onServiceLost(handler: Parameters<MdnsService["onServiceLost"]>[0]): void {
    this.lostHandler = handler;
  }

  async unpublish(): Promise<void> {
    if (this.serviceName !== undefined) {
      this.zeroconf.unpublishService(this.serviceName);
      this.serviceName = undefined;
    }
    this.zeroconf.stop();
  }

  async close(): Promise<void> {
    this.zeroconf.removeDeviceListeners();
  }
}

export function createReactNativeMdnsService(): MdnsService {
  return new ReactNativeMdnsService();
}
