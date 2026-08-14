# Env Package Context

**Context:** `packages/env/`  
**Domain:** Environment variable validation  
**Part of:** PairSync Monorepo (see `CONTEXT-MAP.md`)

---

## Purpose

The **env** package validates **environment variables** for the web and native apps using `@t3-oss/env-core` + `zod`. It is the only package with a per-platform split export (`/web` for Vite, `/native` for Expo).

> 🚧 **Status:** the schemas exist and typecheck, but **no code imports `@pairsync/env` yet** — it is declared in the `apps/web`, `apps/native`, and root `package.json` manifests only. Platform detection, feature flags, and shared constants are **not** part of this package (see *Not Implemented Here*).

## Architecture

```
packages/env/
├── src/
│   ├── web.ts          # Web schema: VITE_SERVER_URL, fed from import.meta.env
│   ├── native.ts       # Native schema: EXPO_PUBLIC_SERVER_URL, fed from process.env
│   └── vite-env.d.ts   # /// <reference types="vite/client" />
├── package.json        # Exports ./web and ./native — no root export
└── tsconfig.json       # extends @pairsync/config/tsconfig.base.json
```

There is **no `src/index.ts`**. The exports map exposes subpaths only:

```json
{
  "./web": "./src/web.ts",
  "./native": "./src/native.ts"
}
```

Importing `@pairsync/env` without a subpath fails — there is no root export.

## Usage

```ts
// Web app (Vite) — validated against import.meta.env
import { env } from "@pairsync/env/web";
env.VITE_SERVER_URL; // z.url()

// Native app (Expo) — validated against process.env
import { env } from "@pairsync/env/native";
env.EXPO_PUBLIC_SERVER_URL; // z.url()
```

Both schemas use `clientPrefix` (`VITE_` / `EXPO_PUBLIC_`) and `emptyStringAsUndefined: true`. The expected values come from `apps/web/.env` and `apps/native/.env` respectively.

## Dependencies

| Dependency | Purpose |
|------------|---------|
| `@t3-oss/env-core` | Env validation (`createEnv`) |
| `dotenv` | `.env` loading |
| `zod` | Schema definitions |
| `vite` (dev) | `vite/client` types for `import.meta.env` |

## Not Implemented Here

Earlier versions of this doc described platform detection (`getPlatform`, `isMobile`, …), runtime/environment detection, feature flags (`enableTLS`, `enableQRPairing`, …), and shared constants (`DISCOVERY_PORT`, `CHUNK_SIZE`, …) as part of this package. **None of that exists in `packages/env`.** Per `IMPLEMENTATION_PLAN.md`, shared protocol constants and platform abstraction are planned for `packages/core` (Phases 1–2); env's scope is environment-variable validation only.

## Testing

No test framework is configured for this package yet. Tests are planned but not present.

## ADRs

Context-specific ADRs are stored in `packages/env/docs/adr/`. Root-level ADRs in `docs/adr/` apply to the entire monorepo.

---

**For more information:** See `CONTEXT-MAP.md` at the repo root for the full monorepo structure.
