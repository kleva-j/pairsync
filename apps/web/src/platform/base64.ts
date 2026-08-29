import { fromByteArray, toByteArray } from "base64-js";

/**
 * Base64 encoding for wire payloads crossing the Tauri IPC boundary (JSON).
 * Same encoding as the core protocol's chunk payloads (base64-js, RFC 4648).
 */
export function encodeBase64(bytes: Uint8Array): string {
  return fromByteArray(bytes);
}

export function decodeBase64(encoded: string): Uint8Array {
  return toByteArray(encoded);
}