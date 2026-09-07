import type { SqliteBackupContext } from "./backup";
import type { SqliteMigration } from "./migrations";

import { buildMigrationChain, findMaxMigrationVersion } from "./migrations";
import { createBackup, pruneBackups, restoreBackup } from "./backup";

// Re-export types from sibling modules so the public API in index.ts can
// collect everything from a single import surface.
export type { SqliteBackupContext, SqliteBackupFilesystem } from "./backup";
export type { SqliteMigration } from "./migrations";

export interface SqliteOpenOptions {
  readonly name: string;
}

export interface SqliteConnection {
  execute(sql: string, params?: ReadonlyArray<unknown>): Promise<void>;
  /**
   * Executes a scalar-returning statement and returns the first column of the
   * first row as a primitive value. Used by the migration runner for
   * `PRAGMA user_version` reads.
   */
  queryScalar(sql: string, params?: ReadonlyArray<unknown>): Promise<unknown>;
  /**
   * Returns the absolute filesystem path to the underlying database file.
   * Required for backup rotation and `reset()`. Platform drivers
   * (`expo-sqlite`, `rusqlite`) must implement this.
   */
  filePath(): string;
  close(): Promise<void>;
}

export interface SqliteDriver {
  open(options: SqliteOpenOptions): Promise<SqliteConnection>;
}

export interface SqliteConnectionPoolConfig {
  readonly mode: "single";
  readonly maxConnections: 1;
}

export interface SqliteSchemaDefinition {
  readonly statements: ReadonlyArray<string>;
}

export type SqliteDatabaseErrorCode =
  | "not_initialized"
  | "open_failed"
  | "schema_failed"
  | "operation_failed"
  | "close_failed"
  | "migration_failed";

export class SqliteDatabaseError extends Error {
  readonly code: SqliteDatabaseErrorCode;
  readonly cause: unknown;

  constructor(code: SqliteDatabaseErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "SqliteDatabaseError";
    this.code = code;
    this.cause = cause;
  }
}

export interface SqliteDatabaseOptions {
  readonly driver: SqliteDriver;
  readonly open: SqliteOpenOptions;
  readonly schema?: SqliteSchemaDefinition;
  readonly pool?: SqliteConnectionPoolConfig;
  readonly onError?: (error: SqliteDatabaseError) => void;
  readonly migrations?: ReadonlyArray<SqliteMigration>;
  readonly backup?: SqliteBackupContext;
  /**
   * Whether to run migrations automatically during initialize().
   * Set to true to enable automatic migration execution.
   * Default: false for safety—migrations must be explicitly triggered.
   */
  readonly runMigrations?: boolean;
}

export const SQLITE_DEFAULT_POOL: SqliteConnectionPoolConfig = {
  mode: "single",
  maxConnections: 1,
};

export const SQLITE_SCHEMA_STATEMENTS: ReadonlyArray<string> = [
  `
CREATE TABLE IF NOT EXISTS trusted_devices (
  device_id TEXT PRIMARY KEY,
  alias TEXT NOT NULL,
  cert_fingerprint TEXT NOT NULL,
  trusted_at INTEGER NOT NULL,
  last_seen_at INTEGER
)
`.trim(),
  `
CREATE TABLE IF NOT EXISTS transfer_manifests (
  transfer_id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  chunk_size INTEGER NOT NULL,
  total_chunks INTEGER NOT NULL,
  file_hash TEXT NOT NULL,
  chunk_hashes_json TEXT NOT NULL,
  mime_type TEXT,
  completed_bitmap TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)
`.trim(),
  `
CREATE TABLE IF NOT EXISTS transfer_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transfer_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  peer_device_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  status TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER
)
`.trim(),
  "CREATE INDEX IF NOT EXISTS transfer_history_transfer_id_idx ON transfer_history (transfer_id)",
  "CREATE INDEX IF NOT EXISTS transfer_history_peer_device_id_idx ON transfer_history (peer_device_id)",
  `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
)
`.trim(),
];

export const SQLITE_DEFAULT_SCHEMA: SqliteSchemaDefinition = {
  statements: SQLITE_SCHEMA_STATEMENTS,
};

/** Baseline schema version stamped after the default schema is applied. */
export const SQLITE_BASELINE_VERSION = 1;

export class SqliteDatabase {
  readonly pool: SqliteConnectionPoolConfig;

  private readonly driver: SqliteDriver;
  private readonly openOptions: SqliteOpenOptions;
  private readonly schema: SqliteSchemaDefinition;
  private readonly onError?: (error: SqliteDatabaseError) => void;
  private readonly migrations: ReadonlyArray<SqliteMigration>;
  private readonly backup: SqliteBackupContext | undefined;
  private readonly runMigrations: boolean;
  private readonly deleteFile: (path: string) => Promise<void>;
  private connection: SqliteConnection | null = null;
  private initializePromise: Promise<void> | null = null;
  private closePromise: Promise<void> | null = null;

  constructor(options: SqliteDatabaseOptions) {
    this.driver = options.driver;
    this.openOptions = options.open;
    this.schema = options.schema ?? SQLITE_DEFAULT_SCHEMA;
    this.pool = options.pool ?? SQLITE_DEFAULT_POOL;
    this.onError = options.onError;
    this.migrations = options.migrations ?? [];
    this.backup = options.backup;
    this.runMigrations = options.runMigrations ?? false;
    // When a backup context is configured, use its filesystem for reset()
    // file deletion (matches the production environment). Otherwise default
    // to a no-op so reset() can still satisfy the contract without a
    // filesystem dependency; the database file simply isn't removed.
    this.deleteFile = (path: string) =>
      this.backup?.filesystem.deleteFile(path) ?? Promise.resolve();
  }

  get isInitialized(): boolean {
    return this.connection !== null;
  }

  async initialize(): Promise<void> {
    if (this.closePromise) {
      await this.closePromise;
    }
    if (this.connection) {
      return;
    }
    if (this.initializePromise) {
      return this.initializePromise;
    }
    const promise = this.initializeInternal();
    this.initializePromise = promise;
    try {
      await promise;
    } finally {
      this.initializePromise = null;
    }
  }

  async close(): Promise<void> {
    if (this.closePromise) {
      return this.closePromise;
    }
    const promise = this.closeInternal();
    this.closePromise = promise;
    try {
      await promise;
    } finally {
      this.closePromise = null;
    }
  }

  async reset(): Promise<void> {
    if (!this.connection) {
      throw this.fail(
        "not_initialized",
        "SQLite database is not initialized. Call initialize() first.",
      );
    }
    const filePath = this.connection.filePath();
    await this.close();
    await this.deleteFile(filePath);
    this.connection = null;
    await this.initialize();
  }

  async run(sql: string, params?: ReadonlyArray<unknown>): Promise<void> {
    const connection = this.requireConnection();
    try {
      await connection.execute(sql, params);
    } catch (error) {
      throw this.fail(
        "operation_failed",
        `SQLite operation failed while executing statement: ${summarizeSql(sql)}`,
        error,
      );
    }
  }

  private async initializeInternal(): Promise<void> {
    let connection: SqliteConnection | null = null;
    try {
      connection = await this.driver.open(this.openOptions);
    } catch (error) {
      throw this.fail(
        "open_failed",
        `Failed to open SQLite database "${this.openOptions.name}"`,
        error,
      );
    }

    try {
      await applySqliteSchema(connection, this.schema);
      const currentVersion = await readUserVersion(connection);

      // Check for version downgrade (rollback deploy)
      if (this.migrations.length > 0) {
        const expectedMaxVersion = findMaxMigrationVersion(
          this.migrations,
          SQLITE_BASELINE_VERSION,
        );
        if (currentVersion > expectedMaxVersion) {
          throw new SqliteDatabaseError(
            "migration_failed",
            `Schema downgrade detected: database is at version ${currentVersion} but code expects max ${expectedMaxVersion}. Rollback deploys are not supported.`,
          );
        }
      }

      if (currentVersion < SQLITE_BASELINE_VERSION) {
        await writeUserVersion(connection, SQLITE_BASELINE_VERSION);
      }

      if (this.runMigrations && this.migrations.length > 0) {
        await applyMigrations(
          connection,
          this.migrations,
          this.backup,
          this.onError,
        );
      }
    } catch (error) {
      await safeClose(connection);
      if (error instanceof SqliteDatabaseError) {
        this.onError?.(error);
        throw error;
      }
      throw this.fail(
        "schema_failed",
        "Failed to initialize SQLite schema",
        error,
      );
    }

    this.connection = connection;
  }

  private async closeInternal(): Promise<void> {
    if (this.initializePromise) {
      try {
        await this.initializePromise;
      } catch {
        // An initialization failure leaves no active connection to close.
      }
    }

    const connection = this.connection;
    if (!connection) {
      return;
    }

    try {
      await connection.close();
    } catch (error) {
      // Retain connection reference on close failure so callers can retry
      throw this.fail(
        "close_failed",
        "Failed to close SQLite connection",
        error,
      );
    }

    this.connection = null;
  }

  private requireConnection(): SqliteConnection {
    if (!this.connection) {
      throw this.fail(
        "not_initialized",
        "SQLite database is not initialized. Call initialize() first.",
      );
    }
    return this.connection;
  }

  private fail(
    code: SqliteDatabaseErrorCode,
    message: string,
    cause?: unknown,
  ): SqliteDatabaseError {
    const error = new SqliteDatabaseError(code, message, cause);
    this.onError?.(error);
    return error;
  }
}

export async function applySqliteSchema(
  connection: SqliteConnection,
  schema: SqliteSchemaDefinition = SQLITE_DEFAULT_SCHEMA,
): Promise<void> {
  let transactionStarted = false;
  try {
    await connection.execute("BEGIN IMMEDIATE");
    transactionStarted = true;
    for (const statement of schema.statements) {
      await connection.execute(statement);
    }
    await connection.execute("COMMIT");
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.execute("ROLLBACK");
      } catch {
        // Ignore rollback failures and preserve the original schema error.
      }
    }
    if (error instanceof SqliteDatabaseError) {
      throw error;
    }
    throw new SqliteDatabaseError(
      "schema_failed",
      `SQLite schema bootstrap failed: ${toErrorMessage(error)}`,
      error,
    );
  }
}

/**
 * Applies any pending migrations in order. Migrations are selected where
 * `fromVersion === currentVersion`. The first migration in the batch triggers
 * a pre-flight backup (when a backup context is provided); after the batch
 * completes, old backups are pruned to the configured retention count.
 *
 * Failures roll back the active transaction, restore from the most recent
 * backup if available, and throw a `migration_failed` error.
 */
export async function applyMigrations(
  connection: SqliteConnection,
  migrations: ReadonlyArray<SqliteMigration>,
  backup?: SqliteBackupContext,
  onError?: (error: SqliteDatabaseError) => void,
): Promise<void> {
  const chain = buildMigrationChain(
    migrations,
    await readUserVersion(connection),
  );
  if (chain.length === 0) {
    return;
  }

  const retain = backup?.retain ?? 3;
  const filePath = connection.filePath();
  let backupPath: string | null = null;

  if (backup) {
    backupPath = await createBackup(backup.filesystem, filePath);
  }

  try {
    await connection.execute("BEGIN IMMEDIATE");
    for (const migration of chain) {
      for (const statement of migration.statements) {
        await connection.execute(statement);
      }
    }
    // Write version once at the end with final target version
    await writeUserVersion(connection, chain[chain.length - 1]!.toVersion);
    await connection.execute("COMMIT");
  } catch (error) {
    await handleMigrationFailure(
      error,
      backupPath,
      backup,
      filePath,
      connection,
    );
  }

  if (backup) {
    try {
      await pruneBackups(backup.filesystem, filePath, retain);
    } catch (pruneError) {
      // Backup pruning is best-effort; migration already succeeded
      // But report the failure via onError so operators know pruning is failing
      onError?.(
        new SqliteDatabaseError(
          "operation_failed",
          `Backup pruning failed: ${toErrorMessage(pruneError)}`,
          pruneError,
        ),
      );
    }
  }
}

async function handleMigrationFailure(
  error: unknown,
  backupPath: string | null,
  backup: SqliteBackupContext | undefined,
  filePath: string,
  connection: SqliteConnection,
): Promise<never> {
  try {
    await connection.execute("ROLLBACK");
  } catch {
    // Ignore rollback failures; the original migration error is what matters.
  }

  // Close connection before attempting filesystem restore
  try {
    await connection.close();
  } catch {
    // Ignore close failures during error recovery
  }

  if (backupPath !== null && backup) {
    try {
      await restoreBackup(backup.filesystem, backupPath, filePath);
      throw new SqliteDatabaseError(
        "migration_failed",
        `SQLite migration failed. Database restored from backup: ${toErrorMessage(error)}`,
        error,
      );
    } catch (restoreError) {
      if (
        restoreError instanceof SqliteDatabaseError &&
        restoreError.code === "migration_failed"
      ) {
        throw restoreError;
      }
      throw new SqliteDatabaseError(
        "migration_failed",
        `SQLite migration failed and backup restore also failed: ${toErrorMessage(restoreError)}`,
        error,
      );
    }
  }

  throw new SqliteDatabaseError(
    "migration_failed",
    `SQLite migration failed: ${toErrorMessage(error)}`,
    error,
  );
}

async function readUserVersion(connection: SqliteConnection): Promise<number> {
  const result = await connection.queryScalar("PRAGMA user_version");
  if (typeof result === "number" && Number.isFinite(result)) {
    return Math.max(0, Math.floor(result));
  }
  if (typeof result === "string") {
    const parsed = Number.parseInt(result, 10);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.floor(parsed));
    }
  }
  if (typeof result === "bigint") {
    return Number(result);
  }
  return 0;
}

async function writeUserVersion(
  connection: SqliteConnection,
  version: number,
): Promise<void> {
  const safeVersion = Math.max(0, Math.floor(version));
  // SQLite user_version is a 32-bit signed integer (max 2147483647)
  if (
    !Number.isInteger(safeVersion) ||
    safeVersion < 0 ||
    safeVersion > 2147483647
  ) {
    throw new Error(`Invalid version: ${version} (must be 0-2147483647)`);
  }
  await connection.execute(`PRAGMA user_version = ${safeVersion}`);
}

async function safeClose(connection: SqliteConnection): Promise<void> {
  try {
    await connection.close();
  } catch {
    // Closing after a failed initialize is best-effort only.
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function summarizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim().slice(0, 80);
}
