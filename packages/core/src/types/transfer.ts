/** Lifecycle states of a transfer (see Phase 1 state machine). */
export type TransferState =
  | "PREPARING"
  | "TRANSFERRING"
  | "VERIFYING"
  | "COMPLETE"
  | "ERROR"
  | "CANCELLED";

export type TransferKind = "file" | "clipboard";

/** A file (or clipboard payload) being sent from one device to another. */
export interface Transfer {
  transfer_id: string;
  file_id: string;
  file_name: string;
  file_size: number;
  chunk_size: number;
  total_chunks: number;
  hash_algorithm: "SHA-256";
  file_hash: string;
  mime_type?: string;
  kind: TransferKind;
  state: TransferState;
  created_at: number;
}

/** A single 4MB segment of a transfer. */
export interface Chunk {
  transfer_id: string;
  chunk_index: number;
  size: number;
  hash: string;
}

/** Resume state: which chunks have been received, plus per-chunk hashes. */
export interface Manifest {
  transfer_id: string;
  file_id: string;
  file_size: number;
  chunk_size: number;
  total_chunks: number;
  /** Bitmap of received chunks (index = chunk index). */
  chunk_bitmap: boolean[];
  chunk_hashes: string[];
  file_hash: string;
  created_at: number;
  updated_at: number;
}
