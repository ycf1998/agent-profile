import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { SyncRecord, SyncState } from '../models/types';
import { ensureMachineDir } from './machine';

const EMPTY_STATE: SyncState = {
  version: 1,
  profile: null,
  repoRoot: '',
  rootPath: '',
  records: {},
};

const STATE_FILE = 'state.json';

function getStatePath(): string {
  if (process.env.CLAUDE_PROFILE_STRICT_TEST === '1' && !process.env.CLAUDE_PROFILE_HOME) {
    throw new Error('Test mode requires CLAUDE_PROFILE_HOME to be set');
  }
  const baseDir = process.env.CLAUDE_PROFILE_HOME
    ? process.env.CLAUDE_PROFILE_HOME
    : path.join(os.homedir(), '.agent-profile');
  return path.join(baseDir, STATE_FILE);
}

export async function loadSyncState(): Promise<SyncState> {
  const statePath = getStatePath();
  try {
    const content = await fs.readFile(statePath, 'utf8');
    const parsed = JSON.parse(content) as SyncState;
    return {
      version: parsed.version ?? 1,
      profile: parsed.profile ?? null,
      repoRoot: parsed.repoRoot ?? '',
      rootPath: parsed.rootPath ?? '',
      records: parsed.records ?? {},
    };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      return { ...EMPTY_STATE, records: {} };
    }
    throw error;
  }
}

export async function saveSyncState(state: SyncState): Promise<void> {
  await ensureMachineDir();
  const statePath = getStatePath();
  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export async function deleteSyncState(): Promise<void> {
  const statePath = getStatePath();
  try {
    await fs.unlink(statePath);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== 'ENOENT') {
      throw error;
    }
  }
}
