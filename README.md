# PairSync

**PairSync** is an open-source, cross-platform, peer-to-peer (P2P) file and clipboard sharing solution that enables secure transfers between devices on the same local network without relying on internet connectivity or external cloud servers.

## 🎯 Overview

PairSync provides:
- **Zero Configuration**: No accounts, no cloud setups, works out-of-the-box on any local network
- **High Performance**: Operates at ≥80% of physical local network bandwidth capacity
- **End-to-End Security**: Local encryption (TLS 1.3) with Trust On First Use (TOFU) — planned (Phase 4)
- **True Cross-Platform**: Uniform experience across Mobile (iOS/Android) and Desktop (macOS/Windows/Linux)

## 🏗️ Architecture

PairSync is built as a **Turborepo monorepo** with shared TypeScript packages and platform-specific applications:

```text
pairsync/
├── apps/
│   ├── web/         # Desktop web application (React + TanStack Router + Tauri)
│   └── native/      # Mobile application (React Native + Expo Router)
├── packages/
│   ├── core/        # Shared domain logic, state machines, and protocols
│   ├── ui/          # Shared web UI components (shadcn/ui primitives)
│   ├── env/         # Environment variable validation
│   └── config/      # Shared TypeScript and build configuration
```

## 🚀 Current Implementation Status

### ✅ Completed (Phase 0 - Foundation & Phase 1 - Core Infrastructure)

**packages/core/** - Shared domain logic and protocols:
- ✅ Shared types (device, transfer, protocol schemas)
- ✅ Constants (timeouts, sizes, protocol version)
- ✅ Platform utilities for cross-platform compatibility
- ✅ XState state machines for device, discovery, and transfer states
- ✅ Protocol constants (version, ports, HTTP headers, message types)
- ✅ Wire-message schemas (zod: prepare/chunk/resume + discriminated union)
- ✅ Heartbeat protocol logic (datagram building/parsing, missed-heartbeat expiry)
- ✅ Network interface selection (RFC1918/ULA/link-local locality, Wi-Fi/Ethernet priority)
- ✅ Comprehensive unit tests (127 passing tests)

**Build & Testing Infrastructure:**
- ✅ Turborepo pipeline with dependency-aware task scheduling
- ✅ TypeScript strict mode across all packages
- ✅ Vitest unit testing for core packages
- ✅ CI/CD pipeline with type checking, testing, and build validation
- ✅ Desktop Tauri build configuration

### 📋 Planned (Phases 2-5)

**Phase 2 - Discovery & Connect:**
- ⏳ UDP multicast discovery protocol
- ⏳ mDNS integration for automatic device discovery
- ⏳ Manual IP fallback mechanism

**Phase 3 - Transfer Engine:**
- Chunked file streaming (4MB chunks)
- Resume capability for interrupted transfers
- Transfer verification and integrity checking

**Phase 4 - Trust & Security:**
- QR code generation and scanning for device pairing
- ECDH (X25519) key exchange
- TLS 1.3 implementation with TOFU trust model
- Security UI components (trust prompts, device management)

**Phase 5 - Polish & Release:**
- Background transfer support
- Accessibility compliance (WCAG 2.1 AA)
- Localization (i18n)
- Performance optimization

## 🛠️ Technology Stack

| Layer | Technology | Status |
|-------|-----------|--------|
| **Monorepo** | Turborepo + pnpm | ✅ Configured |
| **Shared Core** | TypeScript (Strict) + XState | ✅ Implemented |
| **Mobile UI** | React Native 0.86 + Expo SDK 57 + Expo Router | ✅ Skeleton exists |
| **Desktop UI** | Tauri 2.x + React 19 + Vite + TailwindCSS v4 | ✅ Skeleton exists |
| **Mobile Networking** | react-native-udp, react-native-mdns | ⏳ Planned |
| **Desktop Networking** | Tauri Rust plugins (socket2/tokio, mdns) | ⏳ Planned |
| **Crypto (Mobile)** | react-native-quick-crypto (X25519, SHA-256, HKDF) | ✅ Installed (spike-verified) |
| **Crypto (Desktop)** | x25519-dalek, hkdf, aes-gcm, rustls | ⏳ Planned |
| **State Management** | XState | ✅ Core implemented |
| **Storage** | SQLite (expo-sqlite / rusqlite) | ⏳ Planned |

## 📦 Getting Started

### Prerequisites

- **Node.js** `^20.19.0 || >=22.12.0` (required by Vite 8; CI runs Node 22) 
- **pnpm** 11.x (package manager)
- **Expo CLI** (for mobile development)
- **Rust** and **Cargo** (for Tauri desktop builds)
- **Xcode** (for iOS development, macOS only)
- **Android Studio** (for Android development)

### Installation

```bash
# Install dependencies
pnpm install
```

### Development

```bash
# Start all applications in development mode
pnpm run dev

# Start only the web application
pnpm run dev:web

# Start only the mobile application
pnpm run dev:native
```

### Building

```bash
# Build all applications
pnpm run build

# Build desktop application only
pnpm run build:desktop
```

### Testing

```bash
# Run all tests
pnpm run test

# Type checking across all packages
pnpm run check-types
```

## 🧪 Testing

The project uses a comprehensive testing strategy:

- **Unit Tests**: Vitest for `packages/core`, `packages/env`, and `apps/web`; Jest for `apps/native`
- **Type Checking**: TypeScript strict mode with `tsc --noEmit`
- **CI/CD**: GitHub Actions running on every PR (typecheck, JS unit tests, native jest tests, build, Tauri desktop build)

Test coverage is currently focused on the core package with 127 passing unit tests covering types, constants, utilities, protocol schemas, state machines, heartbeat/network logic, and interface selection.

## 📚 Documentation

- **[Product Requirements](./PairSync%20Product%20Requirements.md)** - Complete PRD with feature specifications
- **[Implementation Plan](./IMPLEMENTATION_PLAN.md)** - Detailed phase-by-phase implementation roadmap
- **[Context Map](./CONTEXT-MAP.md)** - Architecture overview and domain boundaries
- **[Agent Instructions](./AGENTS.md)** - AI agent development guidelines
- **[Agent Domain Docs](./docs/agents/)** - Domain model, issue tracking, and triage conventions
- **[State Machines](./docs/state-machines.md)** - XState machine documentation

## 🤝 Contributing

PairSync uses Linear for issue tracking. All development work is tracked in the 'kleva-portfolio' team under the 'PairSync' project.

For detailed contribution guidelines, see `.github/CONTRIBUTING.md`.

## 📄 License

MIT

## 🙏 Acknowledgments

This project was initially scaffolded using [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack combining React, TanStack Router, and more.
