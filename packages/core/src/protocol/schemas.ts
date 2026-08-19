import { fromByteArray, toByteArray } from "base64-js";
import { z } from "zod";

import { MESSAGE_TYPES } from "./constants";
import type {
  ChunkRequest,
  ChunkResponse,
  PrepareRequest,
  PrepareResponse,
  ResumeRequest,
} from "../types";

/**
 * Wire message schemas (Phase 1, message schemas).
 *
 * Each schema validates one protocol message shape from `src/types/protocol.ts`
 * plus its `type` discriminator, so every datagram is self-describing and
 * receiver-validated. `chunkResponseSchema` decodes base64 wire data back into
 * bytes (JSON cannot carry raw `Uint8Array`).
 */

/**
 * Canonical SHA-256 digest wire encoding: 64 lowercase hex characters (the
 * same form used for `cert_fingerprint`, minus the colons). Shared by
 * `file_hash`, every `chunk_hashes` item, and `chunkResponseSchema.hash` so
 * corrupt digests are rejected at the schema boundary.
 */
const sha256DigestSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, "expected a 64-character lowercase hex SHA-256 digest");

/**
 * Sender → receiver transfer preparation request. The manifest must be
 * self-consistent: `total_chunks` must equal the number of per-chunk hashes,
 * and a zero-byte file has zero chunks.
 */
export const prepareRequestSchema = z
  .object({
    type: z.literal(MESSAGE_TYPES.PREPARE),
    transfer_id: z.string().min(1),
    file_id: z.string().min(1),
    file_name: z.string().min(1),
    file_size: z.number().int().min(0),
    chunk_size: z.number().int().min(1),
    total_chunks: z.number().int().min(0),
    hash_algorithm: z.literal("SHA-256"),
    file_hash: sha256DigestSchema,
    chunk_hashes: z.array(sha256DigestSchema),
    mime_type: z.string().optional(),
    timestamp: z.number().int().positive(),
  })
  .superRefine((manifest, ctx) => {
    if (manifest.chunk_hashes.length !== manifest.total_chunks) {
      ctx.addIssue({
        code: "custom",
        path: ["chunk_hashes"],
        message: `expected ${manifest.total_chunks} chunk hashes, got ${manifest.chunk_hashes.length}`,
      });
    }
    // Uniform chunk_size means the chunk count is derivable from the file
    // size; a mismatch would leave a receiver waiting for chunks the sender
    // will never produce. Also covers zero-byte files (ceil(0) = 0 chunks).
    const expectedChunks = Math.ceil(manifest.file_size / manifest.chunk_size);
    if (manifest.total_chunks !== expectedChunks) {
      ctx.addIssue({
        code: "custom",
        path: ["total_chunks"],
        message: `file_size ${manifest.file_size} with chunk_size ${manifest.chunk_size} implies ${expectedChunks} chunks, got ${manifest.total_chunks}`,
      });
    }
  });

/** Receiver → sender preparation response. */
export const prepareResponseSchema = z.object({
  type: z.literal(MESSAGE_TYPES.PREPARE_RESPONSE),
  transfer_id: z.string().min(1),
  accepted: z.boolean(),
  reason: z.string().min(1).optional(),
});

/** Receiver asks the sender for specific chunks (resume / retry); never empty. */
export const chunkRequestSchema = z.object({
  type: z.literal(MESSAGE_TYPES.CHUNK_REQUEST),
  transfer_id: z.string().min(1),
  chunk_indices: z.array(z.number().int().min(0)).min(1),
});

/** Sender → receiver chunk payload; `data` is base64 on the wire. */
export const chunkResponseSchema = z.object({
  type: z.literal(MESSAGE_TYPES.CHUNK_RESPONSE),
  transfer_id: z.string().min(1),
  chunk_index: z.number().int().min(0),
  data: z
    .base64()
    .transform((base64, ctx) => {
      // `z.base64()` has already validated the alphabet and padding, so
      // `toByteArray` cannot throw for canonical input; the guard keeps the
      // transform total for any leniency gap in the zod regex.
      try {
        return toByteArray(base64);
      } catch {
        ctx.addIssue({
          code: "custom",
          message: "invalid base64 data",
        });
        return z.NEVER;
      }
    }),
  hash: sha256DigestSchema,
});

/** Resume handshake: the bitmap of chunks the receiver already has. */
export const resumeRequestSchema = z.object({
  type: z.literal(MESSAGE_TYPES.RESUME),
  transfer_id: z.string().min(1),
  chunk_bitmap: z.array(z.boolean()),
});

/**
 * Union of every **transfer** wire message, dispatched on the `type`
 * discriminator. Heartbeat is intentionally separate — it lives in
 * `network/heartbeat.ts` (`heartbeatSchema` / `parseHeartbeat`) because
 * including it here would create a `protocol → network` import cycle.
 */
export const transferMessageSchema = z.discriminatedUnion("type", [
  prepareRequestSchema,
  prepareResponseSchema,
  chunkRequestSchema,
  chunkResponseSchema,
  resumeRequestSchema,
]);

/** Parsed transfer message: the domain payload plus its wire discriminator. */
export type TransferMessage = z.infer<typeof transferMessageSchema>;

/**
 * Builders: serialize each typed message to wire JSON, adding its
 * discriminator last (like {@link buildHeartbeat}) so a runtime payload can
 * never override the wire type. The output round-trips through the matching
 * schema / {@link transferMessageSchema}.
 */

/** Sender → receiver preparation request. */
export function buildPrepareRequest(msg: PrepareRequest): string {
  return JSON.stringify({ ...msg, type: MESSAGE_TYPES.PREPARE });
}

/** Receiver → sender preparation response. */
export function buildPrepareResponse(msg: PrepareResponse): string {
  // Discriminator last so a runtime payload can never override the wire type.
  return JSON.stringify({ ...msg, type: MESSAGE_TYPES.PREPARE_RESPONSE });
}

/** Receiver asks the sender for specific chunks (resume / retry). */
export function buildChunkRequest(msg: ChunkRequest): string {
  // Discriminator last so a runtime payload can never override the wire type.
  return JSON.stringify({ ...msg, type: MESSAGE_TYPES.CHUNK_REQUEST });
}

/** Sender → receiver chunk payload; `data` is base64 on the wire. */
export function buildChunkResponse(msg: ChunkResponse): string {
  const { data, ...rest } = msg;
  return JSON.stringify({
    ...rest,
    // base64-js encodes through a fixed-size chunked writer, so building a
    // multi-MiB payload never triggers Hermes's quadratic string-building.
    data: fromByteArray(data),
    type: MESSAGE_TYPES.CHUNK_RESPONSE,
  });
}

/** Resume handshake: the bitmap of chunks the receiver already has. */
export function buildResumeRequest(msg: ResumeRequest): string {
  // Discriminator last so a runtime payload can never override the wire type.
  return JSON.stringify({ ...msg, type: MESSAGE_TYPES.RESUME });
}

/**
 * Serializes any parsed transfer message (schema output) back to wire JSON,
 * dispatching on its discriminator. The one-call counterpart to
 * {@link transferMessageSchema}.
 */
export function buildTransferMessage(msg: TransferMessage): string {
  switch (msg.type) {
    case MESSAGE_TYPES.PREPARE:
      return buildPrepareRequest(msg);
    case MESSAGE_TYPES.PREPARE_RESPONSE:
      return buildPrepareResponse(msg);
    case MESSAGE_TYPES.CHUNK_REQUEST:
      return buildChunkRequest(msg);
    case MESSAGE_TYPES.CHUNK_RESPONSE:
      return buildChunkResponse(msg);
    case MESSAGE_TYPES.RESUME:
      return buildResumeRequest(msg);
    default:
      // Unreachable for schema-typed input; guards JS callers passing a value
      // whose `type` isn't a known discriminator (the switch would otherwise
      // fall through and return undefined despite the declared return type).
      throw new Error(
        `buildTransferMessage: unknown message type ${String((msg as { type?: unknown }).type)}`,
      );
  }
}
