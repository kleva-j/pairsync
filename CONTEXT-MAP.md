# PairSync Context Map

This is the root context map for the **PairSync** monorepo. Each context below defines a bounded domain with its own `CONTEXT.md` file containing domain language, architecture decisions, and context-specific knowledge.

## Contexts

### Apps

#### web
- **Location:** `apps/web/`
- **CONTEXT.md:** `apps/web/CONTEXT.md`
- **Domain:** Desktop web application (Tauri + React + TanStack Router)
- **Responsibilities:**
  - Desktop browser UI for PairSync
  - Tauri native desktop integration
  - File system access on desktop
  - Desktop-specific networking (via Tauri Rust plugins)
  - Clipboard integration on desktop

#### native
- **Location:** `apps/native/`
- **CONTEXT.md:** `apps/native/CONTEXT.md`
- **Domain:** Mobile application (React Native + Expo)
- **Responsibilities:**
  - Mobile UI for PairSync (iOS & Android)
  - Expo Router navigation
  - Mobile-specific permissions (LocalNetwork, Background Modes)
  - Mobile-specific networking (react-native-udp, react-native-mdns)
  - Mobile clipboard integration
  - Camera access for QR code scanning

### Packages

#### core
- **Location:** `packages/core/`
- **CONTEXT.md:** `packages/core/CONTEXT.md`
- **Domain:** Shared domain logic, state machines, and protocols
- **Status:** ✅ Phase 0.6 + 1.1 + 1.5 + 1.6 + 1.7 implemented — shared types, constants, platform utils, the three XState machines, shared protocol constants, heartbeat protocol logic, and interface selection, all tested (nothing imports it yet)
- **Responsibilities:**
  - Shared types (device/transfer/protocol), constants (timeouts/sizes), platform utils — ✅ implemented + tested (Phase 0.6)
  - Core state machines (XState) for device, discovery, transfer states — ✅ implemented + tested (Phase 1.1)
  - Protocol constants (version, ports, HTTP headers, message types) — ✅ implemented + tested (Phase 1.5); message schemas — planned
  - Heartbeat protocol logic (build/parse datagrams, missed-heartbeat expiry, tracker) — ✅ implemented + tested (Phase 1.6)
  - Interface selection (RFC1918/ULA/link-local locality, Wi-Fi/Ethernet priority ranking, VPN/loopback filtering, backoff) — ✅ implemented + tested (Phase 1.7)
  - Discovery logic (UDP multicast, mDNS, manual IP) — planned (Phase 2)
  - Transfer engine (chunked streaming, resume, verification) — planned (Phase 3)
  - Security (TLS+TOFU, QR+ECDH handshake, encryption) — planned (Phase 4)

#### ui
- **Location:** `packages/ui/`
- **CONTEXT.md:** `packages/ui/CONTEXT.md`
- **Domain:** Shared web UI components and design tokens (consumed by `apps/web` only for now)
- **Responsibilities:**
  - Shared shadcn/ui components (web)
  - Design tokens and global styles (Tailwind v4 / oklch)
  - App-specific web components (bubble, message, attachment, …)
  - Security UI components (TrustPrompt, QRDisplay, etc.) — planned (Phase 4)
  - Accessibility utilities — planned (Phase 5)

#### env
- **Location:** `packages/env/`
- **CONTEXT.md:** `packages/env/CONTEXT.md`
- **Domain:** Environment variable validation
- **Status:** Declared in web/native/root manifests; imported by no code yet
- **Responsibilities:**
  - Validated env schemas for web (`VITE_SERVER_URL` via `@pairsync/env/web`) and native (`EXPO_PUBLIC_SERVER_URL` via `@pairsync/env/native`)
  - Platform detection, feature flags, and shared constants are **not** in this package — planned for `packages/core` (Phases 1–2)

#### config
- **Location:** `packages/config/`
- **CONTEXT.md:** `packages/config/CONTEXT.md`
- **Domain:** Shared TypeScript and build configuration
- **Responsibilities:**
  - Shared TypeScript configuration (tsconfig.base.json)
  - Build pipeline configuration
  - Monorepo tooling configuration

---

## Architecture Decision Records (ADRs)

Root-level ADRs that apply to the entire monorepo are stored in `docs/adr/`. Context-specific ADRs should be stored in each context's own `docs/adr/` directory.

## Cross-Context Dependencies

```
┌─────────────────────────────────────────────────────────┐
│                    CONTEXT-MAP.md                       │
│  (Root - Defines overall architecture)                  │
└────────────────────┬────────────────────────────────────┘
                     │
    ┌────────────────┴───────────────┐
    │                                │
┌───▼──┐                          ┌──▼──┐
│ core │                          │  ui │
│      │                          │     │
└──┬───┘                          └──┬──┘
   │                                 │
   │                 ┌───────────────┴────────────┐
   │                 │                            │
┌──▼───┐          ┌──▼───┐                    ┌───▼──┐
│ web  │          │native│                    │ env  │
│      │          │      │                    │      │
└──────┘          └──────┘                    └──────┘
                                        │
                                    ┌───▼──┐
                                    │config│
                                    │      │
                                    └──────┘
```

The diagram shows the **target** architecture. Current dependency reality:

- **core** holds implemented shared types/constants/utils but nothing imports `@pairsync/core` yet (consumers land in Phase 1)
- **ui** is consumed by `apps/web` only (native uses `uniwind` + `heroui-native`)
- **env** is declared in web/native/root manifests but imported by no code yet
- **config** has no runtime exports — it only ships `tsconfig.base.json`
- **web** and **native** are independent app targets

## Consumer Rules

When operating in this codebase:

1. **Always start here** — Read `CONTEXT-MAP.md` first to understand the structure
2. **Follow the domain** — Read the relevant context's `CONTEXT.md` before making changes
3. **Check ADRs** — Review Architecture Decision Records for rationale
4. **Respect boundaries** — Don't cross context boundaries without coordination
5. **Core first** — Changes to `packages/core` may affect all apps

## Quick Reference

| When working on... | Start with... | Then read... |
|-------------------|--------------|---------------|
| Discovery protocol | CONTEXT-MAP.md | packages/core/CONTEXT.md |
| File transfer logic | CONTEXT-MAP.md | packages/core/CONTEXT.md |
| Web UI | CONTEXT-MAP.md | apps/web/CONTEXT.md, packages/ui/CONTEXT.md |
| Mobile UI | CONTEXT-MAP.md | apps/native/CONTEXT.md, packages/ui/CONTEXT.md |
| Security/encryption | CONTEXT-MAP.md | packages/core/CONTEXT.md |
| Shared components | CONTEXT-MAP.md | packages/ui/CONTEXT.md |
| Environment setup | CONTEXT-MAP.md | packages/env/CONTEXT.md |
| TypeScript tooling | CONTEXT-MAP.md | packages/config/CONTEXT.md |
| Build configuration | CONTEXT-MAP.md | packages/config/CONTEXT.md |
