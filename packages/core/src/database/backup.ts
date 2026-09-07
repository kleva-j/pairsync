export interface SqliteBackupContext {
  /**
   * Filesystem operations needed by the migration runner to copy and prune
   * backups. Injectable so tests can use an in-memory filesystem.
   */
  readonly filesystem: SqliteBackupFilesystem;
  /** Maximum number of backups to retain after a successful migration. */
  readonly retain?: number;
}

export interface SqliteBackupFilesystem {
  copyFile(source: string, destination: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  listBackups(directory: string, baseName: string): Promise<ReadonlyArray<string>>;
}

export async function createBackup(
  filesystem: SqliteBackupFilesystem,
  filePath: string,
): Promise<string> {
  const timestamp = Date.now();
  const backupPath = `${filePath}.backup-${timestamp}.db`;
  await filesystem.copyFile(filePath, backupPath);
  return backupPath;
}

export async function restoreBackup(
  filesystem: SqliteBackupFilesystem,
  backupPath: string,
  filePath: string,
): Promise<void> {
  await filesystem.copyFile(backupPath, filePath);
}

export async function pruneBackups(
  filesystem: SqliteBackupFilesystem,
  filePath: string,
  retain: number,
): Promise<void> {
  const directory = getDirectory(filePath);
  const baseName = getBaseName(filePath);
  const backups = await filesystem.listBackups(directory, baseName);
  const sorted = backups.slice().sort();
  const excess = sorted.length - retain;
  for (let i = 0; i < excess; i += 1) {
    const target = sorted[i];
    if (target !== undefined) {
      await filesystem.deleteFile(target);
    }
  }
}

function splitPath(filePath: string): { directory: string; baseName: string } {
  const normalized = filePath.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  if (index < 0) {
    return { directory: "", baseName: normalized };
  }
  return {
    directory: normalized.slice(0, index),
    baseName: normalized.slice(index + 1),
  };
}

function getDirectory(filePath: string): string {
  return splitPath(filePath).directory;
}

function getBaseName(filePath: string): string {
  return splitPath(filePath).baseName;
}
