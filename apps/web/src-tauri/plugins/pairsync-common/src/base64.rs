use base64::{engine::general_purpose::STANDARD, Engine};

/// Encodes bytes as standard base64 string.
pub fn encode_b64(bytes: &[u8]) -> String {
    STANDARD.encode(bytes)
}

/// Decodes standard base64 string to bytes.
///
/// Returns an error message if the input is not valid base64.
pub fn decode_b64(data: &str) -> Result<Vec<u8>, String> {
    STANDARD
        .decode(data)
        .map_err(|err| format!("invalid base64 payload: {err}"))
}
