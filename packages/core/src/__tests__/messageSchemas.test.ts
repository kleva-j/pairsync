import { describe, expect, it, vi } from "vitest";

import { MESSAGE_TYPES, PROTOCOL_VERSION } from "../protocol";
import {
  buildChunkRequest,
  buildChunkResponse,
  buildPrepareRequest,
  buildPrepareResponse,
  buildResumeRequest,
  buildTransferMessage,
  chunkRequestSchema,
  chunkResponseSchema,
  prepareRequestSchema,
  prepareResponseSchema,
  resumeRequestSchema,
  transferMessageSchema,
} from "../protocol";
import type {
  PrepareResponse,
  PrepareRequest,
  ChunkResponse,
  ResumeRequest,
  ChunkRequest,
} from "../types";
import type { TransferMessage } from "../protocol";

const FILE_HASH =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const CHUNK_HASHES = [
  "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3",
  "c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
  "d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5",
];

const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MiB

// 16 MiB file at 4 MiB chunks ⇒ exactly 4 chunks (uniform chunk layout).
const validPrepare: PrepareRequest = {
  transfer_id: "t-1",
  file_id: "f-1",
  file_name: "notes.txt",
  file_size: 4 * CHUNK_SIZE,
  chunk_size: CHUNK_SIZE,
  total_chunks: 4,
  hash_algorithm: "SHA-256",
  file_hash: FILE_HASH,
  chunk_hashes: CHUNK_HASHES,
  timestamp: 1_700_000_000_000,
};

const validPrepareResponse: PrepareResponse = {
  transfer_id: "t-1",
  accepted: true,
};

const validChunkRequest: ChunkRequest = {
  transfer_id: "t-1",
  chunk_indices: [0, 1, 2],
};

const validChunkResponse: ChunkResponse = {
  transfer_id: "t-1",
  chunk_index: 1,
  data: new Uint8Array([104, 101, 108, 108, 111]), // "hello"
  hash: FILE_HASH,
};

/** Base64-encodes bytes without Node-specific APIs (matches the schema's wire format). */
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

const validResume: ResumeRequest = {
  transfer_id: "t-1",
  chunk_bitmap: [true, false, true, false],
};

describe("prepareRequestSchema", () => {
  it("parses a valid prepare request and pins the wire discriminator", () => {
    const result = prepareRequestSchema.safeParse({
      ...validPrepare,
      type: MESSAGE_TYPES.PREPARE,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("prepare");
      expect(result.data.total_chunks).toBe(4);
    }
  });

  it("rejects a missing discriminator and a wrong discriminator", () => {
    expect(prepareRequestSchema.safeParse({ ...validPrepare }).success).toBe(
      false,
    );
    expect(
      prepareRequestSchema.safeParse({
        ...validPrepare,
        type: MESSAGE_TYPES.HEARTBEAT,
      }).success,
    ).toBe(false);
  });

  it("validates numbers, the hash algorithm, and the hash arrays", () => {
    expect(
      prepareRequestSchema.safeParse({
        ...validPrepare,
        type: MESSAGE_TYPES.PREPARE,
        file_size: -1,
      }).success,
    ).toBe(false);
    expect(
      prepareRequestSchema.safeParse({
        ...validPrepare,
        type: MESSAGE_TYPES.PREPARE,
        chunk_size: 0,
      }).success,
    ).toBe(false);
    expect(
      prepareRequestSchema.safeParse({
        ...validPrepare,
        type: MESSAGE_TYPES.PREPARE,
        total_chunks: 1.5,
      }).success,
    ).toBe(false);
    expect(
      prepareRequestSchema.safeParse({
        ...validPrepare,
        type: MESSAGE_TYPES.PREPARE,
        hash_algorithm: "MD5",
      }).success,
    ).toBe(false);
    expect(
      prepareRequestSchema.safeParse({
        ...validPrepare,
        type: MESSAGE_TYPES.PREPARE,
        chunk_hashes: [FILE_HASH, 42], // non-string hash
      }).success,
    ).toBe(false);
  });

  it("rejects malformed SHA-256 digests (wrong length or non-hex)", () => {
    expect(
      prepareRequestSchema.safeParse({
        ...validPrepare,
        type: MESSAGE_TYPES.PREPARE,
        file_hash: "abc123", // not 64 chars
      }).success,
    ).toBe(false);
    expect(
      prepareRequestSchema.safeParse({
        ...validPrepare,
        type: MESSAGE_TYPES.PREPARE,
        chunk_hashes: ["deadbeef"], // too short, and count then mismatches too
      }).success,
    ).toBe(false);
    expect(
      prepareRequestSchema.safeParse({
        ...validPrepare,
        type: MESSAGE_TYPES.PREPARE,
        file_hash: FILE_HASH.toUpperCase(), // uppercase hex is not canonical
      }).success,
    ).toBe(false);
    expect(
      prepareRequestSchema.safeParse({
        ...validPrepare,
        type: MESSAGE_TYPES.PREPARE,
        file_hash: "z".repeat(64), // non-hex characters
      }).success,
    ).toBe(false);
  });

  it("allows the optional mime_type and omits it when absent", () => {
    const withMime = prepareRequestSchema.safeParse({
      ...validPrepare,
      type: MESSAGE_TYPES.PREPARE,
      mime_type: "text/plain",
    });
    expect(withMime.success).toBe(true);
    const without = prepareRequestSchema.safeParse({
      ...validPrepare,
      type: MESSAGE_TYPES.PREPARE,
    });
    expect(without.success).toBe(true);
    if (without.success) expect(without.data.mime_type).toBeUndefined();
  });

  it("enforces manifest consistency: hash count matches total_chunks", () => {
    const mismatched = prepareRequestSchema.safeParse({
      ...validPrepare,
      type: MESSAGE_TYPES.PREPARE,
      chunk_hashes: [], // claims 4 chunks but provides 0 hashes
    });
    expect(mismatched.success).toBe(false);

    const matching = prepareRequestSchema.safeParse({
      ...validPrepare,
      type: MESSAGE_TYPES.PREPARE,
    });
    expect(matching.success).toBe(true);
  });

  it("enforces manifest consistency: zero-byte files have zero chunks", () => {
    const zeroByteWithChunks = prepareRequestSchema.safeParse({
      ...validPrepare,
      type: MESSAGE_TYPES.PREPARE,
      file_size: 0,
    });
    expect(zeroByteWithChunks.success).toBe(false);

    const zeroChunkZeroByte = prepareRequestSchema.safeParse({
      ...validPrepare,
      type: MESSAGE_TYPES.PREPARE,
      file_size: 0,
      total_chunks: 0,
      chunk_hashes: [],
    });
    expect(zeroChunkZeroByte.success).toBe(true);
  });

  it("rejects a chunk count that does not match the file layout", () => {
    // 5 MiB at 4 MiB chunks ⇒ 2 chunks; declaring 4 is impossible.
    const tooMany = prepareRequestSchema.safeParse({
      ...validPrepare,
      type: MESSAGE_TYPES.PREPARE,
      file_size: 5 * 1024 * 1024,
      total_chunks: 4,
      chunk_hashes: CHUNK_HASHES,
    });
    expect(tooMany.success).toBe(false);

    // 5 MiB at 4 MiB chunks ⇒ 2 chunks; declaring 1 undershoots.
    const tooFew = prepareRequestSchema.safeParse({
      ...validPrepare,
      type: MESSAGE_TYPES.PREPARE,
      file_size: 5 * 1024 * 1024,
      total_chunks: 1,
      chunk_hashes: [FILE_HASH],
    });
    expect(tooFew.success).toBe(false);

    // Partial final chunk is legal: 5 MiB at 4 MiB chunks ⇒ 2 chunks.
    const partialLast = prepareRequestSchema.safeParse({
      ...validPrepare,
      type: MESSAGE_TYPES.PREPARE,
      file_size: 5 * 1024 * 1024,
      total_chunks: 2,
      chunk_hashes: CHUNK_HASHES.slice(0, 2),
    });
    expect(partialLast.success).toBe(true);
  });
});

describe("prepareResponseSchema", () => {
  it("parses an accepted response and a rejected response with a reason", () => {
    const accepted = prepareResponseSchema.safeParse({
      ...validPrepareResponse,
      type: MESSAGE_TYPES.PREPARE_RESPONSE,
    });
    expect(accepted.success).toBe(true);

    const rejected = prepareResponseSchema.safeParse({
      transfer_id: "t-1",
      accepted: false,
      reason: "disk full",
      type: MESSAGE_TYPES.PREPARE_RESPONSE,
    });
    expect(rejected.success).toBe(true);
    if (rejected.success) expect(rejected.data.reason).toBe("disk full");
  });

  it("rejects a non-boolean accepted and a wrong discriminator", () => {
    expect(
      prepareResponseSchema.safeParse({
        ...validPrepareResponse,
        accepted: "yes",
        type: MESSAGE_TYPES.PREPARE_RESPONSE,
      }).success,
    ).toBe(false);
    expect(
      prepareResponseSchema.safeParse({
        ...validPrepareResponse,
        type: MESSAGE_TYPES.PREPARE,
      }).success,
    ).toBe(false);
  });
});

describe("chunkRequestSchema", () => {
  it("parses a valid chunk request", () => {
    const result = chunkRequestSchema.safeParse({
      ...validChunkRequest,
      type: MESSAGE_TYPES.CHUNK_REQUEST,
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative or fractional chunk indices and a wrong discriminator", () => {
    expect(
      chunkRequestSchema.safeParse({
        ...validChunkRequest,
        chunk_indices: [-1],
        type: MESSAGE_TYPES.CHUNK_REQUEST,
      }).success,
    ).toBe(false);
    expect(
      chunkRequestSchema.safeParse({
        ...validChunkRequest,
        chunk_indices: [0.5],
        type: MESSAGE_TYPES.CHUNK_REQUEST,
      }).success,
    ).toBe(false);
    expect(
      chunkRequestSchema.safeParse({
        ...validChunkRequest,
        type: MESSAGE_TYPES.CHUNK_RESPONSE,
      }).success,
    ).toBe(false);
  });

  it("rejects an empty chunk request", () => {
    expect(
      chunkRequestSchema.safeParse({
        ...validChunkRequest,
        chunk_indices: [],
        type: MESSAGE_TYPES.CHUNK_REQUEST,
      }).success,
    ).toBe(false);
  });
});

describe("chunkResponseSchema", () => {
  it("decodes base64 wire data back into bytes", () => {
    const b64 = toBase64(validChunkResponse.data);
    const result = chunkResponseSchema.safeParse({
      transfer_id: "t-1",
      chunk_index: 1,
      data: b64,
      hash: FILE_HASH,
      type: MESSAGE_TYPES.CHUNK_RESPONSE,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.data).toBeInstanceOf(Uint8Array);
      expect(String.fromCharCode(...result.data.data)).toBe("hello");
    }
  });

  it("rejects a malformed chunk hash digest", () => {
    expect(
      chunkResponseSchema.safeParse({
        transfer_id: "t-1",
        chunk_index: 1,
        data: toBase64(validChunkResponse.data),
        hash: "abc123",
        type: MESSAGE_TYPES.CHUNK_RESPONSE,
      }).success,
    ).toBe(false);
  });

  it("fails validation (not throws) when base64 decoding is unavailable", () => {
    vi.stubGlobal("atob", undefined);
    try {
      const result = chunkResponseSchema.safeParse({
        transfer_id: "t-1",
        chunk_index: 1,
        data: toBase64(validChunkResponse.data),
        hash: FILE_HASH,
        type: MESSAGE_TYPES.CHUNK_RESPONSE,
      });
      expect(result.success).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects non-base64 data, negative indices, and a wrong discriminator", () => {
    expect(
      chunkResponseSchema.safeParse({
        ...validChunkResponse,
        data: "not base64!!",
        type: MESSAGE_TYPES.CHUNK_RESPONSE,
      }).success,
    ).toBe(false);
    expect(
      chunkResponseSchema.safeParse({
        ...validChunkResponse,
        chunk_index: -1,
        data: toBase64(validChunkResponse.data),
        type: MESSAGE_TYPES.CHUNK_RESPONSE,
      }).success,
    ).toBe(false);
    expect(
      chunkResponseSchema.safeParse({
        ...validChunkResponse,
        data: toBase64(validChunkResponse.data),
        type: MESSAGE_TYPES.RESUME,
      }).success,
    ).toBe(false);
  });
});

describe("resumeRequestSchema", () => {
  it("parses a valid resume request", () => {
    const result = resumeRequestSchema.safeParse({
      ...validResume,
      type: MESSAGE_TYPES.RESUME,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-boolean bitmap and a wrong discriminator", () => {
    expect(
      resumeRequestSchema.safeParse({
        ...validResume,
        chunk_bitmap: [true, "no"],
        type: MESSAGE_TYPES.RESUME,
      }).success,
    ).toBe(false);
    expect(
      resumeRequestSchema.safeParse({
        ...validResume,
        type: MESSAGE_TYPES.PREPARE,
      }).success,
    ).toBe(false);
  });
});

describe("transferMessageSchema", () => {
  it("dispatches each wire type to its schema", () => {
    const prepare = transferMessageSchema.safeParse({
      ...validPrepare,
      type: MESSAGE_TYPES.PREPARE,
    });
    expect(prepare.success).toBe(true);

    const prepareResponse = transferMessageSchema.safeParse({
      ...validPrepareResponse,
      type: MESSAGE_TYPES.PREPARE_RESPONSE,
    });
    expect(prepareResponse.success).toBe(true);

    const chunkRequest = transferMessageSchema.safeParse({
      ...validChunkRequest,
      type: MESSAGE_TYPES.CHUNK_REQUEST,
    });
    expect(chunkRequest.success).toBe(true);

    const chunkResponse = transferMessageSchema.safeParse({
      ...validChunkResponse,
      data: toBase64(validChunkResponse.data),
      type: MESSAGE_TYPES.CHUNK_RESPONSE,
    });
    expect(chunkResponse.success).toBe(true);

    const resume = transferMessageSchema.safeParse({
      ...validResume,
      type: MESSAGE_TYPES.RESUME,
    });
    expect(resume.success).toBe(true);
  });

  it("rejects an unknown discriminator", () => {
    expect(
      transferMessageSchema.safeParse({ ...validPrepare, type: "teleport" })
        .success,
    ).toBe(false);
  });

  it("excludes heartbeat (it has its own schema in network/heartbeat.ts)", () => {
    const heartbeat = transferMessageSchema.safeParse({
      type: MESSAGE_TYPES.HEARTBEAT,
      device_id: "d1",
      alias: "alice",
      platform: "macos",
      interfaces: [
        { type: "Wi-Fi", ipv4: ["192.168.1.2"], ipv6: [], preferred: true },
      ],
      port: 53_350,
    });
    expect(heartbeat.success).toBe(false);
  });
});

describe("message builders", () => {
  it("serializes a prepare request with the prepare discriminator", () => {
    const wire = JSON.parse(buildPrepareRequest(validPrepare));
    expect(wire.type).toBe(MESSAGE_TYPES.PREPARE);
    const parsed = prepareRequestSchema.safeParse(wire);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.file_name).toBe("notes.txt");
      expect(parsed.data.total_chunks).toBe(4);
    }
  });

  it("serializes a prepare response with the prepare_response discriminator", () => {
    const wire = JSON.parse(
      buildPrepareResponse({ ...validPrepareResponse, accepted: false, reason: "disk full" }),
    );
    expect(wire.type).toBe(MESSAGE_TYPES.PREPARE_RESPONSE);
    const parsed = prepareResponseSchema.safeParse(wire);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.reason).toBe("disk full");
  });

  it("serializes a chunk request with the chunk_request discriminator", () => {
    const wire = JSON.parse(buildChunkRequest(validChunkRequest));
    expect(wire.type).toBe(MESSAGE_TYPES.CHUNK_REQUEST);
    const parsed = chunkRequestSchema.safeParse(wire);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.chunk_indices).toEqual([0, 1, 2]);
  });

  it("serializes a chunk response with base64 data and the chunk_response discriminator", () => {
    const wire = JSON.parse(buildChunkResponse(validChunkResponse));
    expect(wire.type).toBe(MESSAGE_TYPES.CHUNK_RESPONSE);
    expect(typeof wire.data).toBe("string");
    const parsed = chunkResponseSchema.safeParse(wire);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.data).toBeInstanceOf(Uint8Array);
      expect(String.fromCharCode(...parsed.data.data)).toBe("hello");
    }
  });

  it("serializes a resume request with the resume discriminator", () => {
    const wire = JSON.parse(buildResumeRequest(validResume));
    expect(wire.type).toBe(MESSAGE_TYPES.RESUME);
    const parsed = resumeRequestSchema.safeParse(wire);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.chunk_bitmap).toEqual([true, false, true, false]);
  });

  it("pins the wire discriminator even if the payload carries a type", () => {
    // Deliberate escape hatch: smuggle a bogus `type` into a PrepareRequest.
    const smuggled = {
      ...validPrepare,
      type: MESSAGE_TYPES.CHUNK_RESPONSE,
    } as unknown as PrepareRequest;
    const wire = JSON.parse(buildPrepareRequest(smuggled));
    expect(wire.type).toBe(MESSAGE_TYPES.PREPARE);
    expect(prepareRequestSchema.safeParse(wire).success).toBe(true);
  });

  it("encodes large chunk payloads without argument overflow", () => {
    const large = new Uint8Array(100_000); // exceeds the batching threshold
    for (let i = 0; i < large.length; i++) large[i] = i % 256;
    const wire = JSON.parse(buildChunkResponse({ ...validChunkResponse, data: large }));
    const parsed = chunkResponseSchema.safeParse(wire);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.data.length).toBe(100_000);
  });

  it("pins the RFC 4648 base64 wire format with known vectors", () => {
    const cases: Array<[Uint8Array, string]> = [
      [new Uint8Array([]), ""],
      [new Uint8Array([102]), "Zg=="], // "f"
      [new Uint8Array([102, 111]), "Zm8="], // "fo"
      [new Uint8Array([104, 101, 108, 108, 111]), "aGVsbG8="], // "hello"
      [new Uint8Array([1, 2, 3, 4, 5]), "AQIDBAU="],
      [new Uint8Array([255, 254, 253, 252, 251, 250]), "//79/Pv6"],
    ];
    for (const [bytes, expected] of cases) {
      const wire = JSON.parse(
        buildChunkResponse({ ...validChunkResponse, data: bytes }),
      );
      expect(wire.data).toBe(expected);
      const parsed = chunkResponseSchema.safeParse(wire);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.data).toEqual(bytes);
      }
    }
  });

  it("round-trips a zero-byte chunk payload", () => {
    const wire = JSON.parse(
      buildChunkResponse({ ...validChunkResponse, data: new Uint8Array(0) }),
    );
    expect(wire.data).toBe("");
    const parsed = chunkResponseSchema.safeParse(wire);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.data.length).toBe(0);
  });

  it("buildTransferMessage dispatches every wire type", () => {
    const inputs: TransferMessage[] = [
      { ...validPrepare, type: MESSAGE_TYPES.PREPARE },
      { ...validPrepareResponse, type: MESSAGE_TYPES.PREPARE_RESPONSE },
      { ...validChunkRequest, type: MESSAGE_TYPES.CHUNK_REQUEST },
      {
        ...validChunkResponse,
        data: new Uint8Array(validChunkResponse.data),
        type: MESSAGE_TYPES.CHUNK_RESPONSE,
      },
      { ...validResume, type: MESSAGE_TYPES.RESUME },
    ];
    for (const input of inputs) {
      const wire = JSON.parse(buildTransferMessage(input));
      expect(transferMessageSchema.safeParse(wire).success).toBe(true);
    }
  });

  it("buildTransferMessage throws on an unknown discriminator", () => {
    expect(() =>
      buildTransferMessage({ ...validPrepare, type: "teleport" } as unknown as TransferMessage),
    ).toThrow(/unknown message type/);
  });
});

describe("protocol message schema exports", () => {
  it("exposes the message schemas from the protocol barrel", () => {
    expect(prepareRequestSchema).toBeDefined();
    expect(prepareResponseSchema).toBeDefined();
    expect(chunkRequestSchema).toBeDefined();
    expect(chunkResponseSchema).toBeDefined();
    expect(resumeRequestSchema).toBeDefined();
    expect(transferMessageSchema).toBeDefined();
  });

  it("shares the protocol version constant with the schema types", () => {
    expect(PROTOCOL_VERSION).toMatch(/^\d+\.\d+$/);
  });
});
