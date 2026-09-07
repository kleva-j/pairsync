import { SqliteDatabaseError } from "./sqlite";

export interface SqliteMigration {
  /** Unique integer version this migration upgrades FROM. */
  readonly fromVersion: number;
  /** Target version after this migration is applied. */
  readonly toVersion: number;
  /** SQL statements executed in order within a transaction. */
  readonly statements: ReadonlyArray<string>;
  /** Human-readable description for logs and backups. */
  readonly description: string;
}

export function buildMigrationChain(
  migrations: ReadonlyArray<SqliteMigration>,
  startingVersion: number,
): SqliteMigration[] {
  const sortedMigrations = migrations
    .slice()
    .sort((a, b) => a.fromVersion - b.fromVersion);
  const chain: SqliteMigration[] = [];
  const visited = new Set<number>();
  visited.add(startingVersion);

  let cursor = startingVersion;
  while (true) {
    const next = sortedMigrations.find(
      (migration) => migration.fromVersion === cursor,
    );
    if (!next) {
      break;
    }
    if (visited.has(next.toVersion)) {
      throw new SqliteDatabaseError(
        "migration_failed",
        `Cyclic migration detected: version ${cursor} -> ${next.toVersion} revisits already-seen version`,
      );
    }
    visited.add(next.toVersion);
    chain.push(next);
    cursor = next.toVersion;
  }

  return chain;
}

export function findMaxMigrationVersion(
  migrations: ReadonlyArray<SqliteMigration>,
  baseline: number,
): number {
  let max = baseline;
  for (const migration of migrations) {
    if (migration.toVersion > max) {
      max = migration.toVersion;
    }
  }
  return max;
}
