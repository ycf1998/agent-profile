import { promises as fs } from 'node:fs';
import path from 'node:path';

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.lstat(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function listImmediateChildren(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.map((entry) => entry.name);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function removeManagedPath(targetPath: string): Promise<boolean> {
  try {
    const stats = await fs.lstat(targetPath);
    if (stats.isDirectory() && !stats.isSymbolicLink()) {
      await fs.rm(targetPath, { recursive: true, force: true });
    } else {
      await fs.rm(targetPath, { force: true, recursive: false });
    }
    return true;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function normalizeLinkTarget(targetPath: string, linkTarget: string): string {
  if (path.isAbsolute(linkTarget)) {
    return path.normalize(linkTarget.replace(/^\\\\\?\\/, ''));
  }
  return path.normalize(path.resolve(path.dirname(targetPath), linkTarget));
}

export async function readLinkDestination(targetPath: string): Promise<string | null> {
  try {
    const stats = await fs.lstat(targetPath);
    if (!stats.isSymbolicLink()) {
      return null;
    }
    const linkTarget = await fs.readlink(targetPath);
    return normalizeLinkTarget(targetPath, linkTarget);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'EINVAL' || nodeError.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function createManagedLink(sourcePath: string, targetPath: string): Promise<void> {
  await ensureDir(path.dirname(targetPath));
  const sourceStats = await fs.lstat(sourcePath);
  let type: 'file' | 'dir' | 'junction' = 'file';
  if (sourceStats.isDirectory()) {
    type = process.platform === 'win32' ? 'junction' : 'dir';
  }
  await fs.symlink(sourcePath, targetPath, type);
}
