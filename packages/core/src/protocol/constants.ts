/**
 * Shared protocol constants (Phase 1.5, N-243).
 *
 * Single source of truth for the wire protocol: versioning, network ports,
 * HTTP headers, and message type discriminators. Every platform imports
 * these from `@pairsync/core` so the values can never drift.
 */

/** Protocol version (MAJOR.MINOR scheme) shared by every platform. */
export const PROTOCOL_VERSION = "1.0";

/** Custom UDP multicast discovery port (distinct from standard mDNS, port 5353). */
export const DISCOVERY_PORT = 53_350;

/** Standard mDNS port used for `.local` name resolution during discovery. */
export const MDNS_PORT = 5_353;

/** First port in the TCP transfer range. */
export const TRANSFER_PORT_START = 53_351;

/** Last port in the TCP transfer range. */
export const TRANSFER_PORT_END = 53_360;

/** All TCP transfer ports (53351–53360), frozen against runtime mutation. */
export const TRANSFER_PORTS = Object.freeze(
  Array.from(
    { length: TRANSFER_PORT_END - TRANSFER_PORT_START + 1 },
    (_, i) => TRANSFER_PORT_START + i,
  ),
);

/**
 * HTTP headers sent with every PairSync request. The receiver uses them for
 * protocol-version negotiation, request nonces, device identity, and the
 * sender's certificate fingerprint.
 */
export const HTTP_HEADERS = Object.freeze({
  VERSION: "X-PairSync-Version",
  NONCE: "X-Nonce",
  DEVICE_ID: "X-Device-ID",
  CERT_FINGERPRINT: "X-Cert-Fingerprint",
} as const);

/** Wire discriminators for each protocol message shape in `src/types/protocol.ts`. */
export const MESSAGE_TYPES = Object.freeze({
  HEARTBEAT: "heartbeat",
  PREPARE: "prepare",
  PREPARE_RESPONSE: "prepare_response",
  CHUNK_REQUEST: "chunk_request",
  CHUNK_RESPONSE: "chunk_response",
  RESUME: "resume",
} as const);

/** Union of all message type wire strings. */
export type MessageType = (typeof MESSAGE_TYPES)[keyof typeof MESSAGE_TYPES];
