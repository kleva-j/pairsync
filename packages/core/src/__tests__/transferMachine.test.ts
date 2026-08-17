import { createActor } from "xstate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TRANSFER_TIMEOUT } from "../constants";
import type { Transfer } from "../types";
import { MAX_RESUME_ATTEMPTS, transferMachine } from "../state";

const transfer: Transfer = {
  transfer_id: "t-1",
  file_id: "f-1",
  file_name: "notes.txt",
  file_size: 1_000_000,
  chunk_size: 4 * 1024 * 1024,
  total_chunks: 4,
  hash_algorithm: "SHA-256",
  file_hash: "abc123",
  kind: "file",
  state: "PREPARING",
  created_at: 1_700_000_000_000,
};

describe("transfer machine", () => {
  it("walks the happy path: preparing → transferring → verifying → complete", () => {
    const actor = createActor(transferMachine).start();
    expect(actor.getSnapshot().value).toBe("preparing");

    actor.send({ type: "START", transfer });
    actor.send({ type: "PREPARED" });
    expect(actor.getSnapshot().value).toBe("transferring");

    for (let i = 0; i < transfer.total_chunks - 1; i++) {
      actor.send({ type: "CHUNK_RECEIVED", chunkIndex: i });
      expect(actor.getSnapshot().value).toBe("transferring");
    }

    // Final chunk flips into verifying.
    actor.send({ type: "CHUNK_RECEIVED", chunkIndex: transfer.total_chunks - 1 });
    expect(actor.getSnapshot().value).toBe("verifying");

    actor.send({ type: "VERIFY_OK" });
    expect(actor.getSnapshot().value).toBe("complete");
    expect(actor.getSnapshot().status).toBe("done");
  });

  it("cancels from transferring and from verifying", () => {
    const actor = createActor(transferMachine).start();
    actor.send({ type: "START", transfer });
    actor.send({ type: "PREPARED" });
    actor.send({ type: "CANCEL" });
    expect(actor.getSnapshot().value).toBe("cancelled");

    const actor2 = createActor(transferMachine).start();
    actor2.send({ type: "START", transfer });
    actor2.send({ type: "PREPARED" });
    for (let i = 0; i < transfer.total_chunks; i++) {
      actor2.send({ type: "CHUNK_RECEIVED", chunkIndex: i });
    }
    expect(actor2.getSnapshot().value).toBe("verifying");
    actor2.send({ type: "CANCEL" });
    expect(actor2.getSnapshot().value).toBe("cancelled");
  });

  it("moves to error on rejection, chunk failure, and verify failure", () => {
    const reject = createActor(transferMachine).start();
    reject.send({ type: "START", transfer });
    reject.send({ type: "PREPARE_REJECTED", reason: "disk full" });
    expect(reject.getSnapshot().value).toBe("error");
    expect(reject.getSnapshot().context.lastError).toBe("disk full");

    const chunkFail = createActor(transferMachine).start();
    chunkFail.send({ type: "START", transfer });
    chunkFail.send({ type: "PREPARED" });
    chunkFail.send({ type: "CHUNK_FAILED", reason: "socket reset" });
    expect(chunkFail.getSnapshot().value).toBe("error");

    const verifyFail = createActor(transferMachine).start();
    verifyFail.send({ type: "START", transfer });
    verifyFail.send({ type: "PREPARED" });
    for (let i = 0; i < transfer.total_chunks; i++) {
      verifyFail.send({ type: "CHUNK_RECEIVED", chunkIndex: i });
    }
    verifyFail.send({ type: "VERIFY_FAILED", reason: "hash mismatch" });
    expect(verifyFail.getSnapshot().value).toBe("error");
    expect(verifyFail.getSnapshot().context.lastError).toBe("hash mismatch");
  });

  it("enforces the resume cap: MAX_RESUME_ATTEMPTS resumes, then refuses", () => {
    const actor = createActor(transferMachine).start();
    actor.send({ type: "START", transfer });
    actor.send({ type: "PREPARED" });
    actor.send({ type: "CHUNK_FAILED", reason: "disconnect" });
    expect(actor.getSnapshot().value).toBe("error");

    for (let i = 1; i <= MAX_RESUME_ATTEMPTS; i++) {
      actor.send({ type: "RESUME", chunksReceived: 2 });
      expect(actor.getSnapshot().value).toBe("transferring");
      actor.send({ type: "CHUNK_FAILED", reason: "disconnect" });
      expect(actor.getSnapshot().value).toBe("error");
    }

    actor.send({ type: "RESUME", chunksReceived: 2 });
    expect(actor.getSnapshot().value).toBe("error");
  });

  it("ignores PREPARED and PREPARE_REJECTED before a START", () => {
    const actor = createActor(transferMachine).start();

    actor.send({ type: "PREPARED" });
    expect(actor.getSnapshot().value).toBe("preparing");
    expect(actor.getSnapshot().context.transfer).toBeNull();

    actor.send({ type: "PREPARE_REJECTED", reason: "not started" });
    expect(actor.getSnapshot().value).toBe("preparing");
    expect(actor.getSnapshot().context.lastError).toBeNull();
  });

  it("only advances progress on contiguous, in-range chunks", () => {
    const actor = createActor(transferMachine).start();
    actor.send({ type: "START", transfer });
    actor.send({ type: "PREPARED" });

    // An initial final-chunk event must not complete the transfer.
    actor.send({ type: "CHUNK_RECEIVED", chunkIndex: transfer.total_chunks - 1 });
    expect(actor.getSnapshot().value).toBe("transferring");
    expect(actor.getSnapshot().context.chunksReceived).toBe(0);

    // Out-of-range and negative indices are ignored as well.
    actor.send({ type: "CHUNK_RECEIVED", chunkIndex: transfer.total_chunks });
    actor.send({ type: "CHUNK_RECEIVED", chunkIndex: -1 });
    expect(actor.getSnapshot().context.chunksReceived).toBe(0);

    // A duplicate of an already-received chunk does not advance progress.
    actor.send({ type: "CHUNK_RECEIVED", chunkIndex: 0 });
    actor.send({ type: "CHUNK_RECEIVED", chunkIndex: 0 });
    expect(actor.getSnapshot().context.chunksReceived).toBe(1);

    // Sequential chunks eventually complete the transfer.
    for (let i = 1; i < transfer.total_chunks; i++) {
      actor.send({ type: "CHUNK_RECEIVED", chunkIndex: i });
    }
    expect(actor.getSnapshot().value).toBe("verifying");
  });

  it("validates RESUME counts: out-of-range refused, complete count verifies", () => {
    const actor = createActor(transferMachine).start();
    actor.send({ type: "START", transfer });
    actor.send({ type: "PREPARED" });
    actor.send({ type: "CHUNK_FAILED", reason: "disconnect" });
    expect(actor.getSnapshot().value).toBe("error");

    // Out-of-range and negative resume counts are ignored.
    actor.send({ type: "RESUME", chunksReceived: transfer.total_chunks + 1 });
    expect(actor.getSnapshot().value).toBe("error");
    actor.send({ type: "RESUME", chunksReceived: -1 });
    expect(actor.getSnapshot().value).toBe("error");
    expect(actor.getSnapshot().context.resumeAttempts).toBe(0);

    // A count equal to total_chunks resumes straight into verifying.
    actor.send({ type: "RESUME", chunksReceived: transfer.total_chunks });
    expect(actor.getSnapshot().value).toBe("verifying");
    expect(actor.getSnapshot().context.resumeAttempts).toBe(1);
  });

  it("ignores fractional RESUME counts", () => {
    const actor = createActor(transferMachine).start();
    actor.send({ type: "START", transfer });
    actor.send({ type: "PREPARED" });
    actor.send({ type: "CHUNK_FAILED", reason: "disconnect" });
    expect(actor.getSnapshot().value).toBe("error");

    actor.send({ type: "RESUME", chunksReceived: 1.5 });
    expect(actor.getSnapshot().value).toBe("error");
    expect(actor.getSnapshot().context.chunksReceived).toBe(0);
    expect(actor.getSnapshot().context.resumeAttempts).toBe(0);
  });

  it("routes zero-chunk transfers straight to verification", () => {
    const actor = createActor(transferMachine).start();
    actor.send({ type: "START", transfer: { ...transfer, total_chunks: 0 } });
    actor.send({ type: "PREPARED" });
    expect(actor.getSnapshot().value).toBe("verifying");

    actor.send({ type: "VERIFY_OK" });
    expect(actor.getSnapshot().value).toBe("complete");
  });

  it("times out while transferring", () => {
    vi.useFakeTimers();
    try {
      const actor = createActor(transferMachine).start();
      actor.send({ type: "START", transfer });
      actor.send({ type: "PREPARED" });
      vi.advanceTimersByTime(TRANSFER_TIMEOUT);
      expect(actor.getSnapshot().value).toBe("error");
      expect(actor.getSnapshot().context.lastError).toContain("timed out");
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels from preparing and from error", () => {
    const preparing = createActor(transferMachine).start();
    preparing.send({ type: "START", transfer });
    preparing.send({ type: "CANCEL" });
    expect(preparing.getSnapshot().value).toBe("cancelled");

    const errored = createActor(transferMachine).start();
    errored.send({ type: "START", transfer });
    errored.send({ type: "PREPARED" });
    errored.send({ type: "CHUNK_FAILED", reason: "socket reset" });
    expect(errored.getSnapshot().value).toBe("error");
    errored.send({ type: "CANCEL" });
    expect(errored.getSnapshot().value).toBe("cancelled");
  });

  it("ignores a fresh START once the transfer is in flight", () => {
    const actor = createActor(transferMachine).start();
    actor.send({ type: "START", transfer });
    actor.send({ type: "PREPARED" });
    actor.send({ type: "CHUNK_RECEIVED", chunkIndex: 0 });
    expect(actor.getSnapshot().context.chunksReceived).toBe(1);

    // START is only legal in preparing — a mid-transfer manifest must not
    // silently replace the in-flight one.
    actor.send({ type: "START", transfer: { ...transfer, file_id: "f-2" } });
    expect(actor.getSnapshot().context.transfer?.file_id).toBe("f-1");
    expect(actor.getSnapshot().context.chunksReceived).toBe(1);
  });

  it("does not fire the transfer timeout once the state has been left", () => {
    vi.useFakeTimers();
    try {
      const actor = createActor(transferMachine).start();
      actor.send({ type: "START", transfer });
      actor.send({ type: "PREPARED" });
      actor.send({ type: "CANCEL" });
      expect(actor.getSnapshot().value).toBe("cancelled");

      vi.advanceTimersByTime(TRANSFER_TIMEOUT * 2);
      expect(actor.getSnapshot().value).toBe("cancelled");
      expect(actor.getSnapshot().context.lastError).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores chunk events before START, and completion terminates the actor", () => {
    const actor = createActor(transferMachine).start();
    actor.send({ type: "CHUNK_RECEIVED", chunkIndex: 0 });
    expect(actor.getSnapshot().value).toBe("preparing");
    expect(actor.getSnapshot().context.chunksReceived).toBe(0);

    actor.send({ type: "START", transfer });
    actor.send({ type: "PREPARED" });
    for (let i = 0; i < transfer.total_chunks; i++) {
      actor.send({ type: "CHUNK_RECEIVED", chunkIndex: i });
    }
    actor.send({ type: "VERIFY_OK" });
    expect(actor.getSnapshot().value).toBe("complete");
    // Final states have no outgoing transitions — the actor is done.
    expect(actor.getSnapshot().status).toBe("done");
  });
});

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
});
