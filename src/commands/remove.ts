import { addExcludeRule, loadRepoConfig } from '../core/config';
import { deleteSyncState, loadSyncState, saveSyncState } from '../core/state';
import type { RemoveResult } from '../models/types';
import { pathExists, removeManagedPath } from '../utils/fs';

interface RemoveOptions {
  repoRoot: string;
  managedPath?: string;
  all?: boolean;
  once?: boolean;
}

export async function runRemove(options: RemoveOptions): Promise<RemoveResult> {
  const config = await loadRepoConfig(options.repoRoot);
  const state = await loadSyncState();
  const result: RemoveResult = {
    created: 0,
    updated: 0,
    deleted: 0,
    skipped: 0,
    conflicts: 0,
    errors: 0,
    removedPaths: [],
    excludeAdded: null,
  };

  if (!options.managedPath && !options.all) {
    throw new Error('请指定要移除的路径，或使用 --all 移除全部托管项');
  }

  const records = { ...state.records };
  const targets = options.all
    ? Object.values(records)
    : options.managedPath
    ? Object.values(records).filter((record) => record.relativePath === options.managedPath)
    : [];

  for (const record of targets) {
    const exists = await pathExists(record.targetPath);
    if (exists) {
      await removeManagedPath(record.targetPath);
      result.deleted += 1;
      result.removedPaths.push(record.relativePath);
    } else {
      result.skipped += 1;
    }
    delete records[record.relativePath];
  }

  if (!options.once && options.managedPath) {
    await addExcludeRule(options.repoRoot, options.managedPath);
    result.excludeAdded = options.managedPath;
  }

  if (Object.keys(records).length === 0) {
    await deleteSyncState();
  } else {
    await saveSyncState({
      version: state.version,
      profile: state.profile,
      repoRoot: state.repoRoot || options.repoRoot,
      rootPath: state.rootPath || config.rootPath,
      records,
    });
  }

  return result;
}
