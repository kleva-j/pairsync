export interface SqliteOpenOptions {
  readonly name: string;
}

export interface SqliteConnection {
  execute(sql: string, params?: ReadonlyArray<unknown>): Promise<void>;
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
  | "close_failed";

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

export class SqliteDatabase {
  readonly pool: SqliteConnectionPoolConfig;

  private readonly driver: SqliteDriver;
  private readonly openOptions: SqliteOpenOptions;
  private readonly schema: SqliteSchemaDefinition;
  private readonly onError?: (error: SqliteDatabaseError) => void;
  private connection: SqliteConnection | null = null;
  private initializePromise: Promise<void> | null = null;
  private closePromise: Promise<void> | null = null;

  constructor(options: SqliteDatabaseOptions) {
    this.driver = options.driver;
    this.openOptions = options.open;
    this.schema = options.schema ?? SQLITE_DEFAULT_SCHEMA;
    this.pool = options.pool ?? SQLITE_DEFAULT_POOL;
    this.onError = options.onError;
  }

  get isInitialized(): boolean {
    return this.connection !== null;
  }

  async initialize(): Promise<void> {
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
        `Failed to open SQLite database \"${this.openOptions.name}\"`,
        error,
      );
    }

    try {
      await applySqliteSchema(connection, this.schema);
    } catch (error) {
      await safeClose(connection);
      if (error instanceof SqliteDatabaseError) {
        this.onError?.(error);
        throw error;
      }
      throw this.fail("schema_failed", "Failed to initialize SQLite schema", error);
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
    this.connection = null;
    if (!connection) {
      return;
    }

    try {
      await connection.close();
    } catch (error) {
      throw this.fail("close_failed", "Failed to close SQLite connection", error);
    }
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

export function createSqliteDatabase(options: SqliteDatabaseOptions): SqliteDatabase {
  return new SqliteDatabase(options);
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