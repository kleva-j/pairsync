import { z } from "zod";

import { MESSAGE_TYPES } from "./constants";

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
    .string()
    .base64()
    .transform((base64, ctx) => {
      if (typeof atob !== "function") {
        ctx.addIssue({
          code: "custom",
          message: "base64 decoding is not supported in this runtime",
        });
        return z.NEVER;
      }
      try {
        return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
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
