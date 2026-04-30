import { promises as fs } from 'node:fs';
import path from 'node:path';

import { CONFIG_FILE } from '../core/config';
import { loadMachineConfig, saveMachineConfig } from '../core/machine';
import { loadSyncState } from '../core/state';
import { pathExists } from '../utils/fs';

const DEFAULT_DIRS = ['skills', 'rules', 'agents', 'hooks', 'plugins'];

const DEFAULT_CONFIG = `[profile]

[dirs]
skills
rules
agents
hooks
plugins

[exclude]
skills/*-workspace
`;

export async function runInit(repoRoot: string): Promise<{ createdPaths: string[] }> {
  const configPath = path.join(repoRoot, CONFIG_FILE);
  const machine = await loadMachineConfig();
  const syncState = await loadSyncState();
  if (
    machine.activeRepo &&
    path.normalize(machine.activeRepo) !== path.normalize(repoRoot) &&
    Object.keys(syncState.records).length > 0
  ) {
    throw new Error('当前机器已有激活仓库，请先在原仓库执行 agent-profile remove --all，再执行 agent-profile detach');
  }

  const createdPaths: string[] = [];
  if (!(await pathExists(configPath))) {
    await fs.writeFile(configPath, DEFAULT_CONFIG, 'utf8');
    createdPaths.push(CONFIG_FILE);

    const assetsRoot = path.join(repoRoot, 'assets');
    await fs.mkdir(assetsRoot, { recursive: true });
    createdPaths.push('assets');

    for (const dirName of DEFAULT_DIRS) {
      await fs.mkdir(path.join(assetsRoot, dirName), { recursive: true });
      createdPaths.push(`assets/${dirName}`);
    }

    await fs.mkdir(path.join(repoRoot, 'profiles'), { recursive: true });
    createdPaths.push('profiles');
  }

  await saveMachineConfig({
    version: machine.version ?? 1,
    activeRepo: repoRoot,
  });
  createdPaths.push(`activeRepo=${repoRoot}`);

  return { createdPaths };
}
