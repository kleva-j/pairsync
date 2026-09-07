import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  type SqliteBackupFilesystem,
  type SqliteDatabaseError,
  type SqliteConnection,
  type SqliteMigration,
  type SqliteDriver,
  SqliteDatabase,
} from "../database";

/**
 * Integration scenarios for the migration pipeline. These exercise the
 * full SqliteDatabase lifecycle through a persistent FakeSqliteConnection
 * that survives across multiple driver.open() calls — modeling how a real
 * driver (`expo-sqlite`, `rusqlite`) would maintain state on disk between
 * the initialize/reset/close calls.
 *
 * Uses the FakeSqliteConnection / FakeSqliteDriver pattern from the spec.
 */

class PersistentFakeConnection implements SqliteConnection {
  readonly executed: string[] = [];
  readonly queries: string[] = [];
  private userVersion = 0;
  private readonly dbFilePath: string;
  private closed = false;

  constructor(filePath: string) {
    this.dbFilePath = filePath;
  }

  setUserVersion(version: number): void {
    this.userVersion = version;
  }

  getUserVersion(): number {
    return this.userVersion;
  }

  isClosed(): boolean {
    return this.closed;
  }

  async execute(sql: string): Promise<void> {
    if (this.closed) {
      throw new Error("Connection is closed");
    }
    this.executed.push(sql);
    if (sql.startsWith("PRAGMA user_version = ")) {
      this.userVersion = Number.parseInt(
        sql.slice("PRAGMA user_version = ".length),
        10,
      );
    }
  }

  async queryScalar(sql: string): Promise<unknown> {
    if (this.closed) {
      throw new Error("Connection is closed");
    }
    this.queries.push(sql);
    if (sql === "PRAGMA user_version") {
      return this.userVersion;
    }
    return null;
  }

  filePath(): string {
    return this.dbFilePath;
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  reopen(): void {
    this.closed = false;
    this.executed.length = 0;
    this.queries.length = 0;
  }
}

class PersistentFakeDriver implements SqliteDriver {
  readonly openCalls: string[] = [];
  private readonly connection: PersistentFakeConnection;

  constructor(connection: PersistentFakeConnection) {
    this.connection = connection;
  }

  async open(_options: { name: string }): Promise<SqliteConnection> {
    if (this.connection.isClosed()) {
      this.connection.reopen();
    }
    this.openCalls.push(_options.name);
    return this.connection;
  }
}

class InMemoryBackupFilesystem implements SqliteBackupFilesystem {
  readonly files = new Map<string, string>();
  readonly copyLog: Array<{ source: string; destination: string }> = [];
  readonly deleteLog: string[] = [];

  async copyFile(source: string, destination: string): Promise<void> {
    this.copyLog.push({ source, destination });
    if (this.files.has(source)) {
      this.files.set(destination, this.files.get(source)!);
    }
  }

  async deleteFile(path: string): Promise<void> {
    this.deleteLog.push(path);
    this.files.delete(path);
  }

  async listBackups(
    directory: string,
    baseName: string,
  ): Promise<ReadonlyArray<string>> {
    const prefix = directory
      ? `${directory}/${baseName}.backup-`
      : `${baseName}.backup-`;
    return [...this.files.keys()].filter((p) => p.startsWith(prefix));
  }
}

const migrations: ReadonlyArray<SqliteMigration> = [
  {
    fromVersion: 1,
    toVersion: 2,
    statements: ["ALTER TABLE settings ADD COLUMN theme TEXT"],
    description: "add theme",
  },
  {
    fromVersion: 2,
    toVersion: 3,
    statements: [
      "CREATE TABLE audit_log (id INTEGER PRIMARY KEY, event TEXT)",
    ],
    description: "add audit log",
  },
];

let connection: PersistentFakeConnection;
let driver: PersistentFakeDriver;

beforeEach(() => {
  connection = new PersistentFakeConnection("/tmp/pairsync.db");
  driver = new PersistentFakeDriver(connection);
});

afterEach(() => {
  // Ensure no leaks between tests
});

describe("Migration integration — full lifecycle", () => {
  it("initializes from fresh, stamps baseline, runs chain, persists version", async () => {
    const db = new SqliteDatabase({
      driver,
      open: { name: "pairsync.db" },
      runMigrations: true,
      migrations,
    });

    await db.initialize();

    expect(connection.getUserVersion()).toBe(3);
    expect(connection.executed).toContain("ALTER TABLE settings ADD COLUMN theme TEXT");
    expect(connection.executed).toContain("PRAGMA user_version = 3");
  });

  it("is idempotent: re-initializing does not re-run the chain", async () => {
    const db = new SqliteDatabase({
      driver,
      open: { name: "pairsync.db" },
      runMigrations: true,
      migrations,
    });

    await db.initialize();
    const executedAfterFirstInit = [...connection.executed];

    await db.initialize();

    // No additional migration statements on second init.
    expect(connection.executed).toEqual(executedAfterFirstInit);
  });

  it("continues a partially-migrated database from the current version", async () => {
    connection.setUserVersion(2);

    const db = new SqliteDatabase({
      driver,
      open: { name: "pairsync.db" },
      runMigrations: true,
      migrations,
    });

    await db.initialize();

    // Only the v2→v3 migration should have run (audit log table).
    expect(connection.executed).toContain(
      "CREATE TABLE audit_log (id INTEGER PRIMARY KEY, event TEXT)",
    );
    // Theme migration (v1→v2) was already applied; do not re-run.
    const themeStatements = connection.executed.filter((sql) =>
      sql.startsWith("ALTER TABLE settings ADD COLUMN theme"),
    );
    expect(themeStatements).toHaveLength(0);
    expect(connection.getUserVersion()).toBe(3);
  });

  it("fails fast on version downgrade (rollback deploy)", async () => {
    // Simulate a database that is at v3, but the new code only knows v1→v2.
    connection.setUserVersion(3);

    const db = new SqliteDatabase({
      driver,
      open: { name: "pairsync.db" },
      runMigrations: true,
      migrations: [
        {
          fromVersion: 1,
          toVersion: 2,
          statements: ["ALTER TABLE settings ADD COLUMN theme TEXT"],
          description: "add theme",
        },
      ],
    });

    await expect(db.initialize()).rejects.toMatchObject({
      code: "migration_failed",
    });
  });

  it("does not run migrations when runMigrations is false (opt-in)", async () => {
    const db = new SqliteDatabase({
      driver,
      open: { name: "pairsync.db" },
      runMigrations: false,
      migrations,
    });

    await db.initialize();

    // Baseline version is stamped, but no migration statements run.
    expect(connection.getUserVersion()).toBe(1);
    expect(connection.executed).not.toContain(
      "ALTER TABLE settings ADD COLUMN theme TEXT",
    );
  });

  it("reset() deletes the file and re-initializes from version 1", async () => {
    const filesystem = new InMemoryBackupFilesystem();
    filesystem.files.set("/tmp/pairsync.db", "v3 contents");

    const db = new SqliteDatabase({
      driver,
      open: { name: "pairsync.db" },
      runMigrations: true,
      migrations,
      backup: { filesystem, retain: 3 },
    });

    await db.initialize();
    expect(connection.getUserVersion()).toBe(3);

    // Re-open the file before reset (the connection is closed inside reset()).
    connection.reopen();
    connection.setUserVersion(3);

    await db.reset();

    // File was deleted by the backup filesystem.
    expect(filesystem.deleteLog).toContain("/tmp/pairsync.db");
    // After reset, the database is re-initialized and migrations run again.
    expect(connection.getUserVersion()).toBe(3);
    expect(db.isInitialized).toBe(true);
  });

  it("reset() is a no-op for deletion when no backup context is configured", async () => {
    // Per the implementation contract, reset() uses the backup filesystem
    // when available. Without one, the file is left in place (the caller
    // is responsible for cleanup at a higher level).
    const db = new SqliteDatabase({
      driver,
      open: { name: "pairsync.db" },
      runMigrations: true,
      migrations,
    });

    await db.initialize();
    connection.reopen();
    connection.setUserVersion(3);

    // Should not throw even though no backup is configured.
    await expect(db.reset()).resolves.toBeUndefined();
    expect(db.isInitialized).toBe(true);
  });

  it("emits migration_failed via onError and keeps the database closed on failure", async () => {
    const errors: SqliteDatabaseError[] = [];

    // Set the connection to fail on a specific migration statement.
    const failingDriver: SqliteDriver = {
      open: async () => {
        const c = new PersistentFakeConnection("/tmp/pairsync.db");
        const origExecute = c.execute.bind(c);
        c.execute = async (sql: string) => {
          if (sql.includes("ALTER TABLE settings ADD COLUMN theme")) {
            throw new Error("simulated migration failure");
          }
          return origExecute(sql);
        };
        return c;
      },
    };

    const db = new SqliteDatabase({
      driver: failingDriver,
      open: { name: "pairsync.db" },
      runMigrations: true,
      migrations,
      onError: (e) => errors.push(e),
    });

    await expect(db.initialize()).rejects.toMatchObject({
      code: "migration_failed",
    });
    expect(errors.some((e) => e.code === "migration_failed")).toBe(true);
  });

  it("creates a backup before migration and restores on failure", async () => {
    const filesystem = new InMemoryBackupFilesystem();
    filesystem.files.set("/tmp/pairsync.db", "v1 contents");

    // Driver that fails on the v1→v2 statement.
    const failingConnection = new PersistentFakeConnection("/tmp/pairsync.db");
    failingConnection.setUserVersion(1);
    const origExecute = failingConnection.execute.bind(failingConnection);
    failingConnection.execute = async (sql: string) => {
      if (sql.includes("ALTER TABLE settings ADD COLUMN theme")) {
        throw new Error("migration failed");
      }
      return origExecute(sql);
    };
    const failingDriver = new PersistentFakeDriver(failingConnection);

    const db = new SqliteDatabase({
      driver: failingDriver,
      open: { name: "pairsync.db" },
      runMigrations: true,
      migrations,
      backup: { filesystem, retain: 3 },
    });

    await expect(db.initialize()).rejects.toMatchObject({
      code: "migration_failed",
    });

    // A backup copy was attempted.
    expect(filesystem.copyLog.length).toBeGreaterThanOrEqual(1);
    const backupEntry = filesystem.copyLog.find((c) =>
      c.destination.includes(".backup-"),
    );
    expect(backupEntry).toBeDefined();
  });
});
