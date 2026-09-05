import { describe, expect, it } from "vitest";

import {
  type SqliteConnectionPoolConfig,
  type SqliteBackupFilesystem,
  type SqliteDatabaseOptions,
  type SqliteConnection,
  type SqliteMigration,
  type SqliteDriver,
  SQLITE_BASELINE_VERSION,
  SQLITE_DEFAULT_SCHEMA,
  SQLITE_DEFAULT_POOL,
  SqliteDatabaseError,
  applySqliteSchema,
  SqliteDatabase,
} from "../database";

class FakeSqliteConnection implements SqliteConnection {
  readonly executed: string[] = [];
  readonly paramBatches: Array<ReadonlyArray<unknown> | undefined> = [];
  readonly queries: string[] = [];
  private userVersion = 0;
  private readonly dbFilePath: string;
  closeCount = 0;
  failOn = new Map<string, Error>();
  failQueryOn = new Map<string, Error>();

  constructor(filePath = "/tmp/pairsync.db") {
    this.dbFilePath = filePath;
  }

  setUserVersion(version: number): void {
    this.userVersion = version;
  }

  async execute(sql: string, params?: ReadonlyArray<unknown>): Promise<void> {
    this.executed.push(sql);
    this.paramBatches.push(params);
    const failure = this.failOn.get(sql);
    if (failure) {
      throw failure;
    }
    if (sql.startsWith("PRAGMA user_version = ")) {
      this.userVersion = Number.parseInt(
        sql.slice("PRAGMA user_version = ".length),
        10,
      );
    }
  }

  async queryScalar(sql: string): Promise<unknown> {
    this.queries.push(sql);
    const failure = this.failQueryOn.get(sql);
    if (failure) {
      throw failure;
    }
    if (sql === "PRAGMA user_version") {
      return this.userVersion;
    }
    return null;
  }

  filePath(): string {
    return this.dbFilePath;
  }

  async close(): Promise<void> {
    this.closeCount += 1;
  }
}

class FakeSqliteDriver implements SqliteDriver {
  readonly openCalls: string[] = [];
  private readonly connection: FakeSqliteConnection;

  constructor(connection: FakeSqliteConnection) {
    this.connection = connection;
  }

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

function createSubject(overrides: Partial<SqliteDatabaseOptions> = {}): {
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
    const pool: SqliteConnectionPoolConfig = {
      mode: "single",
      maxConnections: 1,
    };
    const { database } = createSubject({ pool });
    expect(database.pool).toBe(pool);
  });

  it("initializes once and applies the schema in a transaction", async () => {
    const { database, connection, driver } = createSubject();

    await database.initialize();

    expect(driver.openCalls).toEqual(["pairsync.db"]);
    expect(connection.executed[0]).toBe("BEGIN IMMEDIATE");
    expect(connection.executed).toContain("COMMIT");
    expect(connection.executed.at(-1)).toBe(
      `PRAGMA user_version = ${SQLITE_BASELINE_VERSION}`,
    );
    expect(connection.executed).toContain(SQLITE_DEFAULT_SCHEMA.statements[0]);
    expect(database.isInitialized).toBe(true);
  });

  it("stamps the baseline user_version on initialize", async () => {
    const { database, connection } = createSubject();
    await database.initialize();

    expect(connection.queries).toContain("PRAGMA user_version");
    expect(connection.executed).toContain(
      `PRAGMA user_version = ${SQLITE_BASELINE_VERSION}`,
    );
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

    expect(
      connection.executed.filter((sql) => sql === "BEGIN IMMEDIATE"),
    ).toHaveLength(1);
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

    await database.run(
      "INSERT INTO settings(key, value, updated_at) VALUES (?, ?, ?)",
      ["theme", "dark", Date.now()],
    );

    expect(connection.executed.at(-1)).toBe(
      "INSERT INTO settings(key, value, updated_at) VALUES (?, ?, ?)",
    );
  });

  it("maps driver operation failures to typed errors", async () => {
    const { database, connection, errors } = createSubject();
    await database.initialize();
    connection.failOn.set(
      "DELETE FROM settings WHERE key = ?",
      new Error("driver failed"),
    );

    await expect(
      database.run("DELETE FROM settings WHERE key = ?", ["theme"]),
    ).rejects.toMatchObject({
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

    await expect(database.initialize()).rejects.toMatchObject({
      code: "open_failed",
    });
    expect(errors.at(-1)?.code).toBe("open_failed");
  });

  it("maps schema failures to typed errors and rolls back", async () => {
    const { database, connection } = createSubject();
    connection.failOn.set(
      SQLITE_DEFAULT_SCHEMA.statements[0] ?? "",
      new Error("bad schema"),
    );

    await expect(database.initialize()).rejects.toMatchObject({
      code: "schema_failed",
    });
    expect(connection.executed).toContain("ROLLBACK");
    expect(database.isInitialized).toBe(false);
  });

  it("maps close failures to typed errors", async () => {
    const connection: SqliteConnection = {
      execute: async () => {},
      queryScalar: async () => 0,
      filePath: () => "/tmp/pairsync.db",
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
    await expect(database.close()).rejects.toMatchObject({
      code: "close_failed",
    });
  });

  it("reset() throws when the database has not been initialized", async () => {
    const { database, errors } = createSubject();
    await expect(database.reset()).rejects.toMatchObject({
      code: "not_initialized",
    });
    expect(errors.at(-1)?.code).toBe("not_initialized");
  });

  describe("migrations", () => {
    it("applies single migration when database is at starting version", async () => {
      const connection = new FakeSqliteConnection();
      const migration: SqliteMigration = {
        fromVersion: 1,
        toVersion: 2,
        statements: ["CREATE TABLE test (id INTEGER)"],
        description: "test migration",
      };
      const driver: SqliteDriver = {
        open: async () => connection,
      };

      const database = new SqliteDatabase({
        driver,
        open: { name: "pairsync.db" },
        migrations: [migration],
      });

      connection.setUserVersion(1);
      await database.initialize();

      expect(connection.executed).toContain("CREATE TABLE test (id INTEGER)");
      expect(connection.executed).toContain("PRAGMA user_version = 2");
    });

    it("applies migration chain in order", async () => {
      const connection = new FakeSqliteConnection();
      const migrations: SqliteMigration[] = [
        {
          fromVersion: 1,
          toVersion: 2,
          statements: ["CREATE TABLE test1 (id INTEGER)"],
          description: "test migration 1",
        },
        {
          fromVersion: 2,
          toVersion: 3,
          statements: ["CREATE TABLE test2 (id INTEGER)"],
          description: "test migration 2",
        },
      ];
      const driver: SqliteDriver = {
        open: async () => connection,
      };

      const database = new SqliteDatabase({
        driver,
        open: { name: "pairsync.db" },
        migrations,
      });

      connection.setUserVersion(1);
      await database.initialize();

      expect(connection.executed).toContain("CREATE TABLE test1 (id INTEGER)");
      expect(connection.executed).toContain("PRAGMA user_version = 2");
      expect(connection.executed).toContain("CREATE TABLE test2 (id INTEGER)");
      expect(connection.executed).toContain("PRAGMA user_version = 3");
    });

    it("skips already-applied migrations", async () => {
      const connection = new FakeSqliteConnection();
      const migration: SqliteMigration = {
        fromVersion: 1,
        toVersion: 2,
        statements: ["CREATE TABLE test (id INTEGER)"],
        description: "test migration",
      };
      const driver: SqliteDriver = {
        open: async () => connection,
      };

      const database = new SqliteDatabase({
        driver,
        open: { name: "pairsync.db" },
        migrations: [migration],
      });

      connection.setUserVersion(2);
      await database.initialize();

      expect(connection.executed).not.toContain("CREATE TABLE test (id INTEGER)");
    });

    it("rolls back and restores backup on migration failure", async () => {
      const connection = new FakeSqliteConnection();
      const migration: SqliteMigration = {
        fromVersion: 1,
        toVersion: 2,
        statements: ["INVALID SQL"],
        description: "test migration",
      };
      const filesystem: SqliteBackupFilesystem = {
        copyFile: async () => {},
        deleteFile: async () => {},
        listBackups: async () => [],
      };
      const driver: SqliteDriver = {
        open: async () => connection,
      };

      const database = new SqliteDatabase({
        driver,
        open: { name: "pairsync.db" },
        migrations: [migration],
        backup: { filesystem, retain: 3 },
      });

      connection.failOn.set("INVALID SQL", new Error("bad SQL"));
      connection.setUserVersion(1);
      await expect(database.initialize()).rejects.toMatchObject({
        code: "migration_failed",
      });

      expect(connection.executed).toContain("ROLLBACK");
    });

    it("handles concurrent initialize with migrations", async () => {
      const connection = new FakeSqliteConnection();
      const migration: SqliteMigration = {
        fromVersion: 1,
        toVersion: 2,
        statements: ["CREATE TABLE test (id INTEGER)"],
        description: "test migration",
      };
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
        migrations: [migration],
      });

      connection.setUserVersion(1);
      const first = database.initialize();
      const second = database.initialize();
      deferred.resolve();
      await Promise.all([first, second]);

      // Both calls should collapse to a single migration run
      // (Note: BEGIN IMMEDIATE appears twice because schema + migrations run)
      expect(connection.executed.filter((sql) => sql === "CREATE TABLE test (id INTEGER)")).toHaveLength(1);
    });

    it("prunes backups to retain only last 3", async () => {
      const connection = new FakeSqliteConnection();
      const migration: SqliteMigration = {
        fromVersion: 1,
        toVersion: 2,
        statements: ["CREATE TABLE test (id INTEGER)"],
        description: "test migration",
      };
      const deletedFiles: string[] = [];
      const filesystem: SqliteBackupFilesystem = {
        copyFile: async () => {},
        deleteFile: async (path) => {
          deletedFiles.push(path);
        },
        listBackups: async () => [
          "/tmp/pairsync.db.backup-1000.db",
          "/tmp/pairsync.db.backup-2000.db",
          "/tmp/pairsync.db.backup-3000.db",
          "/tmp/pairsync.db.backup-4000.db",
        ],
      };
      const driver: SqliteDriver = {
        open: async () => connection,
      };

      const database = new SqliteDatabase({
        driver,
        open: { name: "pairsync.db" },
        migrations: [migration],
        backup: { filesystem, retain: 3 },
      });

      connection.setUserVersion(1);
      await database.initialize();

      expect(deletedFiles).toHaveLength(1);
      expect(deletedFiles[0]).toBe("/tmp/pairsync.db.backup-1000.db");
    });
  });
});

describe("applySqliteSchema", () => {
  it("applies all statements inside a transaction", async () => {
    const connection = new FakeSqliteConnection();
    const schema = {
      statements: [
        "CREATE TABLE IF NOT EXISTS a (id INTEGER PRIMARY KEY)",
        "CREATE INDEX IF NOT EXISTS a_id_idx ON a (id)",
      ],
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
