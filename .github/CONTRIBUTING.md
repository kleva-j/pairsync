# Contributing to PairSync

Thanks for contributing! This guide covers the development workflow for the
monorepo. For the broader roadmap and architecture, see
[`IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md); for a map of the
repository and per-package docs, see [`CONTEXT-MAP.md`](../CONTEXT-MAP.md) and
the `CONTEXT.md` files.

## Repository layout

```
apps/
  web/      # Web app (Vite + React + Tauri desktop shell in src-tauri/)
  native/   # Mobile app (Expo / React Native)
packages/
  core/     # Shared types, constants, and platform utilities
  config/   # Shared TypeScript config
  env/      # Zod-validated environment schemas (./web, ./native)
  ui/       # Shared web UI components (consumed by apps/web)
```

## Prerequisites

- Node.js 22+ (see `.nvmrc` / CI)
- [pnpm](https://pnpm.io/installation) — version pinned in
  `packageManager` (11.21.0). Enable corepack or install that exact version.

## Setup

```sh
pnpm install
```

Never commit `pnpm-lock.yaml` changes that don't come from an actual install.

## Day-to-day commands

All commands run from the repo root via turbo, which executes them in the
relevant workspace(s):

| Command             | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `pnpm dev:web`      | Start the web app dev server                              |
| `pnpm dev:native`   | Start the Expo dev server                                 |
| `pnpm check-types`  | Typecheck every package (`tsc --noEmit`)                  |
| `pnpm test`         | Run unit tests (vitest) in packages with tests            |
| `pnpm build`        | Build every package that defines a build script           |

There are no `lint` or `format` scripts in this repo — `pnpm check-types`
is the only code-quality gate.

## Testing

Unit tests use [vitest](https://vitest.dev) and live next to the source they
cover (`src/__tests__/*.test.ts`). Run a single package's tests from its
directory (`pnpm test`) or everything from the root (`pnpm test`).

E2E coverage is planned per [`IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md):
Playwright for web, Detox for native.

## Commit conventions

We use [Conventional Commits](https://www.conventionalcommits.org):

- `feat:` — a new capability
- `fix:` — a bug fix
- `docs:` — documentation only (including `CONTEXT.md` files)
- `refactor:` — behavior-preserving restructuring
- `test:` — tests only
- `ci:` / `chore:` — CI, tooling, dependency, or build config changes

Scope with the package/app when it matters, e.g. `feat(core): add transfer
types`. Keep the subject under ~72 characters, focused on the *why*, and put
the details in the body.

## Branching and PRs

- Branch off `main` with a descriptive name (e.g. `feat/core-transfer-types`).
- Keep PRs small and focused; split unrelated changes into separate PRs.
- Before opening a PR, run `pnpm check-types` and `pnpm test` and make sure
  both pass. CI runs the same checks, plus `pnpm build`.
- Use the [pull request template](./pull_request_template.md).
- Merges should squash so each merge lands as one conventional commit.

## Documentation

Every package and app has a `CONTEXT.md` describing its current state. When
you change what a package *actually does*, update its `CONTEXT.md` in the same
PR — the docs must reflect the repository as it is, not as it's planned to
be. Keep `CONTEXT-MAP.md` in sync when packages are added or removed.
