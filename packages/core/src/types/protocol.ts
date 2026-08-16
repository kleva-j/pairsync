import type { Device, Platform } from "./device";

/** Protocol version string, e.g. "1.0". */
export type ProtocolVersion = string;

/** UDP heartbeat broadcast announcing device presence. */
export interface HeartbeatPayload {
  device_id: string;
  alias: string;
  platform: Platform;
  interfaces: Device["interfaces"];
  port: number;
  cert_fingerprint?: string;
}

/** Sender → receiver transfer preparation request. */
export interface PrepareRequest {
  transfer_id: string;
  file_id: string;
  file_name: string;
  file_size: number;
  chunk_size: number;
  total_chunks: number;
  hash_algorithm: "SHA-256";
  file_hash: string;
  chunk_hashes: string[];
  mime_type?: string;
  timestamp: number;
}

export interface PrepareResponse {
  transfer_id: string;
  accepted: boolean;
  reason?: string;
}

/** Receiver asks the sender for specific chunks (resume / retry). */
export interface ChunkRequest {
  transfer_id: string;
  chunk_indices: number[];
}

export interface ChunkResponse {
  transfer_id: string;
  chunk_index: number;
  data: Uint8Array;
  hash: string;
}

/** Resume handshake: the bitmap of chunks the receiver already has. */
export interface ResumeRequest {
  transfer_id: string;
  chunk_bitmap: boolean[];
}
