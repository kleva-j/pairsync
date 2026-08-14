# UI Package Context

**Context:** `packages/ui/`  
**Domain:** Shared React components and styling  
**Part of:** PairSync Monorepo (see `CONTEXT-MAP.md`)

---

## Purpose

The **ui** package provides **shared React components and global styles** used by the web/desktop app (`apps/web`). It holds shadcn/ui-style primitives plus a few app-specific components (chat/message elements). It is a web-oriented package — the native app does **not** consume it yet (native uses `uniwind` + `heroui-native`); sharing UI with native is planned for later phases.

## Domain Language

| Term | Definition | Example |
|------|------------|---------|
| **Primitive** | A low-level styled component | `button`, `input`, `checkbox` |
| **Component** | A composed UI element | `sonner` (toaster), `bubble`, `message` |
| **Design Token** | CSS variables defining visual properties (Tailwind v4 / oklch) | `--primary`, `--radius` |
| **shadcn/ui** | Component registry used to scaffold primitives | `components.json` |
| **Exports Map** | `package.json` `exports` controlling import paths | `@pairsync/ui/components/button` |

## Architecture

```
packages/ui/
├── src/
│   ├── components/                # Flat list of components (no subdirectories)
│   │   ├── attachment.tsx         # File attachment display
│   │   ├── bubble.tsx             # Chat-style message bubble
│   │   ├── button.tsx             # Button primitive
│   │   ├── card.tsx               # Card primitive
│   │   ├── checkbox.tsx           # Checkbox primitive
│   │   ├── dropdown-menu.tsx      # Dropdown menu primitive
│   │   ├── empty.tsx              # Empty-state placeholder
│   │   ├── input-group.tsx        # Label + input composition
│   │   ├── input.tsx              # Input primitive
│   │   ├── label.tsx              # Label primitive
│   │   ├── marker.tsx             # Inline marker/tag element
│   │   ├── message-scroller.tsx   # Scroll container for messages
│   │   ├── message.tsx            # Message row element
│   │   ├── skeleton.tsx           # Loading skeleton primitive
│   │   ├── sonner.tsx             # Toaster wrapper (sonner + next-themes)
│   │   ├── textarea.tsx           # Textarea primitive
│   │   └── tooltip.tsx            # Tooltip primitive
│   ├── hooks/                     # Shared hooks — currently empty (only .gitkeep)
│   ├── lib/
│   │   └── utils.ts               # cn() helper (clsx + tailwind-merge)
│   └── styles/
│       └── globals.css            # Tailwind v4 globals + design tokens (oklch)
├── components.json                # shadcn/ui registry config
├── postcss.config.mjs             # PostCSS + @tailwindcss/postcss
├── package.json
└── tsconfig.json
```

> There is **no** `src/components/ui/` directory, no `src/styles/theme/`, and no `tailwind.config.js` — styling uses Tailwind CSS v4 via CSS.

## Exports Map

```json
{
  "./globals.css": "./src/styles/globals.css",
  "./lib/*": "./src/lib/*.ts",
  "./components/*": "./src/components/*.tsx",
  "./hooks/*": "./src/hooks/*.ts",
  "./postcss.config": "./postcss.config.mjs"
}
```

Import components as `@pairsync/ui/components/<name>` (e.g. `@pairsync/ui/components/button`). `./lib/*` currently resolves only `utils.ts`; `./hooks/*` has no files yet.

## Key Responsibilities

### 1. Component Library

- **Primitives** (shadcn-style): `button`, `input`, `checkbox`, `label`, `card`, `skeleton`, `textarea`, `tooltip`, `dropdown-menu`
- **App-specific**: `bubble`, `message`, `message-scroller`, `attachment`, `marker`, `empty`, `input-group`
- **Toaster**: `sonner` wrapper wired to `next-themes`
- **Planned (Phase 4 of `IMPLEMENTATION_PLAN.md`):** security components (TrustPrompt, QR display/scanner, trusted-devices list, security indicator) — not yet implemented

### 2. Design Tokens

Defined in `src/styles/globals.css` as **oklch** CSS variables (shadcn v4 style), including `--background`, `--foreground`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--radius`, `--chart-1..5`, and `--sidebar*`. There are no `--success` / `--warning` / `--error` tokens — the destructive/semantic set is `--destructive` only.

### 3. Styling

- Tailwind CSS v4 via `@tailwindcss/postcss` — no `tailwind.config.js`
- Dark mode handled by `next-themes` in the consuming app (`apps/web`)
- **No NativeWind** — this package is not used by React Native; native styling uses `uniwind` in `apps/native`

### 4. Accessibility

- Components are built from shadcn/ui patterns (ARIA attributes included where relevant)
- WCAG 2.1 AA compliance is a **goal** (Phase 5 of `IMPLEMENTATION_PLAN.md`) — not yet systematically implemented or tested

### 5. Localization

Not implemented. All UI text is currently hardcoded English; i18n is planned for Phase 5.

## Usage Patterns

### Adding a New Primitive

```bash
# From project root
npx shadcn@latest add <component-name> -c packages/ui
```

### Importing Components

```tsx
import { Button } from "@pairsync/ui/components/button";
import { Card } from "@pairsync/ui/components/card";
import { Toaster } from "@pairsync/ui/components/sonner";
import { cn } from "@pairsync/ui/lib/utils";
import "@pairsync/ui/globals.css";
```

## Platform Compatibility

| Platform | Status | Notes |
|----------|--------|-------|
| Web / desktop (Tauri) | ✅ Consumed by `apps/web` | `sonner` + `globals.css` used in `__root.tsx` |
| Native (iOS/Android) | ❌ Not consumed | Native uses `uniwind` + `heroui-native`; sharing via this package is planned |

## Testing

No test framework is configured for this package yet. Tests (component, accessibility, visual) are planned but not present.

## ADRs

Context-specific ADRs are stored in `packages/ui/docs/adr/`. Root-level ADRs in `docs/adr/` apply to the entire monorepo.

---

**For more information:** See `CONTEXT-MAP.md` at the repo root for the full monorepo structure.
