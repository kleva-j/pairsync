# Native App Context

**Context:** `apps/native/`  
**Domain:** Mobile application for PairSync  
**Part of:** PairSync Monorepo (see `CONTEXT-MAP.md`)

---

## Purpose

The **native** app provides the **iOS and Android mobile application** interface for PairSync. It enables users to discover devices, send/receive files, and manage transfers on mobile platforms using React Native + Expo.

## Domain Language

| Term | Definition | Example |
|------|------------|---------|
| **Expo** | React Native development platform | Expo Go app |
| **Expo Router** | File-based routing for React Native | `app/(drawer)/index.tsx` |
| **Mobile Target** | iOS and Android native applications | `.ipa` (iOS), `.apk` (Android) |
| **Native Modules** | Platform-specific native code bridges | react-native-udp, react-native-mdns |
| **Battery Optimization** | Preventing OS from killing background tasks | REQUEST_IGNORE_BATTERY_OPTIMIZATIONS |

## Architecture

```
apps/native/
├── app/                      # Expo Router file-based routes
│   ├── (drawer)/             # Drawer navigation layout
│   │   └── index.tsx        # Main drawer screen
│   ├── (drawer)/(tabs)/       # Tab navigation
│   │   ├── index.tsx         # Tab 1
│   │   └── two.tsx           # Tab 2
│   ├── _layout.tsx           # Root layout
│   └── +not-found.tsx        # 404 page
├── components/               # Reusable mobile components
├── contexts/                 # React contexts
├── assets/                   # Static assets (images, fonts)
├── app.json                  # Expo configuration
├── metro.config.js           # Metro bundler configuration
└── package.json              # Dependencies and scripts
```

## Key Responsibilities

1. **User Interface**
   - Device discovery UI optimized for mobile
   - File transfer UI with mobile-specific considerations
   - Trust management UI (trust prompts, device list)
   - QR code pairing UI (scanner, display, expiry timer)
   - Settings UI (Quick Save, permissions management)

2. **Platform Integration**
   - iOS LocalNetwork permission handling
   - Android INTERNET and FOREGROUND_SERVICE permissions
   - Battery optimization exclusions
   - Camera access for QR code scanning
   - Native clipboard access

3. **Networking**
   - UDP multicast discovery (react-native-udp — planned)
   - mDNS discovery (react-native-mdns — planned)
   - TCP connection management
   - Crypto for secure channel (react-native-quick-crypto: X25519, HKDF, AES-256-GCM — spike-verified)

4. **Background Operations**
   - iOS: BackgroundTasks + BGTaskScheduler (30 min limit)
   - Android: Foreground Service with persistent notification
   - Auto-resume on network reconnect

5. **Shared Dependencies**
   - Consumes `packages/env` for environment schemas
   - `packages/ui` (shared components) and `packages/core` (domain logic) are **planned** for later phases — not yet dependencies of `apps/native`

## External Dependencies

| Dependency | Purpose | Installed |
|------------|---------|-----------|
| `expo` | React Native development platform | ✅ |
| `expo-router` | File-based routing | ✅ |
| `react-native` | Native mobile framework | ✅ |
| `@pairsync/env` | Environment schemas | ✅ |
| `react-native-quick-crypto` | Crypto: X25519, HKDF, AES-256-GCM (spike-verified) | ✅ |
| `uniwind` | Tailwind-style styling | ✅ |
| `heroui-native` | UI primitives | ✅ |
| `expo-network` | Network info | ✅ |
| `expo-secure-store` | Secure key-value storage | ✅ |

**Planned (not yet installed, Phase 2+ of `IMPLEMENTATION_PLAN.md`):** `react-native-udp`, `react-native-zeroconf`, `expo-file-system`, `expo-sqlite`, `react-native-qrcode-svg`, `react-native-vision-camera`, `@pairsync/core`, `@pairsync/ui`.

## Platform-Specific Notes

### iOS
- **Minimum Version:** iOS 15+
- **Required Permissions:** LocalNetwork, Background Modes (Background Fetch)
- **Background Limits:** Transfers limited to ~30 minutes when backgrounded
- **Graceful Degradation:** Shows notification when background limits reached
- **Keychain Storage:** TLS certificates and private keys stored in iOS Keychain

### Android
- **Minimum Version:** Android 8.0+ (Oreo)
- **Required Permissions:** INTERNET, FOREGROUND_SERVICE, REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
- **Background Service:** Foreground Service required for background transfers
- **Keystore Storage:** TLS certificates and private keys stored in Android Keystore

## Cross-Cutting Concerns

### Security
- TLS 1.3 with self-signed certificates
- TOFU (Trust On First Use) model
- QR+ECDH handshake for primary trust
- Certificate regeneration every 30 days
- OS-native secure storage (Keychain/Keystore)

### Performance
- Chunked file transfers (4MB chunks)
- Direct-to-disk writing on mobile
- Max 50MB in-memory buffer (2 chunks)
- Batched manifest generation for large folders

### Memory Constraints
- **Mobile RAM Limit:** ≤50MB buffer for transfers
- **Chunk Size:** 4MB (configurable)
- **Concurrent Transfers:** Max 4 (configurable)

## Build & Run

- `pnpm dev:native` (root) — start the Expo dev server
- `pnpm build` (root, via turbo) — runs `expo export --platform all`, exporting iOS/Android Hermes bundles + web static files to `dist/`
- `pnpm test` (root) — runs test suites per package: vitest (core/env/web) and jest + jest-expo (native)
- CI splits the suites into separate jobs: `test` runs the JS suites (`turbo run test --filter '!native'`), `native-test` runs jest (`turbo run test --filter native`)

## Common Tasks

| Task | Location | Notes |
|------|----------|-------|
| Add new screen | `app/` | Use Expo Router file-based routing |
| Add native module | `app.json` | Configure in Expo config |
| Handle permissions | Platform-specific code | iOS/Android differences |
| Configure Metro | `metro.config.js` | Bundler configuration |

## ADRs

Context-specific ADRs are stored in `apps/native/docs/adr/`. Root-level ADRs in `docs/adr/` apply to the entire monorepo.

---

**For more information:** See `CONTEXT-MAP.md` at the repo root for the full monorepo structure.
