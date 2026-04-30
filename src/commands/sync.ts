import path from 'node:path';

import { collectDesiredItems } from '../core/asset-discovery';
import { loadRepoConfig } from '../core/config';
import { loadSyncState, saveSyncState } from '../core/state';
import type { DesiredItem, SyncOperation, SyncRecord, SyncResult, SyncState } from '../models/types';
import {
  createManagedLink,
  pathExists,
  readLinkDestination,
  removeManagedPath,
} from '../utils/fs';

interface SyncOptions {
  repoRoot: string;
  profile?: string | null;
  rebuild?: boolean;
  dryRun?: boolean;
}

function toRecord(item: DesiredItem): SyncRecord {
  return {
    relativePath: item.relativePath,
    sourceDescriptor: item.sourceDescriptor,
    sourcePath: item.sourcePath,
    targetPath: item.targetPath,
    itemType: item.itemType,
  };
}

function pushOperation(
  result: SyncResult,
  kind: SyncOperation['kind'],
  relativePath: string,
  detail?: string,
): void {
  result.operations.push({ kind, relativePath, detail });
}

async function removeStaleRecords(
  state: SyncState,
  desired: Map<string, DesiredItem>,
  dryRun: boolean,
  result: SyncResult,
): Promise<Record<string, SyncRecord>> {
  const nextRecords: Record<string, SyncRecord> = {};
  for (const [relativePath, record] of Object.entries(state.records)) {
    if (!desired.has(relativePath)) {
      const existed = await pathExists(record.targetPath);
      if (existed) {
        if (!dryRun) {
          await removeManagedPath(record.targetPath);
        }
        result.deleted += 1;
        pushOperation(result, 'delete', relativePath);
      } else {
        result.skipped += 1;
        pushOperation(result, 'skip', relativePath, '目标不存在，已从状态中清理');
      }
      continue;
    }
    nextRecords[relativePath] = record;
  }
  return nextRecords;
}

export async function runSync(options: SyncOptions): Promise<SyncResult> {
  const repoRoot = options.repoRoot;
  const config = await loadRepoConfig(repoRoot);
  const resolvedProfile = options.profile === undefined ? config.defaultProfile : options.profile;
  let state = await loadSyncState();
  const result: SyncResult = {
    created: 0,
    updated: 0,
    deleted: 0,
    skipped: 0,
    conflicts: 0,
    errors: 0,
    invalid: [],
    conflictPaths: [],
    operations: [],
  };

  const desired = await collectDesiredItems(
    repoRoot,
    config.dirs,
    resolvedProfile,
    config.excludes,
    config.rootPath,
  );

  if (options.rebuild) {
    for (const record of Object.values(state.records)) {
      const existed = await pathExists(record.targetPath);
      if (existed) {
        if (!options.dryRun) {
          await removeManagedPath(record.targetPath);
        }
        result.deleted += 1;
        pushOperation(result, 'delete', record.relativePath, 'rebuild 清理');
      }
    }
    state = {
      version: 1,
      profile: resolvedProfile ?? null,
      repoRoot,
      rootPath: config.rootPath,
      records: {},
    };
  }

  const nextRecords = await removeStaleRecords(state, desired, Boolean(options.dryRun), result);

  for (const item of desired.values()) {
    try {
      const targetExists = await pathExists(item.targetPath);
      const currentRecord = state.records[item.relativePath];
      if (!targetExists) {
        if (!options.dryRun) {
          await createManagedLink(item.sourcePath, item.targetPath);
        }
        result.created += 1;
        pushOperation(result, 'create', item.relativePath);
        nextRecords[item.relativePath] = toRecord(item);
        continue;
      }

      if (!currentRecord) {
        result.conflicts += 1;
        result.conflictPaths.push(item.relativePath);
        pushOperation(result, 'conflict', item.relativePath, '目标位置已存在非托管内容');
        continue;
      }

      const linkDestination = await readLinkDestination(item.targetPath);
      const normalizedExpected = path.normalize(item.sourcePath);
      const normalizedCurrent = linkDestination ? path.normalize(linkDestination) : null;

      if (
        normalizedCurrent === normalizedExpected &&
        currentRecord.sourceDescriptor === item.sourceDescriptor
      ) {
        result.skipped += 1;
        pushOperation(result, 'skip', item.relativePath);
        nextRecords[item.relativePath] = toRecord(item);
        continue;
      }

      if (!options.dryRun) {
        await removeManagedPath(item.targetPath);
        await createManagedLink(item.sourcePath, item.targetPath);
      }
      result.updated += 1;
      pushOperation(result, 'update', item.relativePath);
      nextRecords[item.relativePath] = toRecord(item);
    } catch (error) {
      result.errors += 1;
      const message = `${item.relativePath}: ${(error as Error).message}`;
      result.invalid.push(message);
      pushOperation(result, 'error', item.relativePath, (error as Error).message);
    }
  }

  const nextState: SyncState = {
    version: 1,
    profile: resolvedProfile ?? null,
    repoRoot,
    rootPath: config.rootPath,
    records: nextRecords,
  };

  if (!options.dryRun) {
    await saveSyncState(nextState);
  }

  return result;
}
