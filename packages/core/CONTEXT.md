# Core Package Context

**Context:** `packages/core/`  
**Domain:** Shared domain logic, state machines, protocols, and transfer engine  
**Part of:** PairSync Monorepo (see `CONTEXT-MAP.md`)

---

## Purpose

The **core** package is the home for **platform-agnostic PairSync domain logic** — the business rules for how devices discover each other, how files are transferred, and how trust/security is handled. Per `IMPLEMENTATION_PLAN.md` this is where the "heart" of PairSync lives so web and native can share it.

> ✅ **Status: Phase 0.6 + 1.1 + 1.2 + 1.5 + 1.6 + 1.7 + 1.8 + 2.1 implemented.** Shared types, constants, platform utils, the three XState machines (comprehensively unit-tested), the shared protocol constants, the zod wire-message schemas, the heartbeat protocol logic, interface selection, and the UDP multicast discovery engine are implemented and unit-tested. **Phase 1 (Core Infrastructure) is complete; Phase 2.1 (UDP multicast discovery) is done.** Still **Planned**: mDNS, manual IP fallback, connection initiation, transfer engine, security (see the table below). **No app code imports `@pairsync/core` yet** (no `workspace:*` dependency declares it); that happens in Phase 2+.

## Current Structure

```text
packages/core/
├── src/
│   ├── index.ts           # Re-exports ./types, ./protocol, ./constants, ./utils, ./network, ./discovery, ./state
│   ├── types/
│   │   ├── device.ts      # Platform, NetworkInterface, Device
│   │   ├── transfer.ts    # TransferState, Transfer, Chunk, Manifest
│   │   ├── protocol.ts    # HeartbeatPayload, PrepareRequest/Response, Chunk/Resume
│   │   └── index.ts
│   ├── protocol/
│   │   ├── constants.ts   # PROTOCOL_VERSION, ports, HTTP_HEADERS, MESSAGE_TYPES
│   │   ├── schemas.ts     # zod wire schemas + builders: prepare/chunk/resume + transferMessageSchema
│   │   └── index.ts
│   ├── constants/
│   │   ├── timeouts.ts    # MISSED_HEARTBEATS_LIMIT, HEARTBEAT_*, CONNECTION/TRANSFER_TIMEOUT
│   │   ├── sizes.ts       # CHUNK_SIZE, MOBILE/DESKTOP_BUFFER_LIMIT
│   │   └── index.ts
│   ├── utils/
│   │   ├── platform.ts    # getPlatform, isMobile, isWeb, isDesktop, isNode
│   │   └── index.ts
│   ├── network/
│   │   ├── heartbeat.ts   # build/parse heartbeat, expiry helpers, HeartbeatTracker
│   │   ├── interfaces.ts  # locality checks, priority ranking, backoff, detector contract
│   │   └── index.ts
│   ├── discovery/
│   │   ├── udp.ts         # MulticastDiscovery engine + MulticastSocket contract (2.1)
│   │   └── index.ts
│   └── __tests__/         # Vitest: constants, protocol constants, machines, platform, heartbeat, discovery
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
| `xstate` | ✅ Installed (used) | XState v5 machines: device, discovery, transfer (Phase 1.1) |
| `zod` | ✅ Installed (used) | Heartbeat datagram schema (`heartbeatSchema`, Phase 1.6) + wire-message schemas (`prepare/chunk/resume`, Phase 1.2) |
| `vitest` | ✅ devDep | Unit tests (153 passing) |

Platform-specific crypto/networking libraries live in the **apps**, not core — e.g. `react-native-quick-crypto` in `apps/native` (spike-verified for X25519/HKDF/AES-256-GCM) and Rust crates in the Tauri app.

## Responsibilities (by phase)

| Subsystem | Plan phase | Status |
|-----------|-----------|--------|
| Shared types (device, transfer, chunk, manifest, protocol) | Phase 0 (0.6) | ✅ Implemented + tested |
| Shared constants (timeouts, sizes) | Phase 0 (0.6) | ✅ Implemented + tested |
| Platform detection utils | Phase 0 (0.6) | ✅ Implemented + tested |
| State machines (XState): device, discovery, transfer | Phase 1 (1.1) | ✅ Implemented + tested |
| Protocol constants (version, ports, headers, message types) | Phase 1 (1.5) | ✅ Implemented + tested |
| Heartbeat protocol logic (generate/parse/expiry, tracker) | Phase 1 (1.6) | ✅ Implemented + tested |
| Interface selection logic (priority ranking, locality filtering, backoff) | Phase 1 (1.7) | ✅ Implemented + tested |
| Message schemas (zod wire schemas: prepare/chunk/resume + discriminated union) | Phase 1 (1.2) | ✅ Implemented + tested |
| UDP multicast discovery engine (MulticastDiscovery + MulticastSocket contract) | Phase 2 (2.1) | ✅ Implemented + tested |
| mDNS discovery, manual IP fallback, connection initiation | Phase 2 | 🚧 Planned |
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
| `DISCOVERY_PORT` | `53350` | Custom UDP multicast discovery port |
| `MDNS_PORT` | `5353` | Standard mDNS port for `.local` name resolution |
| `TRANSFER_PORT_START` / `TRANSFER_PORT_END` | `53351` / `53360` | TCP transfer port range |
| `TRANSFER_PORTS` | `[53351…53360]` | All 10 transfer ports |
| `HTTP_HEADERS` | `X-PairSync-Version`, `X-Nonce`, `X-Device-ID`, `X-Cert-Fingerprint` | HTTP header names |
| `MESSAGE_TYPES` | `heartbeat`, `prepare`, `prepare_response`, `chunk_request`, `chunk_response`, `resume` | Wire message discriminators |
| `MISSED_HEARTBEATS_LIMIT` | `5` | Missed heartbeats allowed before a device is dropped |
| `HEARTBEAT_INTERVAL` | `5000` | Heartbeat broadcast interval (ms) |
| `HEARTBEAT_TIMEOUT` | `25000` | Device removal after timeout (ms; derived: `INTERVAL × MISSED_HEARTBEATS_LIMIT`) |
| `CONNECTION_TIMEOUT` | `10000` | Connection establishment timeout (ms) |
| `TRANSFER_TIMEOUT` | `300000` | Overall transfer timeout (ms) |
| `CHUNK_SIZE` | `4194304` | 4MB chunk size (bytes) |
| `MOBILE_BUFFER_LIMIT` | `52428800` | 50MB mobile buffer |
| `DESKTOP_BUFFER_LIMIT` | `209715200` | 200MB desktop buffer |

Protocol constants (version, ports, headers, message types) live in `src/protocol/constants.ts` and are exported from `@pairsync/core`.

Not yet defined (Phase 1+): `MAX_CONCURRENT_TRANSFERS`, `CERT_VALIDITY_DAYS`, `CERT_REGEN_DAYS`.

## Protocol Wire Format (design only — types defined, transport not implemented)

### Heartbeat Payload (JSON)

Built by `buildHeartbeat()` and validated by `parseHeartbeat()` (via `heartbeatSchema`). The `type` discriminator comes from `MESSAGE_TYPES.HEARTBEAT`; platform values are lowercase (`ios`, `android`, …). `cert_fingerprint` is optional — serialized only when the sender provides it (TLS isn't shipped yet). Interface addresses are validated as real IPv4/IPv6 (`z.ipv4()`/`z.ipv6()`).

```json
{
  "type": "heartbeat",
  "device_id": "a1b2c3d4-5678-90ef-ghij-klmnopqrstuv",
  "alias": "Swift Cheetah",
  "platform": "ios",
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

Vitest is configured (`test: vitest run`). 153 unit tests pass covering protocol constants (version/ports/headers/message types), the zod wire-message schemas and builders (prepare/chunk/resume round-trips, field validation, canonical SHA-256 digest validation, chunk-layout consistency, RFC 4648 base64 chunk encoding/decoding with known vectors and a runtime fallback, discriminator pinning, unknown-discriminator rejection, discriminated-union dispatch), shared constants (timeouts/sizes), the three XState machines (every state/transition/guard, including device loss, retry caps, resume caps, zero-chunk transfers, timeout-cleared-on-exit, and ignored events in the wrong state), platform detection (node/web/mobile/desktop via stubbed globals), the heartbeat module (build/parse validation, missed-heartbeat counting, tracker expiry with an injected clock), interface selection (RFC1918/ULA/link-local locality, Wi-Fi/Ethernet priority ranking, VPN/loopback filtering, backoff schedule), and UDP multicast discovery (group joins, immediate + interval sends, fresh heartbeat payloads, own-echo dedupe, malformed-datagram tolerance, send/join failure recovery, stop cleanup, concurrent start/stop guards, stop-during-start membership rollback, overlapping-tick dropping, restart — over an in-memory socket). Test files live in `src/__tests__/`. Run from the package root with `pnpm test`, or everything from the repo root with `pnpm test`. CI runs this in the `test` job.

## ADRs

Context-specific ADRs are stored in `packages/core/docs/adr/`. Root-level ADRs in `docs/adr/` apply to the entire monorepo.

---

**For more information:** See `CONTEXT-MAP.md` at the repo root for the full monorepo structure.
