# Core Package Context

**Context:** `packages/core/`  
**Domain:** Shared domain logic, state machines, protocols, and transfer engine  
**Part of:** PairSync Monorepo (see `CONTEXT-MAP.md`)

---

## Purpose

The **core** package is the home for **platform-agnostic PairSync domain logic** — the business rules for how devices discover each other, how files are transferred, and how trust/security is handled. Per `IMPLEMENTATION_PLAN.md` this is where the "heart" of PairSync lives so web and native can share it.

> ✅ **Status: Phase 0.6 + 1.1 + 1.5 implemented.** Shared types, constants, platform utils, the three XState machines, and the shared protocol constants are implemented and unit-tested. Still **Planned**: discovery, transfer engine, security (see the table below). **No app code imports `@pairsync/core` yet** (no `workspace:*` dependency declares it); that happens in Phase 1+.

## Current Structure

```
packages/core/
├── src/
│   ├── index.ts           # Re-exports ./types, ./protocol, ./constants, ./utils, ./state
│   ├── types/
│   │   ├── device.ts      # Platform, NetworkInterface, Device
│   │   ├── transfer.ts    # TransferState, Transfer, Chunk, Manifest
│   │   ├── protocol.ts    # HeartbeatPayload, PrepareRequest/Response, Chunk/Resume
│   │   └── index.ts
│   ├── protocol/
│   │   ├── constants.ts   # PROTOCOL_VERSION, ports, HTTP_HEADERS, MESSAGE_TYPES
│   │   └── index.ts
│   ├── constants/
│   │   ├── timeouts.ts    # HEARTBEAT_*, CONNECTION_TIMEOUT, TRANSFER_TIMEOUT
│   │   ├── sizes.ts       # CHUNK_SIZE, MOBILE/DESKTOP_BUFFER_LIMIT
│   │   └── index.ts
│   ├── utils/
│   │   ├── platform.ts    # getPlatform, isMobile, isWeb, isDesktop, isNode
│   │   └── index.ts
│   └── __tests__/         # Vitest: constants, protocol constants, machines, platform
├── package.json           # @pairsync/core — exports "./src/index.ts", test script
└── tsconfig.json          # extends @pairsync/config/tsconfig.base.json
```

## Exports Map

```json
{ ".": "./src/index.ts" }
```

Import as `import { Device, CHUNK_SIZE, isMobile } from "@pairsync/core";` — types, constants, and utils are all re-exported from the entry.

## Dependencies

| Dependency | Status | Purpose |
|------------|--------|---------|
| `zod` | ✅ Installed (unused so far) | Schema validation — planned for message/transfer schemas (Phase 1) |
| `vitest` | ✅ devDep | Unit tests (11 passing) |

Planned (per `IMPLEMENTATION_PLAN.md`): `xstate` for the state machines (Phase 1). Platform-specific crypto/networking libraries live in the **apps**, not core — e.g. `react-native-quick-crypto` in `apps/native` (spike-verified for X25519/HKDF/AES-256-GCM) and Rust crates in the Tauri app.

## Responsibilities (by phase)

| Subsystem | Plan phase | Status |
|-----------|-----------|--------|
| Shared types (device, transfer, chunk, manifest, protocol) | Phase 0 (0.6) | ✅ Implemented + tested |
| Shared constants (ports, timeouts, sizes) | Phase 0 (0.6) | ✅ Implemented + tested |
| Platform detection utils | Phase 0 (0.6) | ✅ Implemented + tested |
| State machines (XState): device, discovery, transfer | Phase 1 | 🚧 Planned |
| Protocol constants + message schemas (zod) | Phase 1 | 🚧 In progress (constants done in 1.5, schemas pending) |
| Network utilities (interface selection, heartbeat) | Phase 1 | 🚧 Planned |
| Discovery (UDP multicast, mDNS, manual IP) + connection | Phase 2 | 🚧 Planned |
| SQLite database setup + schema | Phase 2 | 🚧 Planned |
| Transfer engine (prepare, chunked upload/download, resume, verify, queue) | Phase 3 | 🚧 Planned |
| Clipboard + folder transfers | Phase 3 | 🚧 Planned |
| Transfer manifest persistence | Phase 3 | 🚧 Planned |
| Security: TLS 1.3 + TOFU, ECDH handshake, trust storage | Phase 4 | 🚧 Planned |
| Background transfer support | Phase 5 | 🚧 Planned |

## Domain Vocabulary

Domain terms from the PRD/plan — the type names in `src/types/` follow these:

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

## Implemented Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `PROTOCOL_VERSION` | `"1.0"` | Wire protocol version (MAJOR.MINOR) |
| `DISCOVERY_PORT` | `53350` | UDP multicast/mDNS port |
| `TRANSFER_PORT_START` / `TRANSFER_PORT_END` | `53351` / `53360` | TCP transfer port range |
| `TRANSFER_PORTS` | `[53351…53360]` | All 10 transfer ports |
| `HTTP_HEADERS` | `X-PairSync-Version`, `X-Nonce`, `X-Device-ID`, `X-Cert-Fingerprint` | HTTP header names |
| `MESSAGE_TYPES` | `heartbeat`, `prepare`, `prepare_response`, `chunk_request`, `chunk_response`, `resume` | Wire message discriminators |
| `HEARTBEAT_INTERVAL` | `5000` | Heartbeat broadcast interval (ms) |
| `HEARTBEAT_TIMEOUT` | `25000` | Device removal after timeout (ms) |
| `CONNECTION_TIMEOUT` | `10000` | Connection establishment timeout (ms) |
| `TRANSFER_TIMEOUT` | `300000` | Overall transfer timeout (ms) |
| `CHUNK_SIZE` | `4194304` | 4MB chunk size (bytes) |
| `MOBILE_BUFFER_LIMIT` | `52428800` | 50MB mobile buffer |
| `DESKTOP_BUFFER_LIMIT` | `209715200` | 200MB desktop buffer |

Protocol constants (version, ports, headers, message types) live in `src/protocol/constants.ts` and are exported from `@pairsync/core`.

Not yet defined (Phase 1+): `MAX_CONCURRENT_TRANSFERS`, `CERT_VALIDITY_DAYS`, `CERT_REGEN_DAYS`.

## Protocol Wire Format (design only — types defined, transport not implemented)

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

## Testing

Vitest is configured (`test: vitest run`). 39 unit tests pass covering protocol constants (version/ports/headers/message types), shared constants (timeouts/sizes), the three XState machines, and platform detection (node/web/mobile/desktop via stubbed globals). Test files live in `src/__tests__/`. Run from the package root with `pnpm test`, or everything from the repo root with `pnpm test`. CI runs this in the `test` job.

## ADRs

Context-specific ADRs are stored in `packages/core/docs/adr/`. Root-level ADRs in `docs/adr/` apply to the entire monorepo.

---

**For more information:** See `CONTEXT-MAP.md` at the repo root for the full monorepo structure.
