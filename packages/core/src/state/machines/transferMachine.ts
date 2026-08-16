import { assign, setup } from "xstate";

import { TRANSFER_TIMEOUT } from "../../constants";
import type { Transfer } from "../../types";

/**
 * Maximum number of times a failed transfer may be resumed from its
 * manifest before it must be restarted from scratch (2-resume cap).
 */
export const MAX_RESUME_ATTEMPTS = 2;

/** Progress bookkeeping for an in-flight transfer. */
export interface TransferMachineContext {
  /** The transfer being executed, if one has started. */
  transfer: Transfer | null;
  /** Number of chunks acknowledged so far (0-based index of next chunk). */
  chunksReceived: number;
  /** Resume attempts already consumed (capped by MAX_RESUME_ATTEMPTS). */
  resumeAttempts: number;
  /** Human-readable reason for the most recent failure, if any. */
  lastError: string | null;
}

export type TransferMachineEvent =
  | { type: "START"; transfer: Transfer }
  | { type: "PREPARED" }
  | { type: "PREPARE_REJECTED"; reason: string }
  | { type: "CHUNK_RECEIVED"; chunkIndex: number }
  | { type: "CHUNK_FAILED"; reason: string }
  | { type: "VERIFY_OK" }
  | { type: "VERIFY_FAILED"; reason: string }
  | { type: "RESUME"; chunksReceived: number }
  | { type: "CANCEL" };

export const transferMachine = setup({
  types: {} as {
    context: TransferMachineContext;
    events: TransferMachineEvent;
  },
  guards: {
    /**
     * All chunks of the transfer have been acknowledged. Evaluated before
     * the recordChunk action runs, so it must account for the chunk carried
     * by the event (mirrors recordChunk's max() semantics).
     */
    allChunksReceived: ({ context, event }) =>
      context.transfer !== null &&
      event.type === "CHUNK_RECEIVED" &&
      Math.max(context.chunksReceived, event.chunkIndex + 1) >= context.transfer.total_chunks,
    /** A failed transfer may be resumed up to MAX_RESUME_ATTEMPTS times. */
    canResume: ({ context }) => context.resumeAttempts < MAX_RESUME_ATTEMPTS,
  },
  actions: {
    startTransfer: assign({
      transfer: ({ event }) => (event.type === "START" ? event.transfer : null),
      chunksReceived: () => 0,
      resumeAttempts: () => 0,
      lastError: () => null,
    }),
    recordChunk: assign({
      chunksReceived: ({ context, event }) =>
        event.type === "CHUNK_RECEIVED" ? Math.max(context.chunksReceived, event.chunkIndex + 1) : context.chunksReceived,
    }),
    setError: assign({
      lastError: ({ event }) =>
        event.type === "PREPARE_REJECTED" || event.type === "CHUNK_FAILED" || event.type === "VERIFY_FAILED"
          ? event.reason
          : null,
    }),
    setTimeoutError: assign({ lastError: () => `Transfer timed out after ${TRANSFER_TIMEOUT}ms` }),
    clearError: assign({ lastError: () => null }),
    resumeTransfer: assign({
      chunksReceived: ({ event }) => (event.type === "RESUME" ? event.chunksReceived : 0),
      resumeAttempts: ({ context }) => context.resumeAttempts + 1,
      lastError: () => null,
    }),
  },
}).createMachine({
  id: "transfer",
  initial: "preparing",
  context: { transfer: null, chunksReceived: 0, resumeAttempts: 0, lastError: null },
  states: {
    preparing: {
      on: {
        START: { target: "preparing", actions: "startTransfer" },
        PREPARED: { target: "transferring" },
        PREPARE_REJECTED: { target: "error", actions: "setError" },
        CANCEL: { target: "cancelled" },
      },
    },
    transferring: {
      on: {
        CHUNK_RECEIVED: [
          {
            target: "verifying",
            guard: "allChunksReceived",
            actions: "recordChunk",
          },
          { target: "transferring", actions: "recordChunk" },
        ],
        CHUNK_FAILED: { target: "error", actions: "setError" },
        CANCEL: { target: "cancelled" },
      },
      after: {
        [TRANSFER_TIMEOUT]: { target: "error", actions: "setTimeoutError" },
      },
    },
    verifying: {
      on: {
        VERIFY_OK: { target: "complete" },
        VERIFY_FAILED: { target: "error", actions: "setError" },
        CANCEL: { target: "cancelled" },
      },
    },
    complete: { type: "final" },
    cancelled: { type: "final" },
    error: {
      on: {
        RESUME: {
          target: "transferring",
          guard: "canResume",
          actions: "resumeTransfer",
        },
        CANCEL: { target: "cancelled" },
      },
    },
  },
});
