import { collectCandidateRelativePaths } from '../core/asset-discovery';
import { loadRepoConfig } from '../core/config';
import { detectConflictPaths, inspectManagedRecords } from '../core/status-inspector';
import { loadSyncState } from '../core/state';
import type { StatusResult } from '../models/types';

export async function runStatus(repoRoot: string): Promise<StatusResult> {
  const config = await loadRepoConfig(repoRoot);
  const state = await loadSyncState();
  const managed = await inspectManagedRecords(state);
  const candidateRelativePaths = await collectCandidateRelativePaths(
    repoRoot,
    config.dirs,
    state.profile ?? config.defaultProfile,
    config.excludes,
  );
  const conflictPaths = await detectConflictPaths(candidateRelativePaths, state, config.rootPath);

  return {
    profile: state.profile ?? config.defaultProfile,
    repoRoot,
    rootPath: config.rootPath,
    managedCount: managed.managedCount,
    baseCount: managed.baseCount,
    profileCount: managed.profileCount,
    invalidPaths: managed.invalidPaths,
    conflictPaths,
    managedPaths: managed.managedPaths,
  };
}
