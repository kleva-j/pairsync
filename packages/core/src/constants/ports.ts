/** Primary UDP discovery port (multicast + mDNS). */
export const DISCOVERY_PORT = 53350;

/** First port in the TCP transfer range. */
export const TRANSFER_PORT_START = 53351;

/** Last port in the TCP transfer range. */
export const TRANSFER_PORT_END = 53360;

/** All TCP transfer ports (53351–53360). */
export const TRANSFER_PORTS = Array.from(
  { length: TRANSFER_PORT_END - TRANSFER_PORT_START + 1 },
  (_, i) => TRANSFER_PORT_START + i,
);
