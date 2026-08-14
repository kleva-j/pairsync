# Domain Documentation Layout

**Layout:** Multi-context (Monorepo)  
**Root File:** `CONTEXT-MAP.md`

## Consumer Rules

Agents operating in this codebase must follow these rules when reading domain documentation:

1. **Start at the map**: Always begin with `CONTEXT-MAP.md` at the repo root to understand the domain structure
2. **Follow the pointers**: The map points to per-context `CONTEXT.md` files — read the relevant one for your task
3. **Check ADRs**: Architecture Decision Records in `docs/adr/` contain rationale for key decisions
4. **Respect the boundaries**: Each context's `CONTEXT.md` defines its domain — don't cross context boundaries without explicit coordination

## Monorepo Structure

This is a **Turborepo monorepo** with the following contexts:

```
pairsync/
├── apps/
│   ├── web/          # Desktop web app (React + TanStack Router + Tauri)
│   └── native/       # Mobile app (React Native + Expo)
└── packages/
    ├── config/       # Shared TypeScript configuration
    ├── core/         # Shared domain logic, state machines, protocols
    ├── env/          # Shared environment utilities
    └── ui/           # Shared UI components (shadcn/ui)
```

## File Locations

| Context | CONTEXT.md Location | ADR Location |
|---------|---------------------|---------------|
| Root | `CONTEXT-MAP.md` | `docs/adr/` |
| Web App | `apps/web/CONTEXT.md` | `apps/web/docs/adr/` |
| Native App | `apps/native/CONTEXT.md` | `apps/native/docs/adr/` |
| Core Package | `packages/core/CONTEXT.md` | `packages/core/docs/adr/` |
| UI Package | `packages/ui/CONTEXT.md` | `packages/ui/docs/adr/` |
| Env Package | `packages/env/CONTEXT.md` | `packages/env/docs/adr/` |
| Config Package | `packages/config/CONTEXT.md` | `packages/config/docs/adr/` |

## CONTEXT-MAP.md Format

The root `CONTEXT-MAP.md` should contain:

```markdown
# PairSync Context Map

## Contexts

### Apps
- **web**: Desktop web application (Tauri + React)
  - CONTEXT.md: apps/web/CONTEXT.md
  - Domain: Desktop file transfer UI, Tauri integration

- **native**: Mobile application (React Native + Expo)
  - CONTEXT.md: apps/native/CONTEXT.md
  - Domain: Mobile file transfer UI, device discovery

### Packages
- **core**: Shared domain logic
  - CONTEXT.md: packages/core/CONTEXT.md
  - Domain: State machines, protocol, transfer engine, security

- **ui**: Shared components
  - CONTEXT.md: packages/ui/CONTEXT.md
  - Domain: Design system, shared UI primitives

- **env**: Environment utilities
  - CONTEXT.md: packages/env/CONTEXT.md
  - Domain: Platform detection, constants, runtime environment

- **config**: TypeScript configuration
  - CONTEXT.md: packages/config/CONTEXT.md
  - Domain: Shared TypeScript rules, build configuration
```

