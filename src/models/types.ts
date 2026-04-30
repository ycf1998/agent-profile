export type SourceDescriptor = 'base' | `profile:${string}`;

export interface RepoConfig {
  defaultProfile: string | null;
  dirs: string[];
  excludes: string[];
  rootPath: string;
}

export interface SyncRecord {
  relativePath: string;
  sourceDescriptor: SourceDescriptor;
  sourcePath: string;
  targetPath: string;
  itemType: 'file' | 'dir';
}

export interface SyncState {
  version: number;
  profile: string | null;
  repoRoot: string;
  rootPath: string;
  records: Record<string, SyncRecord>;
}

export interface MachineConfig {
  version: number;
  activeRepo: string | null;
}

export interface DesiredItem {
  relativePath: string;
  sourceDescriptor: SourceDescriptor;
  sourcePath: string;
  targetPath: string;
  itemType: 'file' | 'dir';
}

export interface ActionCounters {
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
  conflicts: number;
  errors: number;
}

export interface SyncOperation {
  kind: 'create' | 'update' | 'delete' | 'skip' | 'conflict' | 'error';
  relativePath: string;
  detail?: string;
}

export interface SyncResult extends ActionCounters {
  invalid: string[];
  conflictPaths: string[];
  operations: SyncOperation[];
}

export interface RemoveResult extends ActionCounters {
  removedPaths: string[];
  excludeAdded?: string | null;
}

export interface StatusResult {
  profile: string | null;
  repoRoot: string;
  rootPath: string;
  managedCount: number;
  baseCount: number;
  profileCount: number;
  invalidPaths: string[];
  conflictPaths: string[];
  managedPaths: string[];
}
