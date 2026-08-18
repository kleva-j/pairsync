export {
  MULTICAST_GROUPS,
  defaultDiscoveryScheduler,
  MulticastDiscovery,
} from "./udp";
export type {
  MulticastGroup,
  MulticastSocket,
  DiscoveryScheduler,
  MulticastDiscoveryOptions,
} from "./udp";

export { MdnsDiscovery } from "./mdns";
export type { MdnsService, MdnsDiscoveryOptions } from "./mdns";
