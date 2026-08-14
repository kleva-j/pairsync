# Config Package Context

**Context:** `packages/config/`  
**Domain:** Shared TypeScript and build configuration  
**Part of:** PairSync Monorepo (see `CONTEXT-MAP.md`)

---

## Purpose

The **config** package provides the **shared TypeScript base configuration** (`tsconfig.base.json`) for the entire monorepo, so every package and app compiles with the same settings. It has **no runtime exports** — build tooling (turbo, Vite, Metro) lives at the repo root and in each app.

## Domain Language

| Term | Definition | Example |
|------|------------|---------|
| **TypeScript Config** | tsconfig.json settings | `compilerOptions`, `include` |
| **ESLint Config** | Linting rules — **not configured in this repo** | — |
| **Prettier Config** | Code formatting rules — **not configured in this repo** | — |
| **Build Pipeline** | Compilation and bundling process | Turborepo, Vite, Metro |
| **Monorepo** | Multiple packages in one repository | Turborepo |
| **Workspace** | A package or app in the monorepo | `apps/*`, `packages/*` |

## Architecture

```
packages/config/
├── tsconfig.base.json        # Shared TypeScript base config
└── package.json
```

## Key Responsibilities

### 1. TypeScript Configuration

The **base TypeScript configuration** (`tsconfig.base.json`) is extended by all other packages and apps:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext"],
    "verbatimModuleSyntax": true,
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["node"]
  }
}
```

### 2. Package-Specific Extensions

Each package/app extends the base config:

```json
// packages/core/tsconfig.json
{
  "extends": "@pairsync/config/tsconfig.base.json"
}

// apps/web/tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "esModuleInterop": true,
    "jsx": "react-jsx",
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "skipLibCheck": true,
    "types": ["vite/client"],
    "rootDirs": ["."],
    "paths": {
      "@/*": ["./src/*"],
      "@pairsync/ui/*": ["../../packages/ui/src/*"]
    }
  }
}
```

### 3. Tooling Configuration

#### Turborepo

Root `turbo.json` defines the task pipeline (v2 `tasks` schema):

```json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", ".env*"],
      "outputs": ["dist/**"]
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "check-types": {
      "dependsOn": ["^check-types"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

The `lint` task is defined, but **no workspace currently has a `lint` script** — `pnpm lint` fails until one exists. Only `build`, `check-types`, and `dev` are actually runnable.

#### Workspaces

Workspace membership is defined in **`pnpm-workspace.yaml`**, which is the source of truth for pnpm:

```yaml
packages:
  - apps/*
  - packages/*
```

The root `package.json` also carries a `workspaces: ["apps/*", "packages/*"]` field (kept for other tools); pnpm ignores it in favor of the YAML file.

## TypeScript Settings Explained

### Strict Mode (`"strict": true`)

Enables all strict type-checking options:
- `noImplicitAny` - Error on expressions with implied `any` type
- `noImplicitThis` - Error on `this` with implied `any` type
- `alwaysStrict` - Emit `"use strict"` in all files
- `strictBindCallApply` - Strict checking of `bind`, `call`, `apply`
- `strictNullChecks` - `null` and `undefined` have distinct types
- `strictFunctionTypes` - Stricter function type checking
- `strictPropertyInitialization` - Class properties must be initialized
- `useUnknownInCatchVariables` - Catch variables default to `unknown`

> `noImplicitReturns` is **not** part of `strict` and is not enabled here.

### Additional Strictness

- `noUnusedLocals` - Error on unused local variables
- `noUnusedParameters` - Error on unused function parameters
- `noFallthroughCasesInSwitch` - Error on fallthrough in switch statements
- `noUncheckedIndexedAccess` - Array/index access can be `undefined`
- `verbatimModuleSyntax` - Type-only imports must use `import type`

> Note: `exactOptionalPropertyTypes` and `noImplicitReturns` are **not** enabled in the base config.

### Module Resolution

- `"moduleResolution": "bundler"` - Compatible with modern bundlers (Vite, Metro, esbuild)
- `"module": "ESNext"` - Output ES modules
- `"target": "ESNext"` - Target the latest ECMAScript

### JSX

The base config does **not** set `jsx` — apps set it per target (`react-jsx` in `apps/web`, Expo's base in `apps/native`).

## Build Tooling

### Turborepo Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all apps in development mode |
| `pnpm build` | Build all apps and packages |
| `pnpm check-types` | Type-check all workspaces |
| `pnpm dev:web` | Start only the web app |
| `pnpm dev:native` | Start only the native app |

### Workspace-Specific Commands

```json
// packages/core/package.json
{
  "scripts": {
    "check-types": "tsc --noEmit"
  }
}

// apps/web/package.json
{
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "serve": "vite preview",
    "start": "vite",
    "check-types": "vite build && tsc --noEmit",
    "tauri": "tauri",
    "desktop:dev": "tauri dev",
    "desktop:build": "tauri build"
  }
}

// apps/native/package.json
{
  "scripts": {
    "start": "expo start",
    "dev": "expo start --clear",
    "check-types": "tsc --noEmit",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "prebuild": "expo prebuild",
    "web": "expo start --web"
  }
}
```

## Shared Types / Runtime Exports

**Not implemented.** The config package has **no `exports` map and no `src/` directory** — it ships only `tsconfig.base.json`, consumed via `extends: "@pairsync/config/tsconfig.base.json"`. Shared TypeScript types are **not** exported from here; the shared domain types are planned for `packages/core` (Phase 1 of `IMPLEMENTATION_PLAN.md`).

## Quality Gates

### Type Checking

All code must pass `pnpm check-types` before merging:
```bash
pnpm check-types
```

### Linting & Formatting

ESLint and Prettier are **not configured** in this repo, and there are **no `lint` or `format` scripts** — running them fails. `pnpm check-types` is the only static gate for now; formatting is handled by editor defaults.

## Common Issues & Fixes

### "Cannot find module '@pairsync/core'"

**Solution:** `@pairsync/*` packages are workspace packages resolved through pnpm workspaces and each package's `exports` map — not tsconfig `paths`. Check that:

1. The package is declared in the consuming app's `package.json` as `"@pairsync/core": "workspace:*"`
2. `pnpm install` has been run so the workspace symlink exists
3. The package's `exports` map points at a real source file (e.g. `./src/index.ts`)

### "Module not found: Error: Can't resolve"

**Solution:** Check that:
1. The module exists at the specified path
2. The path mapping is correct in `tsconfig.json`
3. The file has a valid export
4. You're running from the monorepo root

### "Type 'X' is not generic"

**Solution:** The type is not generic — check the import path and the exported type's definition. If generics are missing, ensure the file exporting `X` actually declares `<T>` on it.

## File Structure Conventions

### Package Structure

```
packages/<name>/
├── src/
│   ├── index.ts              # Public API exports
│   ├── types.ts              # Public types
│   └── ...                   # Implementation files
├── package.json
└── tsconfig.json             # Extends base config
```

> Note: workspace packages in this repo export **source directly** via their `exports` map (e.g. `".": "./src/index.ts"`) — there is **no `dist/` build step** for `core`/`env`/`ui`. Only `apps/web` builds to `dist/` (Vite).

### App Structure

```
apps/<name>/
├── src/
│   ├── main.tsx             # Entry point
│   ├── routes/               # File-based routes
│   └── ...
├── public/ or assets/        # Static assets
├── dist/                    # Build output (gitignored)
├── package.json
└── tsconfig.json
```

## External Dependencies

**None.** `packages/config/package.json` has zero dependencies — it is a manifest plus one config file. `typescript` and `turbo` are devDependencies of the **root** `package.json`, not this package.

## Testing

No test framework is configured for this package yet. Configuration/inheritance tests are planned but not present; the practical gate today is `pnpm check-types`, which exercises the base config across every workspace.

## ADRs

Context-specific ADRs are stored in `packages/config/docs/adr/`. Root-level ADRs in `docs/adr/` apply to the entire monorepo.

---

**For more information:** See `CONTEXT-MAP.md` at the repo root for the full monorepo structure.
