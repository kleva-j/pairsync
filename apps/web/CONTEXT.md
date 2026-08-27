# Web App Context

**Context:** `apps/web/`  
**Domain:** Desktop web application for PairSync  
**Part of:** PairSync Monorepo (see `CONTEXT-MAP.md`)

---

## Purpose

The **web** app provides the **desktop browser and Tauri desktop application** interface for PairSync. It enables users to discover devices, send/receive files, and manage transfers on desktop platforms (macOS, Windows, Linux).

## Domain Language

| Term                | Definition                                              | Example                          |
| ------------------- | ------------------------------------------------------- | -------------------------------- |
| **Tauri App**       | The native desktop application built with Tauri + React | `pairsync` desktop binary        |
| **Web UI**          | The browser-based interface (also used within Tauri)    | React + TanStack Router          |
| **Desktop Target**  | The compiled Tauri application for desktop OS           | `.app` (macOS), `.exe` (Windows) |
| **Rust Bridge**     | Tauri Rust plugins that provide native capabilities     | UDP/mDNS networking, file system |
| **Port Forwarding** | Exposing local ports for cross-platform communication   | Ports 53350-53360                |

## Architecture

```
apps/web/
├── src/                    # React source code
│   ├── main.tsx           # App entry point
│   ├── routes/            # TanStack Router file-based routes
│   │   ├── index.tsx      # Home page
│   │   └── __root.tsx     # Root layout
│   └── components/        # App-specific components
├── src-tauri/             # Tauri desktop integration
│   ├── plugins/           # Custom Tauri Rust plugins
│   │   ├── pairsync-udp/  # UDP multicast for desktop
│   │   ├── pairsync-mdns/ # mDNS for desktop
│   │   └── pairsync-tcp/  # TCP client for desktop
│   ├── main.rs            # Tauri entry point
│   └── tauri.conf.json   # Tauri configuration
├── index.html             # HTML entry point
├── vite.config.ts          # Vite bundler configuration
└── components.json        # shadcn/ui configuration

> Note: `src-tauri/plugins/pairsync-udp/`, `src-tauri/plugins/pairsync-mdns/`, and `src-tauri/plugins/pairsync-tcp/` ship as of Phase 2.5 (N-252). The TypeScript adapters that drive them live in `src/platform/` (`createTauriPlatformNetwork()` → core's `PlatformNetworkAdapter`).
```

## Key Responsibilities

1. **User Interface**
   - Device discovery UI (device list, status indicators)
   - File transfer UI (send/receive flows, progress bars)
   - Trust management UI (trust prompts, trusted devices list)
   - QR code pairing UI (display, scanner, manual entry)
   - Settings UI (Quick Save toggle, network config)

2. **Platform Integration**
   - Tauri desktop app lifecycle management
   - Native file system access via Tauri APIs
   - Desktop clipboard access
   - Native QR code scanning (via camera or manual entry)
   - Firewall exception management

3. **Networking**
   - UDP multicast discovery (via Rust plugin)
   - mDNS discovery (via Rust plugin)
   - TCP connection management
   - TLS encryption (via Rust plugin)

4. **Shared Dependencies**
   - Consumes `packages/ui` for shared components
   - Consumes `packages/env` for environment schemas
   - Consumes `@pairsync/core` (domain logic) since Phase 2.5

## External Dependencies

| Dependency               | Purpose                                                    | Critical |
| ------------------------ | ---------------------------------------------------------- | -------- |
| `@tanstack/react-router` | File-based routing with type safety                        | ✅ Yes   |
| `react` / `react-dom`    | UI library                                                 | ✅ Yes   |
| `vite`                   | Build tool (dev)                                           | ✅ Yes   |
| `tailwindcss`            | Styling                                                    | ✅ Yes   |
| `tauri`                  | Desktop app framework (Rust dep in `src-tauri/Cargo.toml`) | ✅ Yes   |
| `@pairsync/env`          | Environment schemas                                        | ✅ Yes   |
| `@pairsync/ui`           | Shared components                                          | ✅ Yes   |
| `@pairsync/core`         | Domain logic (Phase 2.5+)                                  | ✅ Yes   |
| `@tauri-apps/api`        | Tauri IPC for platform adapters                            | ✅ Yes   |

## Platform-Specific Notes

### macOS

- Firewall exception auto-requested on first launch
- Requires admin password for firewall changes
- Background transfers limited by OS restrictions

### Windows

- Firewall exception auto-requested on first launch
- May require UAC prompt for firewall changes
- Tauri builds produce `.exe` installer

### Linux

- No auto-firewall exception (user must allow ports manually)
- Tauri builds produce `.AppImage` or `.deb` packages

## Cross-Cutting Concerns

### Security

- All transfers are encrypted (TLS 1.3 or AES-256-GCM)
- Trust On First Use (TOFU) model for certificate verification
- QR+ECDH handshake for primary trust establishment
- Certificate storage in encrypted config file (`~/.pairsync/keys/`)

### Performance

- Chunked file transfers (4MB chunks) to limit memory usage
- Direct-to-disk writing (never loads full file in memory)
- Background transfers continue when app is minimized

### Accessibility

- WCAG 2.1 AA compliance
- Keyboard navigation support
- Screen reader compatible
- Respects `prefers-reduced-motion`

## Build & Run

- `pnpm dev:web` (root) — start the Vite dev server (also used by `tauri dev` via `beforeDevCommand`)
- `pnpm build` (root, via turbo) — runs `vite build` → `dist/` (the Tauri `frontendDist`)
- `pnpm build:desktop` (root) — runs `tauri build` (vite build + Rust release compile + platform bundles; verified locally on macOS; CI runs it in the `desktop-build` job on Ubuntu with webkit2gtk system deps)

## Common Tasks

| Task             | Location                    | Notes                                  |
| ---------------- | --------------------------- | -------------------------------------- |
| Add new page     | `src/routes/`               | Use TanStack Router file-based routing |
| Add Tauri plugin | `src-tauri/plugins/`        | Rust implementation                    |
| Configure build  | `vite.config.ts`            | Vite-specific config                   |
| Configure Tauri  | `src-tauri/tauri.conf.json` | Tauri-specific config                  |

## ADRs

Context-specific ADRs are stored in `apps/web/docs/adr/`. Root-level ADRs in `docs/adr/` apply to the entire monorepo.

---

**For more information:** See `CONTEXT-MAP.md` at the repo root for the full monorepo structure.
