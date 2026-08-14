# Core Package Context

**Context:** `packages/core/`  
**Domain:** Shared domain logic, state machines, protocols, and transfer engine  
**Part of:** PairSync Monorepo (see `CONTEXT-MAP.md`)

---

## Purpose

The **core** package is the intended home for **platform-agnostic PairSync domain logic** — the business rules for how devices discover each other, how files are transferred, and how trust/security is handled. Per `IMPLEMENTATION_PLAN.md` this is where the "heart" of PairSync lives so web and native can share it.

> 🚧 **Status: placeholder.** The package is scaffolded (manifest, tsconfig, entry point) but contains **no implementation** — `schema.ts` and `types.ts` are empty module markers. **No code in the repo imports `@pairsync/core` yet** (no `workspace:*` dependency declares it). Everything marked *Planned* below is target design from `IMPLEMENTATION_PLAN.md`, **not current code**.

## Current Structure

```
packages/core/
├── src/
│   ├── index.ts      # Re-exports ./schema and ./types
│   ├── schema.ts     # Placeholder (`export {}`) — future zod schemas
│   └── types.ts      # Placeholder (`export {}`) — future domain types
├── package.json      # @pairsync/core — exports "./src/index.ts"
└── tsconfig.json     # extends @pairsync/config/tsconfig.base.json
```

## Exports Map

```json
{ ".": "./src/index.ts" }
```

Import as `import { ... } from "@pairsync/core";` — the entry currently re-exports only the empty placeholder modules, so there is nothing meaningful to import yet.

## Dependencies

| Dependency | Status | Purpose |
|------------|--------|---------|
| `zod` | ✅ Installed | Schema validation (planned: message/transfer schemas) |

Planned (per `IMPLEMENTATION_PLAN.md`): `xstate` for the state machines (Phase 1). Platform-specific crypto/networking libraries live in the **apps**, not core — e.g. `react-native-quick-crypto` in `apps/native` (spike-verified for X25519/HKDF/AES-256-GCM) and Rust crates in the Tauri app.

## Planned Responsibilities (by phase)

| Subsystem | Plan phase | Status |
|-----------|-----------|--------|
| State machines (XState): device, discovery, transfer | Phase 1 | 🚧 Planned — not implemented |
| Protocol constants + message schemas | Phase 1 | 🚧 Planned |
| Network utilities (interface selection, heartbeat) | Phase 1 | 🚧 Planned |
| Shared types | Phase 1 | 🚧 Planned |
| Discovery (UDP multicast, mDNS, manual IP) + connection | Phase 2 | 🚧 Planned |
| SQLite database setup + schema | Phase 2 | 🚧 Planned |
| Transfer engine (prepare, chunked upload/download, resume, verify, queue) | Phase 3 | 🚧 Planned |
| Clipboard + folder transfers | Phase 3 | 🚧 Planned |
| Transfer manifest persistence | Phase 3 | 🚧 Planned |
| Security: TLS 1.3 + TOFU, ECDH handshake, trust storage | Phase 4 | 🚧 Planned |
| Background transfer support | Phase 5 | 🚧 Planned |

## Domain Vocabulary (planned)

Domain terms from the PRD/plan — relevant once the package is implemented:

| Term | Definition | Example |
|------|------------|---------|
| **Device** | A physical or virtual instance running PairSync | "Swift Cheetah" (iOS), "Golden Eagle" (macOS) |
| **Transfer** | A file or clipboard content being sent from one device to another | transfer_id: UUIDv4 |
| **Chunk** | A 4MB segment of a file for streaming transfer | chunk_index: 0..N-1 |
| **Manifest** | Metadata about a transfer including chunk bitmap | JSON file with hashes |
| **Heartbeat** | UDP broadcast announcing device presence | Every 5 seconds |
| **TOFU** | Trust On First Use — trust model for first connections | Fingerprint verification |
| **ECDH** | Elliptic Curve Diffie-Hellman — key exchange protocol | X25519 Curve25519 |
| **State Machine** | XState machine defining lifecycle states | deviceMachine, transferMachine |

## Planned Protocol Wire Format (design only — not implemented)

### Heartbeat Payload (JSON)

```json
{
  "device_id": "a1b2c3d4-5678-90ef-ghij-klmnopqrstuv",
  "alias": "Swift Cheetah",
  "platform": "iOS",
  "interfaces": [
    {
      "type": "Wi-Fi",
      "ipv4": ["192.168.1.100"],
      "ipv6": ["fe80::1"],
      "preferred": true
    }
  ],
  "port": 53350,
  "cert_fingerprint": "A1:B2:C3:D4:E5:F6..."
}
```

### Prepare Request (Sender → Receiver)

```http
POST /api/pairsync/v1/prepare HTTP/1.1
X-PairSync-Version: 1.0
X-Nonce: <32-byte random hex>
X-Device-ID: <UUIDv4>
X-Cert-Fingerprint: <SHA-256 of sender's cert>

{
  "transfer_id": "<UUIDv4>",
  "file_id": "<UUIDv4>",
  "file_name": "video.mp4",
  "file_size": 104857600,
  "chunk_size": 4194304,
  "total_chunks": 25,
  "hash_algorithm": "SHA-256",
  "file_hash": "<SHA-256 of entire file>",
  "chunk_hashes": ["<hash-0>", "<hash-1>", ...],
  "mime_type": "video/mp4",
  "timestamp": 1718467200000
}
```

## Planned Constants (Phase 1)

| Constant | Value | Description |
|----------|-------|-------------|
| `PROTOCOL_VERSION` | `"1.0"` | Current protocol version |
| `DISCOVERY_PORT` | `53350` | UDP multicast/mDNS port |
| `TRANSFER_PORTS` | `53351-53360` | TCP transfer port range |
| `HEARTBEAT_INTERVAL` | `5000` | Heartbeat broadcast interval (ms) |
| `HEARTBEAT_TIMEOUT` | `25000` | Device removal after timeout (ms) |
| `CHUNK_SIZE` | `4194304` | 4MB chunk size (bytes) |
| `MOBILE_BUFFER_LIMIT` | `52428800` | 50MB mobile buffer |
| `DESKTOP_BUFFER_LIMIT` | `209715200` | 200MB desktop buffer |
| `MAX_CONCURRENT_TRANSFERS` | `4` | Concurrent transfer limit |
| `CERT_VALIDITY_DAYS` | `30` | Certificate lifetime |
| `CERT_REGEN_DAYS` | `7` | Auto-regenerate threshold |

## Testing

No test framework is configured for this package yet. Unit/integration tests for state machines, protocol, and transfers are planned (Phase 1+) but not present.

## ADRs

Context-specific ADRs are stored in `packages/core/docs/adr/`. Root-level ADRs in `docs/adr/` apply to the entire monorepo.

---

**For more information:** See `CONTEXT-MAP.md` at the repo root for the full monorepo structure.
