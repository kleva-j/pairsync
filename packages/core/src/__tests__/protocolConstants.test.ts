import { describe, expect, it } from "vitest";

import {
  DISCOVERY_PORT,
  HTTP_HEADERS,
  MESSAGE_TYPES,
  PROTOCOL_VERSION,
  TRANSFER_PORT_END,
  TRANSFER_PORT_START,
  TRANSFER_PORTS,
} from "../protocol";
import {
  DISCOVERY_PORT as ENTRY_DISCOVERY_PORT,
  HTTP_HEADERS as ENTRY_HTTP_HEADERS,
  MESSAGE_TYPES as ENTRY_MESSAGE_TYPES,
  PROTOCOL_VERSION as ENTRY_PROTOCOL_VERSION,
} from "../index";

describe("protocol version", () => {
  it("uses the MAJOR.MINOR scheme with no prerelease suffix", () => {
    expect(PROTOCOL_VERSION).toBe("1.0");
    expect(PROTOCOL_VERSION).toMatch(/^\d+\.\d+$/);
  });
});

describe("protocol ports", () => {
  it("uses 53350 for UDP discovery", () => {
    expect(DISCOVERY_PORT).toBe(53_350);
  });

  it("exposes the full 53351–53360 TCP range", () => {
    expect(TRANSFER_PORT_START).toBe(53_351);
    expect(TRANSFER_PORT_END).toBe(53_360);
    expect(TRANSFER_PORTS).toHaveLength(10);
    expect(TRANSFER_PORTS[0]).toBe(53_351);
    expect(TRANSFER_PORTS.at(-1)).toBe(53_360);
  });

  it("has no overlapping or duplicate ports", () => {
    const unique = new Set(TRANSFER_PORTS);
    expect(unique.size).toBe(TRANSFER_PORTS.length);
    expect(unique.has(DISCOVERY_PORT)).toBe(false);
  });
});

describe("HTTP headers", () => {
  it("defines all four PairSync headers with exact wire names", () => {
    expect(HTTP_HEADERS.VERSION).toBe("X-PairSync-Version");
    expect(HTTP_HEADERS.NONCE).toBe("X-Nonce");
    expect(HTTP_HEADERS.DEVICE_ID).toBe("X-Device-ID");
    expect(HTTP_HEADERS.CERT_FINGERPRINT).toBe("X-Cert-Fingerprint");
  });

  it("uses unique header names", () => {
    const names = Object.values(HTTP_HEADERS);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("message types", () => {
  it("defines a type for every protocol message shape", () => {
    expect(MESSAGE_TYPES.HEARTBEAT).toBe("heartbeat");
    expect(MESSAGE_TYPES.PREPARE).toBe("prepare");
    expect(MESSAGE_TYPES.PREPARE_RESPONSE).toBe("prepare_response");
    expect(MESSAGE_TYPES.CHUNK_REQUEST).toBe("chunk_request");
    expect(MESSAGE_TYPES.CHUNK_RESPONSE).toBe("chunk_response");
    expect(MESSAGE_TYPES.RESUME).toBe("resume");
  });

  it("uses unique, lowercase wire strings", () => {
    const values = Object.values(MESSAGE_TYPES);
    expect(new Set(values).size).toBe(values.length);
    for (const value of values) {
      expect(value).toMatch(/^[a-z_]+$/);
    }
  });
});

describe("core entry exports", () => {
  it("re-exports the protocol constants from @pairsync/core's entry", () => {
    expect(ENTRY_PROTOCOL_VERSION).toBe(PROTOCOL_VERSION);
    expect(ENTRY_DISCOVERY_PORT).toBe(DISCOVERY_PORT);
    expect(ENTRY_HTTP_HEADERS).toBe(HTTP_HEADERS);
    expect(ENTRY_MESSAGE_TYPES).toBe(MESSAGE_TYPES);
  });
});
