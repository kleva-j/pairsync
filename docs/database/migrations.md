# SQLite Schema Migrations Guide

**Package:** `@pairsync/core`  
**Module:** `database`  
**Status:** Phase 3.11 — Schema versioning implemented (N-256)  
**Audience:** Core contributors and app integrators

This guide covers the schema migration system in `packages/core/src/database/sqlite.ts`: how to write migrations, how to wire platform drivers, and how to run migrations safely in production.

---

## Quick Start

```ts
import {
  SqliteDatabase,
  type SqliteMigration,
  type SqliteDriver,
} from "@pairsync/core";

const migrations: ReadonlyArray<SqliteMigration> = [
  {
    fromVersion: 1,
    toVersion: 2,
    statements: ["ALTER TABLE settings ADD COLUMN theme TEXT"],
    description: "add user theme preference",
  },
  {
    fromVersion: 2,
    toVersion: 3,
    statements: [
      "CREATE TABLE audit_log (id INTEGER PRIMARY KEY, event TEXT, ts INTEGER)",
    ],
    description: "introduce audit log",
  },
];

const driver: SqliteDriver = /* platform-specific implementation */;

const database = new SqliteDatabase({
  driver,
  open: { name: "pairsync.db" },
  migrations,
  runMigrations: true, // opt in to automatic migration execution
});

await database.initialize(); // baseline v1 + runs any pending chain
```

---

## Core Concepts

### Version Tracking

The schema version is stored in SQLite's built-in `PRAGMA user_version`. Every `initialize()` call:

1. Applies the baseline schema (idempotent `CREATE TABLE IF NOT EXISTS`).
2. Stamps the baseline version (`SQLITE_BASELINE_VERSION = 1`) on fresh databases.
3. Walks the migration chain from the current version up to the latest `toVersion`.
4. Throws if the database version exceeds the code's max version (downgrade guard).

### Migration Chain

Migrations are an ordered list. The runner walks the chain from `currentVersion` forward, selecting migrations where `fromVersion === cursor`. Each migration must declare a contiguous `fromVersion` / `toVersion` pair.

| Property      | Type                    | Purpose                                   |
| ------------- | ----------------------- | ----------------------------------------- |
| `fromVersion` | `number`                | Current schema version this upgrades from |
| `toVersion`   | `number`                | Target version after this migration       |
| `statements`  | `ReadonlyArray<string>` | SQL statements executed in order          |
| `description` | `string`                | Human-readable label for logs and backups |

### Safety Guards

- **Cycle detection** — The chain walker tracks visited versions and throws `migration_failed` if a cycle is detected.
- **Atomic execution** — All statements in a chain run in a single `BEGIN IMMEDIATE` transaction. If any statement fails, the chain rolls back.
- **Backup & restore** — When a backup filesystem is configured, the runner copies the database before applying migrations and restores from the backup on failure.
- **Version downgrade detection** — If the database version exceeds the code's max expected version, `initialize()` throws `migration_failed` to prevent silent corruption from rollback deploys.

---

## API Reference

### `SqliteDatabase`

```ts
class SqliteDatabase {
  constructor(options: SqliteDatabaseOptions);
  get isInitialized(): boolean;
  async initialize(): Promise<void>;
  async close(): Promise<void>;
  async reset(): Promise<void>;
  async run(sql: string, params?: ReadonlyArray<unknown>): Promise<void>;
}
```

#### `SqliteDatabaseOptions`

```ts
interface SqliteDatabaseOptions {
  driver: SqliteDriver; // Required: platform driver
  open: SqliteOpenOptions; // Required: { name: string }
  schema?: SqliteSchemaDefinition; // Optional: defaults to SQLITE_DEFAULT_SCHEMA
  pool?: SqliteConnectionPoolConfig; // Optional: defaults to single connection
  onError?: (error: SqliteDatabaseError) => void;
  migrations?: ReadonlyArray<SqliteMigration>;
  backup?: SqliteBackupContext; // Optional: enables backup/restore
  runMigrations?: boolean; // Default: false (opt-in)
}
```

### `applyMigrations`

```ts
async function applyMigrations(
  connection: SqliteConnection,
  migrations: ReadonlyArray<SqliteMigration>,
  backup?: SqliteBackupContext,
  onError?: (error: SqliteDatabaseError) => void,
): Promise<void>;
```

Run a migration chain against an open connection. Throws `SqliteDatabaseError` with code `"migration_failed"` on failure.

### Error Codes

| Code               | Meaning                                              |
| ------------------ | ---------------------------------------------------- |
| `not_initialized`  | `run()` or `reset()` called before `initialize()`    |
| `open_failed`      | Driver failed to open the database                   |
| `schema_failed`    | Baseline schema application failed                   |
| `operation_failed` | A `run()` statement failed                           |
| `close_failed`     | Connection close threw                               |
| `migration_failed` | Migration chain failed, rolled back, backup restored (if configured) |

---

## Writing Migrations

### Conventions

- **One logical change per migration** — e.g. adding a column, creating a table, adding an index.
- **Forward-only** — Never edit a migration that has shipped. Add a new migration to reverse its effect.
- **Use `IF NOT EXISTS` for idempotency** — Defensive against partial state, but the runner already wraps everything in a transaction. Note: `ALTER TABLE ... ADD COLUMN` does not support `IF NOT EXISTS`; handle columns that may already exist with appropriate checks.
- **Keep migrations small and fast** — The chain holds a write lock for the full duration.

### Example: Adding a Column

```ts
{
  fromVersion: 3,
  toVersion: 4,
  statements: [
    "ALTER TABLE settings ADD COLUMN locale TEXT NOT NULL DEFAULT 'en-US'",
  ],
  description: "add locale preference",
}
```

### Example: Creating a Table

```ts
{
  fromVersion: 4,
  toVersion: 5,
  statements: [
    `CREATE TABLE device_aliases (
      device_id TEXT PRIMARY KEY,
      alias TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    "CREATE INDEX device_aliases_updated_idx ON device_aliases (updated_at)",
  ],
  description: "introduce device alias history",
}
```

### Example: Data Backfill

```ts
{
  fromVersion: 5,
  toVersion: 6,
  statements: [
    // Step 1: add column with default
    "ALTER TABLE settings ADD COLUMN migrated_at INTEGER",
    // Step 2: backfill existing rows
    "UPDATE settings SET migrated_at = strftime('%s', 'now') * 1000 WHERE migrated_at IS NULL",
  ],
  description: "add and backfill migrated_at column",
}
```

---

## Platform Driver Integration

The core package ships the contract and the migration runner. Platform drivers are wired in the apps.

### Mobile (`expo-sqlite`)

Planned for `apps/native/src/platform/sqlite.ts`:

```ts
import * as SQLite from "expo-sqlite";
import type { SqliteConnection, SqliteDriver } from "@pairsync/core";

class ExpoSqliteConnection implements SqliteConnection {
  private readonly db: SQLite.SQLiteDatabase;

  constructor(db: SQLite.SQLiteDatabase) {
    this.db = db;
  }

  async execute(sql: string, params?: ReadonlyArray<unknown>): Promise<void> {
    await this.db.execAsync(sql, params as any);
  }

  async queryScalar(
    sql: string,
    params?: ReadonlyArray<unknown>,
  ): Promise<unknown> {
    const result = await this.db.getFirstAsync(sql, params as any);
    if (result === null || result === undefined) return null;
    const values = Object.values(result);
    return values.length > 0 ? values[0] : null;
  }

  filePath(): string {
    // expo-sqlite stores the file under the app's document directory.
    // Use a runtime helper to resolve the absolute path.
    return resolveDatabasePath();
  }

  async close(): Promise<void> {
    await this.db.closeAsync();
  }
}

class ExpoSqliteDriver implements SqliteDriver {
  async open(options: { name: string }): Promise<SqliteConnection> {
    const db = await SQLite.openDatabaseAsync(options.name);
    return new ExpoSqliteConnection(db);
  }
}
```

### Desktop Tauri (`rusqlite` via Tauri plugin)

Planned for `apps/web/src-tauri/plugins/pairsync-sqlite`:

```rust
// src/lib.rs
use rusqlite::Connection;

#[tauri::command]
pub fn open_database(name: String) -> Result<DatabaseHandle, String> {
    let path = resolve_db_path(&name)?;
    let conn = Connection::open(&path).map_err(|e| e.to_string())?;
    Ok(DatabaseHandle { path })
}
```

The Tauri adapter exposes `execute`, `query_scalar`, `file_path`, and `close` over the JS-Rust bridge, wrapping the same `SqliteConnection` contract.

---

## Backup Filesystem

The `SqliteBackupContext` is an injectable seam that lets you control how backups are stored, listed, and pruned. On native platforms, implement it with `expo-file-system` (mobile) or `std::fs` (desktop):

```ts
import * as FileSystem from "expo-file-system";
import type { SqliteBackupFilesystem } from "@pairsync/core";

const filesystem: SqliteBackupFilesystem = {
  async copyFile(source, destination) {
    await FileSystem.copyAsync({ from: source, to: destination });
  },
  async deleteFile(path) {
    await FileSystem.deleteAsync(path, { idempotent: true });
  },
  async listBackups(directory, baseName) {
    const entries = await FileSystem.readDirectoryAsync(directory);
    return entries
      .filter((name) => name.startsWith(`${baseName}.backup-`))
      .map((name) => `${directory}/${name}`);
  },
};
```

Retention defaults to 3 backups. The runner prunes oldest-first after each successful migration.

---

## Production Deployment

### Rolling Out a New Migration

1. Add the migration to the migrations array in your app's database setup.
2. Ensure `runMigrations: true` is set in your SqliteDatabaseOptions (or already true).
3. Ship the new build. Migrations run automatically on first `initialize()`.
4. Monitor the `onError` callback for `migration_failed` events.

### Coordinating Across Instances

The migration runner uses `BEGIN IMMEDIATE`, which acquires a reserved lock. With multiple instances starting simultaneously, all but one will block briefly or fail with `SQLITE_BUSY`. If you have hundreds of instances cold-starting at once, consider:

- Running migrations on a single designated instance (e.g. a leader-elected pod).
- Using a feature flag to gate migration execution per instance.
- Adding retry/backoff around `initialize()`.

### Rollback Deploys

The version downgrade guard throws `migration_failed` if the database version exceeds the code's max version. This prevents silent data corruption, but means a rollback deploy to an older codebase will fail to start.

**Options for rollback:**

1. **Forward fix** — Ship a new migration that reverses the change, then roll back.
2. **Manual intervention** — Use `database.reset()` to wipe the database and start fresh (destructive; user data is lost).
3. **Backup restore** — Restore from a pre-migration backup manually before deploying the older code.

### Testing Migrations

Unit tests use the `FakeSqliteConnection` and in-memory filesystem implementations to validate migration logic without a real SQLite instance. Integration tests should run against a real `expo-sqlite` or `better-sqlite3` driver in CI to validate actual SQLite transaction and filesystem behavior.

---

## Troubleshooting

### `migration_failed` on startup

- **Database version higher than code expects** — A rollback deploy. Either forward-fix or restore from backup.
- **Cyclic migration detected** — Two migrations form a loop (e.g. 1→2 and 2→1). Fix the migration definitions.
- **Bad SQL in a statement** — The transaction rolled back, the backup was restored (if configured). Fix the SQL and re-ship.

### Backups filling the disk

Pruning failures are reported via `onError` with code `operation_failed`. Check the filesystem permissions and disk usage in the affected environment.

### `not_initialized` after a failed migration

If the connection was closed during backup restore (a safety measure), the `SqliteDatabase` instance is invalidated. Call `initialize()` again to open a fresh connection.

---

## Related Files

- `packages/core/src/database/sqlite.ts` — Migration runner and contracts
- `packages/core/src/__tests__/migrations.test.ts` — Unit tests for `applyMigrations`
- `packages/core/src/__tests__/sqliteMigrations.integration.test.ts` — Integration tests (skipped without `better-sqlite3`)
- `packages/core/src/__tests__/sqliteDatabase.test.ts` — `SqliteDatabase` lifecycle tests
- `docs/agents/issue-tracker.md` — Linear workflow
