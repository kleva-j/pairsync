import { describe, expect, it } from "vitest";

import {
  SQLITE_DEFAULT_POOL,
  SQLITE_DEFAULT_SCHEMA,
  SqliteDatabase,
  SqliteDatabaseError,
  applySqliteSchema,
} from "../database";
import type {
  SqliteConnection,
  SqliteConnectionPoolConfig,
  SqliteDatabaseOptions,
  SqliteDriver,
} from "../database";

class FakeSqliteConnection implements SqliteConnection {
  readonly executed: string[] = [];
  readonly paramBatches: Array<ReadonlyArray<unknown> | undefined> = [];
  closeCount = 0;
  failOn = new Map<string, Error>();

  async execute(sql: string, params?: ReadonlyArray<unknown>): Promise<void> {
    this.executed.push(sql);
    this.paramBatches.push(params);
    const failure = this.failOn.get(sql);
    if (failure) {
      throw failure;
    }
  }

  async close(): Promise<void> {
    this.closeCount += 1;
  }
}

class FakeSqliteDriver implements SqliteDriver {
  readonly openCalls: string[] = [];

  constructor(private readonly connection: FakeSqliteConnection) {}

  async open(options: { name: string }): Promise<SqliteConnection> {
    this.openCalls.push(options.name);
    return this.connection;
  }
}

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: (() => void) | undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  if (!resolve) {
    throw new Error("Failed to create deferred resolver");
  }
  return { promise, resolve };
}

function createSubject(
  overrides: Partial<SqliteDatabaseOptions> = {},
): {
  database: SqliteDatabase;
  connection: FakeSqliteConnection;
  driver: FakeSqliteDriver;
  errors: SqliteDatabaseError[];
} {
  const connection = new FakeSqliteConnection();
  const driver = new FakeSqliteDriver(connection);
  const errors: SqliteDatabaseError[] = [];
  const database = new SqliteDatabase({
    driver,
    open: { name: "pairsync.db" },
    onError: (error) => errors.push(error),
    ...overrides,
  });
  return { database, connection, driver, errors };
}

describe("SqliteDatabase", () => {
  it("uses the default single-connection pool configuration", () => {
    const { database } = createSubject();
    expect(database.pool).toEqual(SQLITE_DEFAULT_POOL);
  });

  it("allows overriding the pool configuration", () => {
    const pool: SqliteConnectionPoolConfig = { mode: "single", maxConnections: 1 };
    const { database } = createSubject({ pool });
    expect(database.pool).toBe(pool);
  });

  it("initializes once and applies the schema in a transaction", async () => {
    const { database, connection, driver } = createSubject();

    await database.initialize();

    expect(driver.openCalls).toEqual(["pairsync.db"]);
    expect(connection.executed[0]).toBe("BEGIN IMMEDIATE");
    expect(connection.executed.at(-1)).toBe("COMMIT");
    expect(connection.executed).toContain(SQLITE_DEFAULT_SCHEMA.statements[0]);
    expect(database.isInitialized).toBe(true);
  });

  it("does not reopen or reapply schema when initialize is called again", async () => {
    const { database, connection, driver } = createSubject();

    await database.initialize();
    const firstExecutionCount = connection.executed.length;
    await database.initialize();

    expect(driver.openCalls).toHaveLength(1);
    expect(connection.executed).toHaveLength(firstExecutionCount);
  });

  it("collapses concurrent initialize calls into a single open", async () => {
    const connection = new FakeSqliteConnection();
    const deferred = createDeferred();
    const driver: SqliteDriver = {
      open: async () => {
        await deferred.promise;
        return connection;
      },
    };
    const database = new SqliteDatabase({
      driver,
      open: { name: "pairsync.db" },
    });

    const first = database.initialize();
    const second = database.initialize();
    deferred.resolve();
    await Promise.all([first, second]);

    expect(connection.executed.filter((sql) => sql === "BEGIN IMMEDIATE")).toHaveLength(1);
  });

  it("rejects operations before initialize with a typed error", async () => {
    const { database } = createSubject();

    await expect(database.run("SELECT 1")).rejects.toMatchObject({
      code: "not_initialized",
    });
  });

  it("runs statements after initialize", async () => {
    const { database, connection } = createSubject();
    await database.initialize();

    await database.run("INSERT INTO settings(key, value, updated_at) VALUES (?, ?, ?)", [
      "theme",
      "dark",
      Date.now(),
    ]);

    expect(connection.executed.at(-1)).toBe(
      "INSERT INTO settings(key, value, updated_at) VALUES (?, ?, ?)",
    );
  });

  it("maps driver operation failures to typed errors", async () => {
    const { database, connection, errors } = createSubject();
    await database.initialize();
    connection.failOn.set("DELETE FROM settings WHERE key = ?", new Error("driver failed"));

    await expect(database.run("DELETE FROM settings WHERE key = ?", ["theme"])).rejects.toMatchObject({
      code: "operation_failed",
    });
    expect(errors.at(-1)?.code).toBe("operation_failed");
  });

  it("closes and can be initialized again", async () => {
    const { database, connection, driver } = createSubject();
    await database.initialize();
    await database.close();

    expect(connection.closeCount).toBe(1);
    expect(database.isInitialized).toBe(false);

    await database.initialize();
    expect(driver.openCalls).toHaveLength(2);
  });

  it("maps open failures to typed errors", async () => {
    const errors: SqliteDatabaseError[] = [];
    const database = new SqliteDatabase({
      driver: {
        open: async () => {
          throw new Error("open failed");
        },
      },
      open: { name: "pairsync.db" },
      onError: (error) => errors.push(error),
    });

    await expect(database.initialize()).rejects.toMatchObject({ code: "open_failed" });
    expect(errors.at(-1)?.code).toBe("open_failed");
  });

  it("maps schema failures to typed errors and rolls back", async () => {
    const { database, connection } = createSubject();
    connection.failOn.set(SQLITE_DEFAULT_SCHEMA.statements[0] ?? "", new Error("bad schema"));

    await expect(database.initialize()).rejects.toMatchObject({ code: "schema_failed" });
    expect(connection.executed).toContain("ROLLBACK");
    expect(database.isInitialized).toBe(false);
  });

  it("maps close failures to typed errors", async () => {
    const connection: SqliteConnection = {
      execute: async () => {},
      close: async () => {
        throw new Error("close failure");
      },
    };
    const database = new SqliteDatabase({
      driver: {
        open: async () => connection,
      },
      open: { name: "pairsync.db" },
    });

    await database.initialize();
    await expect(database.close()).rejects.toMatchObject({ code: "close_failed" });
  });
});

describe("applySqliteSchema", () => {
  it("applies all statements inside a transaction", async () => {
    const connection = new FakeSqliteConnection();
    const schema = {
      statements: ["CREATE TABLE IF NOT EXISTS a (id INTEGER PRIMARY KEY)", "CREATE INDEX IF NOT EXISTS a_id_idx ON a (id)"],
    };

    await applySqliteSchema(connection, schema);

    expect(connection.executed).toEqual([
      "BEGIN IMMEDIATE",
      "CREATE TABLE IF NOT EXISTS a (id INTEGER PRIMARY KEY)",
      "CREATE INDEX IF NOT EXISTS a_id_idx ON a (id)",
      "COMMIT",
    ]);
  });

  it("throws a typed error when a statement fails", async () => {
    const connection = new FakeSqliteConnection();
    const statement = "CREATE TABLE broken";
    connection.failOn.set(statement, new Error("sqlite failure"));

    await expect(
      applySqliteSchema(connection, {
        statements: [statement],
      }),
    ).rejects.toBeInstanceOf(SqliteDatabaseError);
  });
});