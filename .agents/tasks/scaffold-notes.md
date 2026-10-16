# Scaffold Notes — better-t-stack output

Generated from:
```
pnpm create better-t-stack@latest pairsync \
  --frontend tanstack-router native-uniwind \
  --backend none --runtime none --api none --auth none \
  --payments none --database none --orm none --db-setup none \
  --package-manager pnpm --no-git --web-deploy none --server-deploy none \
  --no-install --addons mcp oxlint tauri vite-plus --examples none
```

Scaffold version: 3.46.1 (from bts.jsonc)  
Output location: `/tmp/pairsync`

---

## Scaffold UI Package Name

`@pairsync/ui` — same name as the existing package. The scaffold uses the same
package name, exports shape, and src layout. The primary differences are in
dependency versions (see below).

---

## Scaffold Root Scripts (`package.json`)

```json
{
  "dev":           "vp run -r dev",
  "build":         "vp run -r build",
  "check-types":   "vp run -r check-types",
  "check":         "oxlint && oxfmt --write",
  "lint":          "vp lint",
  "format":        "vp fmt",
  "staged":        "vp staged",
  "hooks:setup":   "vp config",
  "dev:native":    "vp run --filter native dev",
  "dev:web":       "vp run --filter web dev",
  "env:generate":  "varlock codegen --path ./apps/web/ && varlock codegen --path ./apps/native/",
  "postinstall":   "varlock codegen --path ./apps/web/ && varlock codegen --path ./apps/native/"
}
```

Key change from current repo: all task orchestration uses `vp` (vite-plus CLI)
instead of `turbo`. The `check` script calls `oxlint && oxfmt --write` directly.

---

## Scaffold Root `devDependencies`

```json
{
  "@pairsync/config": "workspace:*",
  "@types/node":      "^26.4.1",
  "oxfmt":            "^0.72.0",
  "oxlint":           "^1.87.0",
  "rolldown":         "1.2.13",
  "typescript":       "^6.0.3",
  "varlock":          "catalog:",
  "vite-plus":        "1.1.0"
}
```

Root `dependencies`:
```json
{
  "zod": "catalog:"
}
```

`packageManager`: `pnpm@11.21.0`

Notable: `turbo` is absent. `vite-plus@1.1.0` and `rolldown@1.2.13` are new.
`varlock` (env management) is added.

---

## Scaffold `pnpm-workspace.yaml`

```yaml
packages:
  - apps/*
  - packages/*
allowBuilds:
  esbuild: true
overrides:
  vite@*: npm:@voidzero-dev/vite-plus-core@1.1.0
catalog:
  zod: ^4.5.4
  varlock: 1.18.0
  next-themes: ^0.4.6
  sonner: ^2.0.8
  tailwindcss: ^4.3.3
```

Key additions vs current:
- `allowBuilds.esbuild: true` (new)
- `overrides` section aliasing `vite` → `vite-plus-core@1.1.0` (new)
- Catalog entries for `zod`, `varlock`, `next-themes`, `sonner`, `tailwindcss`
- Current repo also has `lucide-react`, `tailwind-merge`, `@types/react-dom` in
  catalog — those are absent from scaffold catalog (declared inline in packages)

---

## Oxlint Config

**Filename:** `.oxlintrc.json` (at repo root)

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["typescript", "unicorn", "oxc"],
  "categories": {
    "correctness": "error"
  },
  "rules": {},
  "env": {
    "builtin": true
  }
}
```

Companion formatter config — `.oxfmtrc.json`:
```json
{
  "ignorePatterns": []
}
```

---

## `vite.config.ts` (Vite+ root config — replaces turbo.json)

```ts
import { defineConfig } from "vite-plus";
export default defineConfig({
  lint: {
    ignorePatterns: [
      "node_modules/**",
      "**/node_modules/**",
      "apps/web/dist/**",
      "apps/web/.tanstack/**",
      "apps/web/src/routeTree.gen.ts",
      "apps/native/.expo/**",
      "apps/native/dist/**",
      "apps/native/web-build/**",
      "apps/native/ios/**",
      "apps/native/android/**",
    ],
    options: {
      typeAware: false,
      typeCheck: false,
    },
  },
  fmt: {
    ignorePatterns: [
      "node_modules/**",
      "**/node_modules/**",
      "apps/web/dist/**",
      "apps/web/.tanstack/**",
      "apps/web/src/routeTree.gen.ts",
      "apps/native/.expo/**",
      "apps/native/dist/**",
      "apps/native/web-build/**",
      "apps/native/ios/**",
      "apps/native/android/**",
    ],
    singleQuote: false,
    semi: true,
    sortPackageJson: true,
  },
  staged: {
    "*.{js,ts,jsx,tsx,vue,svelte,json,jsonc,css,md}": "vp check --fix",
  },
});
```

---

## MCP Config

No `.kiro/settings/mcp.json` file was generated. The `mcp` addon in
better-t-stack does not emit a Kiro-specific MCP config file. The Linear MCP
server must be added manually to `.kiro/settings/mcp.json` as a post-scaffold
step (per the user's Q11 answer).

The recommended MCP servers for this project (from user answers Q8/Q11) are:
- `better-t-stack`
- `context7`
- `expo`
- `shadcn`
- `linear` (to be added after scaffold)

---

## `.npmrc`

```
node-linker=isolated
```

---

## `bunfig.toml` (root)

```toml
env = false
```

Disables Bun's automatic env loading. Varlock handles env instead.

---

## `tsconfig.json` (root)

```json
{
  "extends": "@pairsync/config/tsconfig.base.json"
}
```

---

## Scaffold UI Package (`packages/ui`)

### `package.json` diff vs existing

| Field | Existing (`@pairsync/ui`) | Scaffold |
|---|---|---|
| `@base-ui/react` | `^1.6.0` | `^1.8.0` |
| `@shadcn/react` | `^0.2.1` | `^0.3.1` |
| `clsx` + `tailwind-merge` | both present | replaced by `cn: ^0.2.5` |
| `lucide-react` | `catalog:` | `^1.41.0` (inline) |
| `shadcn` | `^4.16.0` | `^4.21.0` |
| `@types/react-dom` | `catalog:` | `^19.2.7` (inline) |

Full scaffold `packages/ui/package.json`:
```json
{
  "name": "@pairsync/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./globals.css": "./src/styles/globals.css",
    "./lib/*": "./src/lib/*.ts",
    "./components/*": "./src/components/*.tsx",
    "./hooks/*": "./src/hooks/*.ts",
    "./postcss.config": "./postcss.config.mjs"
  },
  "scripts": {
    "check-types": "tsc --noEmit"
  },
  "dependencies": {
    "@base-ui/react": "^1.8.0",
    "@shadcn/react": "^0.3.1",
    "class-variance-authority": "^0.7.1",
    "cn": "^0.2.5",
    "lucide-react": "^1.41.0",
    "next-themes": "catalog:",
    "react": "^19.2.8",
    "react-dom": "^19.2.8",
    "shadcn": "^4.21.0",
    "sonner": "catalog:",
    "tw-animate-css": "^1.4.0"
  },
  "devDependencies": {
    "@pairsync/config": "workspace:*",
    "@tailwindcss/postcss": "^4.3.3",
    "@types/react": "^19.2.18",
    "@types/react-dom": "^19.2.7",
    "tailwindcss": "catalog:",
    "typescript": "^6.0.3"
  }
}
```

### `components.json`

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "base-lyra",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/styles/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@pairsync/ui/components",
    "utils": "@pairsync/ui/lib/utils",
    "hooks": "@pairsync/ui/hooks",
    "lib": "@pairsync/ui/lib",
    "ui": "@pairsync/ui/components"
  },
  "menuColor": "default",
  "menuAccent": "subtle",
  "registries": {}
}
```

### Files in `/tmp/pairsync/packages/ui/src/`

Identical set to the existing `packages/ui/src/`:

```
packages/ui/src/components/attachment.tsx
packages/ui/src/components/bubble.tsx
packages/ui/src/components/button.tsx
packages/ui/src/components/card.tsx
packages/ui/src/components/checkbox.tsx
packages/ui/src/components/dropdown-menu.tsx
packages/ui/src/components/empty.tsx
packages/ui/src/components/input-group.tsx
packages/ui/src/components/input.tsx
packages/ui/src/components/label.tsx
packages/ui/src/components/marker.tsx
packages/ui/src/components/message-scroller.tsx
packages/ui/src/components/message.tsx
packages/ui/src/components/skeleton.tsx
packages/ui/src/components/sonner.tsx
packages/ui/src/components/textarea.tsx
packages/ui/src/components/tooltip.tsx
packages/ui/src/hooks/.gitkeep
packages/ui/src/lib/utils.ts
packages/ui/src/styles/globals.css
```

No new components in the scaffold — the existing components are the same set.
The next step should diff individual file contents to detect any changes.

---

## Root-level files in scaffold (for reference)

```
/tmp/pairsync/
├── apps/
│   ├── native/   (Expo / React Native)
│   └── web/      (TanStack Router + Tauri)
├── packages/
│   ├── config/
│   └── ui/
├── .oxfmtrc.json
├── .oxlintrc.json
├── .npmrc
├── bts.jsonc
├── bunfig.toml
├── package.json
├── pnpm-workspace.yaml
├── README.md
├── tsconfig.json
└── vite.config.ts
```

No `turbo.json`. No `.kiro/` directory generated by the scaffold.
