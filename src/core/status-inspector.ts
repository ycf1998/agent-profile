import path from 'node:path';

import type { StatusResult, SyncState } from '../models/types';
import { pathExists, readLinkDestination } from '../utils/fs';

export async function inspectManagedRecords(
  state: SyncState,
): Promise<Pick<StatusResult, 'managedCount' | 'baseCount' | 'profileCount' | 'invalidPaths' | 'managedPaths'>> {
  const invalidPaths: string[] = [];
  const managedPaths: string[] = [];
  let baseCount = 0;
  let profileCount = 0;

  for (const record of Object.values(state.records)) {
    const exists = await pathExists(record.targetPath);
    if (!exists) {
      invalidPaths.push(record.relativePath);
      continue;
    }

    const destination = await readLinkDestination(record.targetPath);
    if (destination && path.normalize(destination) !== path.normalize(record.sourcePath)) {
      invalidPaths.push(record.relativePath);
      continue;
    }

    if (record.sourceDescriptor === 'base') {
      baseCount += 1;
    } else {
      profileCount += 1;
    }
    managedPaths.push(record.relativePath);
  }

  return {
    managedCount: Object.keys(state.records).length,
    baseCount,
    profileCount,
    invalidPaths,
    managedPaths: managedPaths.sort(),
  };
}

export async function detectConflictPaths(
  candidateRelativePaths: string[],
  state: SyncState,
  rootPath: string,
): Promise<string[]> {
  const conflictPaths: string[] = [];

  for (const relativePath of candidateRelativePaths) {
    const [dirName, itemName] = relativePath.split('/');
    const targetPath = path.join(rootPath, dirName, itemName);
    const exists = await pathExists(targetPath);
    if (!exists) {
      continue;
    }

    if (!state.records[relativePath]) {
      conflictPaths.push(relativePath);
    }
  }

  return conflictPaths;
}
