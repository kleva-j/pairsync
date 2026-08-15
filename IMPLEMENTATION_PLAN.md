# PairSync Implementation Plan

**Document Version:** 1.0  
**Last Updated:** August 14, 2026  
**PRD Version:** 3.0 (QR + ECDH Handshake)  
**Status:** DRAFT - Ready for Review

---

## Executive Summary

This document provides a **detailed, efficient breakdown** of the PairSync implementation into **5 sequential phases**, accounting for the **current project state** (Turborepo monorepo skeleton with React + React Native + Tauri setup, but **no core functionality implemented**).

The PRD describes a **cross-platform P2P file/clipboard sharing system** with:

- Zero-configuration local network discovery (UDP Multicast + mDNS + Manual IP)
- Secure transfers (TLS 1.3 + TOFU, with v2.0 QR+ECDH handshake as primary)
- Chunked, resumable file transfers (4MB chunks, disk-buffered)
- Cross-platform support (iOS, Android, macOS, Windows, Linux)
- Background transfers, accessibility, localization

**Key Insight:** The existing project structure provides a **solid foundation** (Turborepo, shared packages, platform-specific apps), but **all core logic must be built from scratch**. The implementation plan must account for:

1. **Platform divergence** (React Native vs Tauri/Rust networking)
2. **Cryptographic complexity** (TLS + ECDH + HKDF)
3. **Network edge cases** (multiple interfaces, IPv4/IPv6, firewalls)
4. **State complexity** (device discovery, connection lifecycles, transfer states)

---

## Current Project State Assessment

### What Exists (✅)

```
pairsync/
├── apps/
│   ├── web/          # React + TanStack Router + Tauri desktop target
│   │   ├── src/main.tsx, routes/index.tsx (basic homepage)
│   │   └── src-tauri/  # Tauri desktop integration
│   └── native/       # React Native + Expo mobile target
│       └── app/       # Expo Router with basic drawer navigation
├── packages/
│   ├── config/       # Shared TypeScript config (tsconfig.base.json)
│   ├── core/         # @pairsync/core — manifest + turbo check-types wired up
│   │   └── src/      # index.ts re-exports schema.ts, types.ts (still empty stubs)
│   ├── env/          # @pairsync/env — zod-validated schemas
│   │   └── src/      # web.ts (VITE_SERVER_URL), native.ts (EXPO_PUBLIC_SERVER_URL)
│   └── ui/           # Shared shadcn/ui components
│       └── src/      # components/, hooks/, lib/, styles/
├── package.json      # Turborepo root config
├── turbo.json        # Turborepo pipeline
├── .github/workflows/ci.yml  # check-types + build on every PR
├── IMPLEMENTATION_PLAN.md    # this document
└── PairSync Product Requirements.md  # PRD v3.0
```

### What's Missing (❌)

| Category             | Status         | Notes                                                                 |
| -------------------- | -------------- | --------------------------------------------------------------------- |
| Core state machines  | ❌ Not started | XState/Zustand for device/transfer states                             |
| Network discovery    | ❌ Not started | UDP multicast, mDNS, manual IP fallback                               |
| TLS implementation   | ❌ Not started | Self-signed certs, TOFU trust model                                   |
| ECDH handshake       | ❌ Not started | X25519 key exchange, HKDF derivation                                  |
| QR pairing           | ❌ Not started | Generation, scanning, manual entry                                    |
| File transfer        | ❌ Not started | Chunked streaming, resume, verification                               |
| Clipboard sync       | ❌ Not started | Rich content type handling                                            |
| Database             | ❌ Not started | SQLite for trusted devices, manifests                                 |
| Background transfers | ❌ Not started | Platform-specific (iOS BG tasks, Android foreground service, desktop) |
| Security UI          | ❌ Not started | Trust prompts, indicators, device management                          |
| Accessibility        | ❌ Not started | WCAG 2.1 AA compliance                                                |
| Localization         | ❌ Not started | i18n system                                                           |

### Technology Stack Confirmed

| Layer              | Technology                                                                        | Status             |
| ------------------ | --------------------------------------------------------------------------------- | ------------------ |
| Monorepo           | Turborepo + pnpm                                                                  | ✅ Configured      |
| Shared Core        | TypeScript (Strict)                                                               | ✅ Ready           |
| Mobile UI          | React Native + Expo + uniwind                                                     | ✅ Skeleton exists |
| Desktop UI         | Tauri + React + Vite + Tailwind                                                   | ✅ Skeleton exists |
| Mobile Networking  | `react-native-udp`, `react-native-mdns`, `expo-file-system`                       | ⚠️ Not integrated  |
| Desktop Networking | Tauri Rust plugins (`socket2`/tokio UDP, `mdns` crate, `rustls`)                  | ⚠️ Not integrated  |
| Crypto (Mobile)    | `react-native-quick-crypto` (X25519, SHA-256, HKDF, AES-256-GCM) — spike-verified | ⚠️ Not integrated  |
| Crypto (Desktop)   | `x25519-dalek`, `hkdf`, `aes-gcm`, `rustls` (Rust crates)                         | ⚠️ Not integrated  |
| QR Code            | `react-native-qrcode-svg`, `react-native-vision-camera`, `qrcode`, `zbar`         | ⚠️ Not integrated  |
| State              | XState + Zustand                                                                  | ⚠️ Not integrated  |
| Storage            | SQLite (`expo-sqlite` / `rusqlite`)                                               | ⚠️ Not integrated  |

---

## Refined Implementation Phases

The PRD's 5-phase plan is **well-structured** but needs **refinement** for:

1. **Dependencies** between phases
2. **Parallelization opportunities**
3. **Risk mitigation**
4. **Testing strategy**
5. **Current state alignment**

### Phase Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        PHASE 0: FOUNDATION                      │
│  (Pre-requisite - Week 0) - SETUP & TOOLING                     │
└─────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────┐
│                        PHASE 1: CORE INFRA                      │
│  (Week 1-2) - State, Types, Protocol Foundation                 │
└─────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────┐
│                     PHASE 2: DISCOVERY & CONNECT                │
│  (Week 3-4) - Network Discovery, Initial Handshake              │
└─────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────┐
│                      PHASE 3: TRANSFER ENGINE                   │
│  (Week 5-6) - File/Clipboard Transfer with Resume               │
└─────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────┐
│                      PHASE 4: TRUST & SECURITY                  │
│  (Week 7-8) - QR+ECDH Handshake, TLS+TOFU, Security UI          │
└─────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────┐
│                      PHASE 5: POLISH & RELEASE                  │
│  (Week 9) - Background Transfers, Accessibility, Localization   │
└─────────────────────────────────────────────────────────────────┘
```

**Note:** The PRD originally had 5 phases over 8 weeks. This plan **adds Phase 0** (foundation setup) and **extends to 9 weeks** to account for the **empty current state** and **testing complexity**. The QR+ECDH handshake (PRD Phase 4) is **moved to Phase 4** (not Phase 3) because it **depends on** core transfer functionality being proven first.

### Scope Decision: MVP Security Ordering (Approved v1.0)

**Decision:** Plaintext Phase 3 transfers are approved **for development only**. Security (TLS 1.3 + TOFU, and QR+ECDH) ships in Phase 4, and **the MVP release is gated on Phase 4 completion** — the Phase 3 plaintext TCP path is an internal test artifact and **never ships**.

**Rationale:** Keeps the PRD's "MVP LOCKED" security scope (Section 3.3, end-to-end encryption) intact at release while preserving the plan's testing order — transfer bugs are easier to isolate before TLS/crypto layers are added. This splits the PRD's own Phase 3 ("TLS Handshake & Chunked File Streaming") into testable units without weakening the shipped security model.

**Implications:**

- Phase 3 success criteria gain: "no plaintext transfer path exists in release builds."
- Phase 4 is a hard release gate; if Phase 4 slips, the MVP release slips with it.
- Any change to this decision requires updating the PRD's Section 3.3 MVP scope and this section.

---

## Phase 0: Foundation (Week 0) - **CRITICAL PRE-REQ**

**Purpose:** Establish the **development foundation** before writing any feature code.

### Why This Phase is Needed

The current project is a **skeleton**. Without proper foundation:

- **Dependency conflicts** will arise between platform-specific implementations
- **Type sharing** between web/native/desktop will be broken
- **Testing infrastructure** won't exist
- **Build pipelines** may fail for some targets

### Tasks

| ID  | Task                            | Description                                                                                 | Owner  | Success Criteria                                                  | Risk   | Mitigation                                 |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------- | ------ | ------------------------------------------ |
| 0.1 | Validate build pipeline         | Ensure `pnpm install`, `pnpm dev`, `pnpm build` work for all targets (web, native, desktop) | DevOps | All targets build without errors                                  | Medium | Fix any TurboRepo config issues early      |
| 0.2 | Set up shared TypeScript config | Create `packages/config` with shared `tsconfig.json` for all packages                       | Core   | All packages compile with shared rules                            | Low    | Use `extends` in package tsconfigs         |
| 0.3 | Create core package structure   | Set up `packages/core/src/` with proper module structure                                    | Core   | Importable from all apps                                          | Low    | Follow monorepo best practices             |
| 0.4 | Create env package              | Shared environment detection, platform constants                                            | Core   | `import { isMobile, isDesktop, PORT } from '@pairsync/env'` works | Low    | Simple utility package                     |
| 0.5 | Set up testing infrastructure   | Jest/Vitest for unit tests, Playwright for E2E (web), Detox for E2E (native)                | DevOps | Test frameworks configured and passing basic tests                | High   | Testing is critical for reliability        |
| 0.6 | Create shared utility types     | Device, Transfer, Chunk, Protocol types                                                     | Core   | Types used consistently across all packages                       | Medium | Get types right early to avoid refactoring |
| 0.7 | Document development workflow   | Contributing guide, commit conventions, PR template                                         | DevOps | Team can onboard quickly                                          | Low    | Standardize early                          |

**Phase 0 Status (Aug 14, 2026):**

- ✅ **0.1** — CI workflow added; `pnpm check-types` / `pnpm build` green across all packages
- ✅ **0.2** — `packages/config/tsconfig.base.json` exists and is extended by every package
- ✅ **0.3** — `@pairsync/core` has a manifest, entry point, and turbo `check-types` task
- ✅ **0.4** — `@pairsync/env` provides zod-validated `./web` and `./native` schemas
- ✅ **0.5** — vitest wired into `@pairsync/core` + `@pairsync/env` with 17 passing unit tests; turbo `test` task, root `pnpm test`, and a CI `test` job added (E2E — Playwright/Detox — deferred to later phases)
- ✅ **0.6** — shared types (`device`/`transfer`/`protocol`), constants (ports/timeouts/sizes), and platform utils implemented in `@pairsync/core` with tests
- ✅ **0.7** — `.github/CONTRIBUTING.md` and `.github/pull_request_template.md` added

### Deliverables

```
packages/
├── config/
│   └── tsconfig.base.json      # Shared TS config (package root, no src/)
├── core/
│   ├── src/
│   │   ├── types/               # Shared TypeScript types
│   │   │   ├── device.ts        # Device, Interface, Platform types
│   │   │   ├── transfer.ts      # Transfer, Chunk, Manifest types
│   │   │   ├── protocol.ts      # Protocol message types
│   │   │   └── index.ts
│   │   ├── constants/           # Shared constants
│   │   │   ├── ports.ts         # PORT = 53350, TRANSFER_PORTS = 53351-53360
│   │   │   ├── timeouts.ts      # HEARTBEAT_INTERVAL = 5000, TIMEOUT = 25000
│   │   │   └── index.ts
│   │   ├── utils/               # Shared utilities
│   │   │   ├── platform.ts      # Platform detection
│   │   │   └── index.ts
│   │   └── index.ts             # Package entry point
└── env/
    └── src/
        ├── index.ts             # Platform detection, env vars
        └── constants.ts          # Shared constants

apps/
├── web/
│   └── ... (existing) + tests/
└── native/
    └── ... (existing) + tests/

# New files
- .github/contributing.md
- .github/pull_request_template.md
- vitest.config.ts (or jest.config.js)
- packages/core/package.json (proper)
- packages/env/package.json (proper)
```

### Success Criteria

- [ ] `pnpm run dev` starts all apps without errors
- [ ] `pnpm run build` builds all targets successfully
- [ ] Shared types can be imported from `@pairsync/core` in any app
- [x] Unit test framework runs and passes basic tests
- [x] Development workflow documented

### Dependencies

- **None** (this is the foundation)

### Parallelization

- Tasks 0.1, 0.2, 0.4 can be done in parallel
- Tasks 0.3, 0.6 depend on 0.2
- Task 0.5 can start after 0.2

---

## Phase 1: Core Infrastructure (Weeks 1-2)

**Purpose:** Build the **shared logic foundation** that all platforms will use.

### Tasks

| ID  | Task                               | Description                                                                 | Owner | Success Criteria                                    | Risk   | Mitigation                             |
| --- | ---------------------------------- | --------------------------------------------------------------------------- | ----- | --------------------------------------------------- | ------ | -------------------------------------- |
| 1.1 | Design state machine               | Create XState machines for: DeviceState, DiscoveryState, TransferState      | Core  | State diagrams documented and reviewed              | High   | Complex state logic - design carefully |
| 1.2 | Implement device state machine     | `IDLE` ↔ `SCANNING` ↔ `DISCOVERED` ↔ `CONNECTING` ↔ `CONNECTED` ↔ `ERROR`   | Core  | State transitions work correctly                    | High   | Test all edge cases                    |
| 1.3 | Implement discovery state machine  | Manages network scanning, device list, timeouts                             | Core  | Devices appear/disappear correctly                  | Medium | Handle race conditions                 |
| 1.4 | Implement transfer state machine   | `PREPARING` → `TRANSFERRING` → `VERIFYING` → `COMPLETE`/`ERROR`/`CANCELLED` | Core  | All transfer states handled                         | High   | Complex resume logic                   |
| 1.5 | Create shared protocol constants   | Message types, headers, timeouts, retry logic                               | Core  | All platforms use same constants                    | Low    | Centralize in core                     |
| 1.6 | Implement heartbeat protocol logic | JSON payload generation/parsing, timeout handling                           | Core  | Heartbeats sent every 5s, devices removed after 25s | Medium | Timer management across platforms      |
| 1.7 | Create interface selection logic   | IP priority rules, excluded interfaces (VPN, loopback)                      | Core  | Correct interface selected for each platform        | Medium | Platform-specific network APIs differ  |
| 1.8 | Unit test all state machines       | 100% coverage of state transitions                                          | Core  | All state transitions tested                        | High   | Prevents regressions                   |

### Deliverables

```
packages/core/src/
├── state/
│   ├── machines/
│   │   ├── deviceMachine.ts      # XState machine for device lifecycle
│   │   ├── discoveryMachine.ts   # XState machine for network discovery
│   │   ├── transferMachine.ts    # XState machine for file transfers
│   │   └── index.ts
│   ├── actors/                   # XState actors for side effects
│   │   ├── discoveryActor.ts
│   │   ├── transferActor.ts
│   │   └── index.ts
│   └── index.ts
├── protocol/
│   ├── constants.ts             # Protocol version, headers, ports
│   ├── messages/                # Message schemas and serializers
│   │   ├── discovery.ts          # Heartbeat, device info messages
│   │   ├── transfer.ts           # Prepare, chunk, resume messages
│   │   └── index.ts
│   └── index.ts
├── network/
│   ├── interfaces.ts            # Interface selection logic
│   ├── heartbeat.ts              # Heartbeat protocol implementation
│   └── index.ts
├── types/                       # (from Phase 0, expanded)
└── __tests__/
    ├── deviceMachine.test.ts
    ├── discoveryMachine.test.ts
    ├── transferMachine.test.ts
    └── heartbeat.test.ts
```

### Success Criteria

- [ ] All state machines are implemented and tested
- [ ] Heartbeat protocol logic works in isolation
- [ ] Interface selection logic handles all edge cases
- [ ] Protocol constants are shared and consistent
- [ ] Unit test coverage ≥ 90% for core logic

### Dependencies

- Phase 0 (Foundation)

### Parallelization

- State machines (1.1-1.4) can be designed in parallel
- Protocol constants (1.5) can be done independently
- Heartbeat logic (1.6) and interface selection (1.7) can be parallelized
- Testing (1.8) can start as soon as individual components are ready

### Risk Assessment

| Risk                                   | Probability | Impact | Mitigation                                          |
| -------------------------------------- | ----------- | ------ | --------------------------------------------------- |
| State machine complexity leads to bugs | High        | High   | Design with state diagrams first, extensive testing |
| Platform differences in state handling | Medium      | High   | Abstract platform-specific code behind interfaces   |
| Timer/timeout inconsistencies          | Medium      | Medium | Use shared timer utilities                          |

---

## Phase 2: Discovery & Connection (Weeks 3-4)

**Purpose:** Implement **device discovery** and **initial connection establishment** across all platforms.

### Overview

This phase implements the **3-tier discovery system**:

1. **Tier 1:** UDP Multicast (primary)
2. **Tier 2:** mDNS (cross-subnet with repeater)
3. **Tier 3:** Manual IP entry (fallback)

### Tasks

#### Platform-Agnostic Tasks (Core Team)

| ID  | Task                              | Description                                                                            | Success Criteria                           | Risk     | Mitigation                                       |
| --- | --------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------ | -------- | ------------------------------------------------ |
| 2.1 | Implement UDP multicast discovery | Send/receive heartbeat messages on `224.0.0.1:53350` (IPv4) and `FF02::1:53350` (IPv6) | Devices discover each other on same subnet | Medium   | NAT loopback, firewall issues                    |
| 2.2 | Implement mDNS discovery          | Advertise and discover `_pairsync._tcp.local` services                                 | Cross-subnet discovery works with repeater | Medium   | mDNS library differences                         |
| 2.3 | Implement device list management  | Add/remove devices, handle timeouts, deduplicate                                       | Device list updates correctly in UI        | Low      | Use existing state machines                      |
| 2.4 | Implement connection initiation   | TCP handshake to establish connection before transfer                                  | Connection established successfully        | Medium   | TLS not yet implemented - plain TCP for now      |
| 2.5 | Create platform abstraction layer | Abstract UDP/mDNS/TCP operations behind common interface                               | Same code works on all platforms           | **HIGH** | This is the key to cross-platform                |
| 2.6 | Unit & integration tests          | Test discovery across platforms                                                        | Discovery works in test environment        | High     | Network testing is tricky                        |
| 2.7 | Implement mDNS repeater           | Relay/bridge `_pairsync._tcp.local` discovery across subnets (PRD Tier 2)              | Cross-subnet discovery works end-to-end    | **HIGH** | New always-on component; needs a deployment home |
| 2.8 | Set up SQLite database layer      | `expo-sqlite` (mobile), `rusqlite` (desktop); schema + migrations (moved from Phase 5) | DB initializes on both platforms           | Medium   | Platform SQLite APIs differ                      |
| 2.9 | Schema versioning & migrations    | Track schema version, apply migrations on launch                                       | Migrations apply automatically             | Medium   | Test migrations thoroughly                       |

#### Mobile-Specific Tasks (Mobile Team)

| ID   | Task                                            | Description                                                                       | Success Criteria                            |
| ---- | ----------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------- |
| 2.M1 | Integrate `react-native-udp`                    | Bind native UDP socket for multicast                                              | UDP messages sent/received on mobile        |
| 2.M2 | Integrate `react-native-mdns`                   | Bind native mDNS for service discovery                                            | mDNS discovery works on mobile              |
| 2.M3 | Handle Android/iOS network permissions          | Request `INTERNET`, `LocalNetwork` permissions                                    | Permissions requested and granted           |
| 2.M4 | Implement platform-specific interface detection | Detect Wi-Fi, Ethernet, VPN, loopback on mobile                                   | Interfaces correctly identified             |
| 2.M5 | Request iOS multicast entitlement               | Apply for `com.apple.developer.networking.multicast` entitlement (Apple approval) | Entitlement granted; multicast works on iOS |

#### Desktop-Specific Tasks (Desktop Team)

| ID   | Task                                            | Description                                              | Success Criteria                      |
| ---- | ----------------------------------------------- | -------------------------------------------------------- | ------------------------------------- |
| 2.D1 | Create Tauri Rust plugin for UDP multicast      | Rust implementation of UDP socket with multicast support | UDP messages sent/received on desktop |
| 2.D2 | Create Tauri Rust plugin for mDNS               | Rust implementation of mDNS service discovery            | mDNS discovery works on desktop       |
| 2.D3 | Handle firewall exceptions                      | Auto-request firewall rules for ports 53350-53360        | Firewall exceptions created           |
| 2.D4 | Implement platform-specific interface detection | Detect interfaces on macOS/Windows/Linux                 | Interfaces correctly identified       |

### Deliverables

```
packages/core/src/
├── discovery/
│   ├── udp.ts                   # UDP multicast discovery logic
│   ├── mdns.ts                  # mDNS discovery logic
│   ├── manual.ts                # Manual IP entry logic
│   ├── deviceManager.ts         # Manages discovered device list
│   ├── connection.ts            # TCP connection establishment
│   └── index.ts
├── platform/
│   ├── mobile/
│   │   ├── udp.ts               # react-native-udp integration
│   │   ├── mdns.ts              # react-native-mdns integration
│   │   └── index.ts
│   ├── desktop/
│   │   ├── udp.ts               # Tauri UDP plugin commands
│   │   ├── mdns.ts              # Tauri mDNS plugin commands
│   │   └── index.ts
│   └── index.ts                 # Platform abstraction exports
├── database/
│   ├── sqlite.ts                # SQLite database setup
│   ├── schema.ts                # Database schema
│   ├── migrations/              # Migration scripts
│   │   └── 001_initial.ts
│   └── index.ts
└── __tests__/
    ├── discovery.test.ts
    └── connection.test.ts

# Tauri Plugins (new)
apps/web/src-tauri/
├── plugins/
│   ├── pairsync-udp/           # UDP multicast plugin
│   │   ├── Cargo.toml
│   │   ├── src/lib.rs
│   │   └── ...
│   └── pairsync-mdns/           # mDNS plugin
│       ├── Cargo.toml
│       └── src/lib.rs
```

### Success Criteria

- [ ] Devices discover each other via UDP multicast on same subnet
- [ ] mDNS discovery works across subnets (with repeater)
- [ ] Manual IP entry fallback works
- [ ] Connection establishment works (plain TCP for now)
- [ ] All platform-specific implementations use the abstraction layer
- [ ] Discovery works in E2E tests (web↔web, native↔native, web↔native)

### Dependencies

- Phase 1 (Core Infrastructure)
- Platform-specific networking libraries integrated

### Parallelization

- Core tasks (2.1-2.6) can be done in parallel with platform-specific tasks
- Mobile team works on 2.M1-2.M4 in parallel
- Desktop team works on 2.D1-2.D4 in parallel
- Integration and testing (2.6) happens last

### Risk Assessment

| Risk                                              | Probability | Impact | Mitigation                                        |
| ------------------------------------------------- | ----------- | ------ | ------------------------------------------------- |
| Platform-specific networking libraries have bugs  | High        | High   | Extensive testing, fallback mechanisms            |
| mDNS implementation differences between platforms | High        | High   | Abstract behind common interface, test thoroughly |
| Firewall/permission issues block discovery        | Medium      | High   | Good error messages, manual fallback              |
| UDP multicast blocked on some networks            | Medium      | Medium | mDNS and manual IP fallbacks                      |

---

## Phase 3: Transfer Engine (Weeks 5-6)

**Purpose:** Implement the **file and clipboard transfer engine** with chunking, resume, and verification.

### Overview

This phase implements:

- File transfer protocol (`/api/pairsync/v1/prepare`, chunked upload/download)
- Clipboard content transfer
- Resume support with manifest and bitmap
- Progress tracking
- Hash verification

### Tasks

#### Core Transfer Logic (Core Team)

| ID   | Task                                          | Description                                                                                  | Success Criteria                                   | Risk     | Mitigation                             |
| ---- | --------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------- | -------- | -------------------------------------- |
| 3.1  | Implement `/api/pairsync/v1/prepare` endpoint | Metadata handshake (file name, size, hashes, chunk info)                                     | Sender and receiver exchange metadata successfully | Medium   | Version compatibility handling         |
| 3.2  | Implement chunked upload                      | Send file in 4MB chunks with hash verification                                               | Chunks sent and verified correctly                 | High     | Memory management on mobile            |
| 3.3  | Implement chunked download                    | Receive and write chunks to disk                                                             | Chunks received and written correctly              | High     | Disk I/O errors, permissions           |
| 3.4  | Implement resume support                      | Manifest with chunk bitmap, request missing chunks                                           | Interrupted transfers resume correctly             | **HIGH** | Complex state to manage                |
| 3.5  | Implement hash verification                   | SHA-256 verification of each chunk and full file                                             | Corrupted data detected and re-requested           | Medium   | Performance overhead                   |
| 3.6  | Implement progress tracking                   | Calculate speed, percentage, ETA                                                             | Progress bars update in real-time                  | Low      | Math for ETA can be tricky             |
| 3.7  | Handle concurrent transfers                   | Max 4 concurrent transfers, queue additional; max 2 concurrent resumes (PRD §3.3)            | Concurrent limits enforced                         | Medium   | Resource contention                    |
| 3.8  | Implement clipboard transfer                  | Handle all supported content types (text, images, etc.)                                      | Clipboard content transferred correctly            | Medium   | Platform differences in clipboard APIs |
| 3.9  | Handle large folder trees                     | Batched manifest generation, user warnings                                                   | Large folders handled gracefully                   | Medium   | Memory usage, performance              |
| 3.10 | Handle partial failure modes                  | Disk full, permissions, app kill, network drop                                               | Appropriate error messages and recovery            | **HIGH** | Many edge cases                        |
| 3.11 | Persist transfer manifests                    | Store manifests + chunk bitmap in SQLite for resume across app restarts (moved from Phase 5) | Resume works after app restart                     | Medium   | Atomic writes, checksums on manifest   |

#### Platform-Specific Tasks

| ID   | Task                                             | Description                                        | Success Criteria                                          |
| ---- | ------------------------------------------------ | -------------------------------------------------- | --------------------------------------------------------- |
| 3.M1 | Integrate `expo-file-system` for mobile file I/O | Read/write files on mobile with proper permissions | File operations work on mobile                            |
| 3.M2 | Implement mobile background transfer support     | Keep transfers alive when app backgrounded         | Transfers continue in background (within platform limits) |
| 3.M3 | Handle mobile storage permissions                | Request and handle storage permission changes      | Permissions handled gracefully                            |
| 3.D1 | Implement desktop file I/O                       | Read/write files on desktop                        | File operations work on desktop                           |
| 3.D2 | Implement desktop background transfer support    | Transfers continue when app minimized              | Transfers continue in background                          |

### Deliverables

```
packages/core/src/
├── transfer/
│   ├── prepare.ts              # /api/pairsync/v1/prepare endpoint
│   ├── upload.ts               # Chunked upload logic
│   ├── download.ts             # Chunked download logic
│   ├── resume.ts               # Resume protocol implementation
│   ├── verify.ts               # Hash verification
│   ├── progress.ts             # Progress tracking
│   ├── queue.ts                # Concurrent transfer queue
│   ├── clipboard.ts            # Clipboard content transfer
│   ├── folder.ts               # Large folder handling
│   └── index.ts
├── file/
│   ├── reader.ts               # File reading with chunking
│   ├── writer.ts               # File writing with chunk assembly
│   └── index.ts
└── __tests__/
    ├── transfer.test.ts
    ├── resume.test.ts
    └── verify.test.ts
```

### Success Criteria

- [ ] Files transfer correctly between devices
- [ ] Chunked transfer uses ≤50MB RAM on mobile, ≤200MB on desktop
- [ ] Resume works after network interruption
- [ ] Hash verification catches corrupted data
- [ ] Progress tracking is accurate
- [ ] Concurrent transfer limit enforced
- [ ] Clipboard content transfers correctly
- [ ] Large folders handled with batched manifests
- [ ] Partial failure modes handled gracefully

### Dependencies

- Phase 2 (Discovery & Connection) - Need connection establishment
- Platform-specific file I/O APIs

### Parallelization

- Core transfer logic (3.1-3.10) can be mostly parallelized
- Platform-specific file I/O (3.M1, 3.M2, 3.D1, 3.D2) can be done in parallel
- Testing requires integration of all components

### Risk Assessment

| Risk                                    | Probability | Impact | Mitigation                                      |
| --------------------------------------- | ----------- | ------ | ----------------------------------------------- |
| Memory management issues on mobile      | High        | High   | Careful chunk buffering, direct-to-disk writing |
| Disk I/O errors                         | Medium      | High   | Good error handling, retry logic                |
| Resume state corruption                 | Medium      | High   | Atomic writes, checksums on manifest            |
| Hash verification performance           | Low         | Medium | Use efficient implementations                   |
| Concurrent transfer resource contention | Medium      | Medium | Proper queue management, priorities             |

---

## Phase 4: Trust & Security (Weeks 7-8)

**Purpose:** Implement **TLS+TOFU** and **QR+ECDH handshake** for secure connections.

### Overview

This phase adds security to the connections established in Phase 2:

- **TLS 1.3** with self-signed certificates (TOFU model)
- **QR+ECDH handshake** (v2.0 primary trust method)
- **Trust management UI**
- **Security indicators**

### Why This Comes After Phase 3

**Critical Design Decision:** Security is implemented **after** basic transfer functionality because:

1. **Testing is easier** - Verify transfer works, then add security layer
2. **Debugging is simpler** - Can debug transfer issues without TLS complexity
3. **Risk reduction** - If transfer has bugs, we find them before adding security
4. **QR+ECDH depends on connection** - Need working connection to test handshake

### Tasks

#### Core Security Logic (Core Team)

| ID   | Task                                  | Description                                                                                    | Success Criteria                               | Risk     | Mitigation                           |
| ---- | ------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------- | ------------------------------------ |
| 4.1  | Generate self-signed TLS certificates | Create 30-day validity certs on first launch                                                   | Certs generated and stored securely            | Medium   | Key management, platform differences |
| 4.2  | Implement TOFU trust model            | First-time trust prompt with fingerprint, auto-trust subsequent                                | Trust flow works correctly                     | Medium   | User confusion about certs           |
| 4.3  | Implement certificate storage         | OS keychain (mobile), encrypted file (desktop)                                                 | Certs stored securely, persist across restarts | High     | Platform-specific security APIs      |
| 4.4  | Implement certificate regeneration    | Auto-regenerate when ≤7 days from expiry                                                       | New certs generated and trust prompts shown    | Medium   | User experience with re-trusting     |
| 4.5  | Implement X25519 key generation       | Shared core crypto for ECDH                                                                    | Keys generated and serialized correctly        | Medium   | Crypto library differences           |
| 4.6  | Implement ECDH key exchange + HKDF    | Shared secret derivation, session key generation                                               | Session keys derived correctly                 | **HIGH** | Crypto is hard to get right          |
| 4.7  | Implement AES-256-GCM encryption      | Encrypt/decrypt transfer data                                                                  | Data encrypted and decrypted correctly         | **HIGH** | Crypto is hard to get right          |
| 4.8  | Implement QR code payload generation  | Create QR code with device info + public key                                                   | QR code contains correct payload               | Low      | JSON serialization                   |
| 4.9  | Implement QR code payload parsing     | Parse QR code, validate expiry, extract device info                                            | QR code parsed correctly                       | Low      | Input validation                     |
| 4.10 | Implement long-term trust storage     | Store peer public keys in SQLite (trusted devices) for future connections (moved from Phase 5) | Long-term trust works without QR code          | Medium   | Key storage security                 |
| 4.11 | Implement fallback to TLS+TOFU        | When QR unavailable, use TLS+TOFU                                                              | Seamless fallback                              | Low      | Already have TLS+TOFU implemented    |
| 4.12 | Implement Quick Save rate limiting    | 10 transfers/minute, 1GB/hour per device                                                       | Rate limits enforced                           | Low      | Simple counter logic                 |
| 4.13 | Add security to connection layer      | Integrate TLS/AES encryption with transfer engine                                              | Transfers are encrypted                        | **HIGH** | Integration complexity               |

#### Platform-Specific Tasks

| ID   | Task                                             | Description                                                   | Success Criteria                  |
| ---- | ------------------------------------------------ | ------------------------------------------------------------- | --------------------------------- | ------ | ------------------------------------- |
| 4.M1 | Integrate `react-native-quick-crypto` for mobile | X25519, SHA-256, HKDF, AES-256-GCM on mobile (spike-verified) | Crypto operations work on mobile  |
| 4.M2 | Implement mobile QR code generation              | `react-native-qrcode-svg` for QR code display                 | QR codes generated on mobile      | Low    | Library integration                   |
| 4.M3 | Implement mobile QR code scanning                | `react-native-vision-camera` for scanning                     | QR codes scanned on mobile        | Medium | Camera permissions, scanning accuracy |
| 4.M4 | Implement mobile certificate storage             | iOS Keychain, Android Keystore                                | Certs stored securely on mobile   | High   | Platform-specific APIs                |
| 4.D1 | Integrate Rust crypto libraries                  | `x25519-dalek`, `ring` for desktop                            | Crypto operations work on desktop | High   | Rust library integration              |
| 4.D2 | Create Tauri plugin for QR scanning              | `zbar` integration for desktop QR scanning                    | QR codes scanned on desktop       | Medium | Desktop camera access                 |
| 4.D3 | Implement desktop QR code generation             | `qrcode` library for generation                               | QR codes generated on desktop     | Low    | Library integration                   |
| 4.D4 | Implement desktop certificate storage            | Encrypted file storage                                        | Certs stored securely on desktop  | Medium | File encryption                       |
| 4.D5 | Handle desktop firewall for TLS                  | Ensure TLS ports are open                                     | TLS connections work              | Low    | Firewall configuration                |

#### UI Tasks (UI Team)

| ID   | Task                          | Description                                                    | Success Criteria              |
| ---- | ----------------------------- | -------------------------------------------------------------- | ----------------------------- |
| 4.U1 | Create trust prompt UI        | Show device alias, platform, fingerprint, Trust/Cancel buttons | Trust prompt matches PRD spec |
| 4.U2 | Create QR code display screen | Show QR code, device alias, expiry timer, copy button          | QR display matches PRD spec   |
| 4.U3 | Create QR code scanner screen | Camera overlay, instructions, scan result handling             | Scanner matches PRD spec      |
| 4.U4 | Create manual entry UI        | Text input for QR code JSON, parse and handle                  | Manual entry works            |
| 4.U5 | Create trusted devices list   | Show all trusted devices with revoke option                    | Device management works       |
| 4.U6 | Add security indicators       | Padlock icon with color coding (green/yellow/red)              | Security status visible       |
| 4.U7 | Add Quick Save toggle         | Enable/disable auto-accept from trusted devices                | Quick Save configurable       |

### Deliverables

```
packages/core/src/
├── security/
│   ├── tls/
│   │   ├── certificate.ts        # Self-signed cert generation
│   │   ├── storage.ts            # Cert storage (keychain/encrypted file)
│   │   ├── tofu.ts               # TOFU trust model
│   │   └── index.ts
│   ├── ecdh/
│   │   ├── keygen.ts             # X25519 key generation
│   │   ├── handshake.ts          # ECDH key exchange + HKDF
│   │   ├── encryption.ts         # AES-256-GCM encryption/decryption
│   │   └── index.ts
│   ├── qr/
│   │   ├── payload.ts            # QR code payload generation/parsing
│   │   ├── expiry.ts              # Expiry validation
│   │   └── index.ts
│   ├── trust/
│   │   ├── storage.ts            # Long-term trust storage
│   │   ├── rateLimit.ts          # Quick Save rate limiting
│   │   └── index.ts
│   └── index.ts
├── __tests__/
│   ├── security.test.ts
│   ├── tls.test.ts
│   ├── ecdh.test.ts
│   └── qr.test.ts
│
# UI Components (shared in packages/ui)
packages/ui/src/components/
├── security/
│   ├── TrustPrompt.tsx           # Trust prompt dialog
│   ├── QRDisplay.tsx             # QR code display screen
│   ├── QRScanner.tsx             # QR code scanner screen
│   ├── ManualEntry.tsx           # Manual QR code entry
│   ├── TrustedDevicesList.tsx    # Trusted devices management
│   └── SecurityIndicator.tsx     # Padlock icon component
```

### Success Criteria

- [ ] TLS+TOFU trust model works correctly
- [ ] QR+ECDH handshake establishes secure channel
- [ ] Transfers are encrypted end-to-end
- [ ] Trust prompts appear when expected
- [ ] Security indicators display correctly
- [ ] Quick Save rate limiting enforced
- [ ] Fallback to TLS+TOFU works seamlessly
- [ ] Certificate regeneration handled gracefully
- [ ] All platform-specific crypto works correctly

### Dependencies

- Phase 2 (Discovery & Connection) - Need connection establishment
- Phase 3 (Transfer Engine) - Need transfer functionality to secure
- Platform-specific crypto libraries

### Parallelization

- Core security logic (4.1-4.13) can be parallelized
- Platform-specific crypto (4.M1-4.M4, 4.D1-4.D5) can be done in parallel
- UI tasks (4.U1-4.U7) can be done in parallel with core logic
- Integration and testing happens last

### Risk Assessment

| Risk                            | Probability | Impact       | Mitigation                                    |
| ------------------------------- | ----------- | ------------ | --------------------------------------------- |
| Crypto implementation bugs      | Medium      | **CRITICAL** | Use well-audited libraries, extensive testing |
| Key management vulnerabilities  | Medium      | **CRITICAL** | Platform-native secure storage, encryption    |
| TLS implementation issues       | Medium      | **CRITICAL** | Use established TLS libraries                 |
| QR code parsing vulnerabilities | Low         | Medium       | Input validation, expiry checks               |
| User confusion about security   | High        | Medium       | Clear UI, good documentation                  |
| Certificate regeneration UX     | Medium      | Medium       | Clear prompts, explanations                   |

---

## Phase 5: Polish & Release (Week 9)

**Purpose:** Final polish, **background transfers**, **accessibility**, **localization**, and release preparation.

### Tasks

#### Background Transfers

| ID  | Task                             | Description                                       | Owner   | Success Criteria                                        |
| --- | -------------------------------- | ------------------------------------------------- | ------- | ------------------------------------------------------- |
| 5.1 | iOS background transfers         | `BackgroundTasks` + `BGTaskScheduler`             | Mobile  | Transfers continue when app backgrounded (30 min limit) |
| 5.2 | Android background transfers     | Foreground Service with persistent notification   | Mobile  | Transfers continue with notification                    |
| 5.3 | Desktop background transfers     | Ensure transfers continue when app minimized      | Desktop | Transfers continue in background                        |
| 5.4 | Auto-resume on network reconnect | Detect network reconnect, resume paused transfers | Core    | Transfers resume automatically                          |

#### Accessibility & Localization

| ID  | Task                   | Description                                         | Owner | Success Criteria                   |
| --- | ---------------------- | --------------------------------------------------- | ----- | ---------------------------------- |
| 5.5 | WCAG 2.1 AA compliance | Screen reader support, keyboard nav, color contrast | UI    | All accessibility requirements met |
| 5.6 | Localization system    | `locales/{lang}.json` files, RTL support            | UI    | App displays in user's locale      |
| 5.7 | Dynamic type support   | Font scaling up to 200%                             | UI    | App usable with large fonts        |
| 5.8 | Reduced motion support | Respect `prefers-reduced-motion`                    | UI    | Animations disabled when preferred |

#### Error Handling & UX

| ID   | Task                         | Description                                | Owner | Success Criteria                 |
| ---- | ---------------------------- | ------------------------------------------ | ----- | -------------------------------- |
| 5.9  | Offline-first error messages | Clear, actionable errors for all scenarios | UI    | All error scenarios have good UX |
| 5.10 | Final error handling review  | Ensure all edge cases have proper handling | Core  | All error paths tested           |

#### Release Preparation

| ID   | Task                          | Description                              | Owner    | Success Criteria                    |
| ---- | ----------------------------- | ---------------------------------------- | -------- | ----------------------------------- |
| 5.11 | Performance optimization      | Profile and optimize critical paths      | Core     | Performance metrics met (Section 6) |
| 5.12 | Final E2E testing             | Test all cross-platform combinations     | QA       | All test cases pass                 |
| 5.13 | Security audit                | Review all security-critical code        | Security | Security review complete            |
| 5.14 | App Store / distribution prep | App icons, screenshots, descriptions     | Product  | Ready for distribution              |
| 5.15 | Documentation                 | User guides, developer docs              | Docs     | Documentation complete              |
| 5.16 | Code signing & notarization   | macOS notarization, Windows code signing | DevOps   | Installers install without warnings |

### Deliverables

```
packages/core/src/
├── background/
│   ├── ios.ts                   # iOS background task integration
│   ├── android.ts               # Android foreground service integration
│   ├── desktop.ts               # Desktop background handling
│   └── index.ts
├── accessibility/
│   ├── screenReader.ts          # ARIA labels, accessibility props
│   ├── keyboard.ts              # Keyboard navigation support
│   └── index.ts
├── localization/
│   ├── i18n.ts                  # Localization system
│   ├── locales/                 # Translation files
│   │   ├── en.json
│   │   ├── es.json
│   │   └── ...
│   └── index.ts
└── __tests__/
    ├── background.test.ts
    ├── accessibility.test.ts
    └── database.test.ts
```

### Success Criteria

- [ ] Background transfers work on all platforms
- [ ] Transfers resume after network reconnect
- [ ] WCAG 2.1 AA compliance verified
- [ ] Localization works for all supported languages
- [ ] Database migrations work automatically
- [ ] All performance metrics met (Section 6 of PRD)
- [ ] All reliability metrics met (Section 6 of PRD)
- [ ] All security metrics met (Section 6 of PRD)
- [ ] E2E test suite passes (1000 transfers)
- [ ] Security audit complete
- [ ] Ready for release

### Dependencies

- Phase 4 (Trust & Security) - All security features must be complete
- All previous phases

### Parallelization

- Background transfer tasks can be parallelized by platform
- Accessibility & localization can be done in parallel
- Database tasks can be done in parallel
- Release prep tasks are sequential (depend on others)

### Risk Assessment

| Risk                              | Probability | Impact | Mitigation                                                |
| --------------------------------- | ----------- | ------ | --------------------------------------------------------- |
| iOS background limits             | High        | Medium | Graceful degradation, user notification                   |
| Android foreground service killed | Medium      | Medium | REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, good error messages |
| Localization edge cases           | Medium      | Low    | Test with various languages, RTL                          |
| Database migration issues         | Low         | Medium | Test migrations thoroughly                                |

---

## Dependency Graph

```
┌─────────────┐
│  Phase 0    │  ◄── FOUNDATION
│  Foundation │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Phase 1    │  ◄── CORE INFRASTRUCTURE
│  Core State │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌──────────────────┐
│  Phase 2    │◄────│ Platform Network │
│ Discovery   │     │ (Mobile/Desktop) │
└──────┬──────┘     └──────────────────┘
       │
       ▼
┌─────────────┐     ┌──────────────────┐
│  Phase 3    │◄────│ Platform File I/O│
│ Transfer    │     │ (Mobile/Desktop) │
└──────┬──────┘     └──────────────────┘
       │
       ▼
┌─────────────┐     ┌─────────────────────┐     ┌─────────────┐
│  Phase 4    │◄────│ Platform Crypto     │◄────│ Phase 2     │
│ Trust       │     │ (Mobile/Desktop)    │     │ (Connection)│
└──────┬──────┘     └─────────────────────┘     └─────────────┘
       │
       ▼
┌─────────────┐
│  Phase 5    │  ◄── POLISH & RELEASE
│  Polish     │
└─────────────┘
```

### Key Dependencies Explained

1. **Phase 1 depends on Phase 0**: Need foundation before building state machines
2. **Phase 2 depends on Phase 1**: Need state machines to manage discovery states
3. **Phase 3 depends on Phase 2**: Need connection establishment to transfer files
4. **Phase 4 depends on Phase 2 + Phase 3**: Need working connections and transfers to test security layers
5. **Phase 5 depends on all previous**: Polish phase requires everything else to be complete

### Cross-Phase Dependencies

- **Platform networking (Phase 2)**: Can start **after Phase 0**, parallel with Phase 1
- **Platform file I/O (Phase 3)**: Can start **after Phase 0**, parallel with Phase 1 and Phase 2
- **Platform crypto (Phase 4)**: Can start **after Phase 0**, parallel with Phase 1-3
- **UI (Phase 4)**: Can start **after Phase 0**, parallel with all core logic

---

## Resource Allocation & Team Structure

### Recommended Team Composition

| Role                   | Responsibilities                                    | Skills                                  | FTE         |
| ---------------------- | --------------------------------------------------- | --------------------------------------- | ----------- |
| **Tech Lead**          | Architecture decisions, cross-platform coordination | TypeScript, Rust, React Native, Tauri   | 1.0         |
| **Core Engineer x2**   | Phase 0-1, Core logic in Phases 2-4                 | TypeScript, State Machines, XState      | 2.0         |
| **Mobile Engineer x2** | Platform-specific mobile tasks                      | React Native, Expo, iOS/Android native  | 2.0         |
| **Desktop Engineer**   | Platform-specific desktop tasks                     | Rust, Tauri, React                      | 1.0         |
| **UI Engineer**        | All UI tasks across phases                          | React, Tailwind, uniwind, Accessibility | 1.0         |
| **QA Engineer**        | Testing infrastructure, E2E tests                   | Testing frameworks, automation          | 1.0         |
| **DevOps**             | CI/CD, build pipelines, deployment                  | TurboRepo, GitHub Actions               | 0.5         |
| **Total**              |                                                     |                                         | **9.5 FTE** |

### Minimum Viable Team (MVP)

If resources are limited, this is the **minimum team** to ship MVP:

| Role                                       | Responsibilities                         | FTE         |
| ------------------------------------------ | ---------------------------------------- | ----------- |
| **Tech Lead (also Core Engineer)**         | Architecture, Core logic, State machines | 1.0         |
| **Full-Stack Engineer (Mobile + Desktop)** | Platform-specific tasks for both         | 1.5         |
| **UI Engineer**                            | All UI tasks                             | 1.0         |
| **QA/DevOps**                              | Testing + DevOps                         | 0.5         |
| **Total**                                  |                                          | **4.0 FTE** |

_Note: This assumes some cross-platform expertise and may extend the timeline._

---

## Testing Strategy

### Testing Pyramid

```
          ┌─────────────┐
          │   E2E Tests │  ◄── ~100 tests (cross-platform combinations)
          └──────┬──────┘
                 │
          ┌──────▼──────┐
          │ Integration │  ◄── ~500 tests (component interactions)
          └──────┬──────┘
                 │
          ┌──────▼──────┐
          │  Unit Tests │  ◄── ~1000+ tests (individual functions, state transitions)
          └─────────────┘
```

### Test Coverage Targets

| Layer             | Target Coverage         | Tools                            |
| ----------------- | ----------------------- | -------------------------------- |
| Unit Tests        | ≥ 90%                   | Vitest/Jest                      |
| Integration Tests | ≥ 80%                   | Vitest/Jest                      |
| E2E Tests         | All critical user flows | Playwright (web), Detox (native) |

### Critical Test Cases

#### Discovery Tests

- [ ] Devices discover each other via UDP multicast
- [ ] mDNS discovery works across subnets
- [ ] Manual IP entry works
- [ ] Heartbeat timeouts work correctly
- [ ] Interface selection logic works
- [ ] Excluded interfaces (VPN, loopback) are ignored

#### Transfer Tests

- [ ] File transfer works for small files (<4MB)
- [ ] File transfer works for large files (>100MB)
- [ ] Chunked transfer works correctly
- [ ] Resume works after interruption
- [ ] Hash verification catches corruption
- [ ] Progress tracking is accurate
- [ ] Concurrent transfer limit enforced
- [ ] Clipboard transfer works for all content types
- [ ] Large folder transfer works with batched manifests
- [ ] Partial failure modes handled correctly

#### Security Tests

- [ ] TLS+TOFU trust model works
- [ ] First-time trust prompt appears
- [ ] Subsequent connections auto-trust
- [ ] Certificate regeneration handled
- [ ] QR+ECDH handshake establishes secure channel
- [ ] Transfers are encrypted
- [ ] Long-term trust persists
- [ ] Fallback to TLS+TOFU works
- [ ] Quick Save rate limiting enforced
- [ ] MITM protection works
- [ ] Replay attack prevention works

#### Background Transfer Tests

- [ ] iOS: Transfers continue when backgrounded (30 min)
- [ ] Android: Transfers continue with foreground service
- [ ] Desktop: Transfers continue when minimized
- [ ] Auto-resume on network reconnect works

#### Accessibility Tests

- [ ] Screen reader support works
- [ ] Keyboard navigation works (desktop)
- [ ] Color contrast meets WCAG 2.1 AA
- [ ] Font scaling works
- [ ] Reduced motion respected

### Test Environments

| Platform | Test Environment        | Tools                                  |
| -------- | ----------------------- | -------------------------------------- |
| Web      | Chrome, Firefox, Safari | Playwright, Vitest                     |
| iOS      | Simulator, Real devices | Detox, Jest                            |
| Android  | Emulator, Real devices  | Detox, Jest                            |
| macOS    | Native app              | WebdriverIO (via tauri-driver), Vitest |
| Windows  | Native app              | WebdriverIO (via tauri-driver), Vitest |
| Linux    | Native app              | WebdriverIO (via tauri-driver), Vitest |

---

## Risk Register

### High-Priority Risks

| ID  | Risk                             | Probability | Impact   | Phase   | Owner          | Mitigation                                    | Status  |
| --- | -------------------------------- | ----------- | -------- | ------- | -------------- | --------------------------------------------- | ------- |
| R1  | State machine complexity         | High        | High     | Phase 1 | Core           | Design with diagrams, extensive testing       | Monitor |
| R2  | Platform networking library bugs | High        | High     | Phase 2 | Mobile/Desktop | Extensive testing, fallback mechanisms        | Monitor |
| R3  | Memory management on mobile      | High        | High     | Phase 3 | Core/Mobile    | Careful chunk buffering, direct-to-disk       | Monitor |
| R4  | Crypto implementation bugs       | Medium      | Critical | Phase 4 | Core           | Use well-audited libraries, extensive testing | Monitor |
| R5  | Key management vulnerabilities   | Medium      | Critical | Phase 4 | Core           | Platform-native secure storage                | Monitor |
| R6  | iOS background transfer limits   | High        | Medium   | Phase 5 | Mobile         | Graceful degradation, user notification       | Monitor |

### Medium-Priority Risks

| ID  | Risk                                    | Probability | Impact | Phase   | Owner   | Mitigation                           |
| --- | --------------------------------------- | ----------- | ------ | ------- | ------- | ------------------------------------ |
| R7  | mDNS implementation differences         | High        | High   | Phase 2 | Core    | Abstract behind common interface     |
| R8  | Firewall/permission issues              | Medium      | High   | Phase 2 | Desktop | Good error messages, manual fallback |
| R9  | Disk I/O errors                         | Medium      | High   | Phase 3 | Core    | Good error handling, retry logic     |
| R10 | Resume state corruption                 | Medium      | High   | Phase 3 | Core    | Atomic writes, checksums             |
| R11 | Concurrent transfer resource contention | Medium      | Medium | Phase 3 | Core    | Proper queue management              |
| R12 | User confusion about security           | High        | Medium | Phase 4 | UI      | Clear UI, good documentation         |
| R13 | Android foreground service killed       | Medium      | Medium | Phase 5 | Mobile  | Battery optimization exclusion       |

### Low-Priority Risks

| ID  | Risk                              | Probability | Impact | Phase   | Owner  | Mitigation                   |
| --- | --------------------------------- | ----------- | ------ | ------- | ------ | ---------------------------- |
| R14 | UDP multicast blocked on networks | Medium      | Low    | Phase 2 | Core   | mDNS and manual IP fallbacks |
| R15 | QR code scanning accuracy         | Low         | Medium | Phase 4 | Mobile | Good scanning library        |
| R16 | Localization edge cases           | Medium      | Low    | Phase 5 | UI     | Test with various languages  |
| R17 | Database migration issues         | Low         | Medium | Phase 5 | Core   | Test migrations thoroughly   |
| R18 | Performance issues                | Medium      | Low    | Phase 5 | Core   | Profile and optimize         |

---

## Communication Plan

### Regular Meetings

| Meeting             | Frequency | Attendees                  | Purpose                        |
| ------------------- | --------- | -------------------------- | ------------------------------ |
| Daily Standup       | Daily     | All engineers              | Progress updates, blockers     |
| Architecture Review | Weekly    | Tech Lead, Core Engineers  | Design decisions, code reviews |
| Platform Sync       | Weekly    | Mobile Team + Desktop Team | Platform-specific issues       |
| QA Sync             | Weekly    | QA + Tech Lead             | Testing status, issues         |
| Demo                | Bi-weekly | All                        | Show progress to stakeholders  |

### Reporting

| Report        | Frequency         | Audience         | Content                                |
| ------------- | ----------------- | ---------------- | -------------------------------------- |
| Weekly Status | Weekly            | All stakeholders | Progress, risks, upcoming work         |
| Sprint Review | End of each phase | All              | Phase completion status, demos         |
| Risk Report   | Weekly            | Management       | High-priority risks, mitigation status |

---

## Monitoring & Metrics

### Development Metrics

| Metric             | Target                            | Measurement    |
| ------------------ | --------------------------------- | -------------- |
| Code Coverage      | ≥ 90% (unit), ≥ 80% (integration) | Jest/Vitest    |
| Build Success Rate | 100%                              | CI/CD pipeline |
| Test Pass Rate     | 100%                              | CI/CD pipeline |
| PR Review Time     | < 24 hours                        | GitHub metrics |
| Cycle Time         | < 3 days                          | GitHub metrics |

### Runtime Metrics

See **Section 6 of PRD** for performance, reliability, and security metrics.

---

## Appendix A: File Structure (Target)

```
pairsync/
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── main.tsx
│   │   │   ├── routes/
│   │   │   │   ├── index.tsx
│   │   │   │   └── __root.tsx
│   │   │   └── ...
│   │   ├── src-tauri/
│   │   │   ├── plugins/
│   │   │   │   ├── pairsync-udp/
│   │   │   │   └── pairsync-mdns/
│   │   │   └── ...
│   │   └── package.json
│   └── native/
│       ├── app/
│       │   ├── (drawer)/
│       │   └── ...
│       └── package.json
├── packages/
│   ├── config/
│   │   └── src/
│   │       └── tsconfig.base.json
│   ├── core/
│   │   └── src/
│   │       ├── state/
│   │       │   ├── machines/
│   │       │   └── actors/
│   │       ├── protocol/
│   │       │   └── messages/
│   │       ├── discovery/
│   │       ├── transfer/
│   │       ├── security/
│   │       │   ├── tls/
│   │       │   ├── ecdh/
│   │       │   ├── qr/
│   │       │   └── trust/
│   │       ├── background/
│   │       ├── accessibility/
│   │       ├── localization/
│   │       ├── database/
│   │       ├── network/
│   │       ├── platform/
│   │       │   ├── mobile/
│   │       │   └── desktop/
│   │       ├── file/
│   │       ├── types/
│   │       ├── constants/
│   │       ├── utils/
│   │       └── __tests__/
│   ├── env/
│   │   └── src/
│   │       └── index.ts
│   └── ui/
│       └── src/
│           ├── components/
│           │   └── security/
│           ├── hooks/
│           ├── lib/
│           └── styles/
├── package.json
├── turbo.json
├── PairSync Product Requirements.md
└── IMPLEMENTATION_PLAN.md
```

---

## Appendix B: Glossary

See **PRD Section 8.1** for glossary of terms.

---

## Appendix C: References

- [PairSync PRD v3.0](PairSync Product Requirements.md)
- [TurboRepo Documentation](https://turbo.build/repo)
- [Tauri Documentation](https://v2.tauri.app/)
- [Expo Documentation](https://docs.expo.dev/)
- [XState Documentation](https://xstate.js.org/)
- [Zustand Documentation](https://github.com/pmndrs/zustand)
