import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { MachineConfig } from '../models/types';

const MACHINE_DIR = '.agent-profile';
const MACHINE_CONFIG_FILE = 'machine-config.json';

function getMachineDir(): string {
  if (process.env.CLAUDE_PROFILE_STRICT_TEST === '1' && !process.env.CLAUDE_PROFILE_HOME) {
    throw new Error('Test mode requires CLAUDE_PROFILE_HOME to be set');
  }
  if (process.env.CLAUDE_PROFILE_HOME) {
    return process.env.CLAUDE_PROFILE_HOME;
  }
  return path.join(os.homedir(), MACHINE_DIR);
}

function getMachineConfigPath(): string {
  return path.join(getMachineDir(), MACHINE_CONFIG_FILE);
}

export async function ensureMachineDir(): Promise<string> {
  const dir = getMachineDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function loadMachineConfig(): Promise<MachineConfig> {
  const configPath = getMachineConfigPath();
  try {
    const content = await fs.readFile(configPath, 'utf8');
    const parsed = JSON.parse(content) as MachineConfig;
    return {
      version: parsed.version ?? 1,
      activeRepo: parsed.activeRepo ?? null,
    };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      return { version: 1, activeRepo: null };
    }
    throw error;
  }
}

export async function saveMachineConfig(config: MachineConfig): Promise<void> {
  await ensureMachineDir();
  const configPath = getMachineConfigPath();
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

export async function getActiveRepoOrThrow(): Promise<string> {
  const config = await loadMachineConfig();
  if (!config.activeRepo) {
    throw new Error('当前没有激活的 agent-profile 仓库，请先在仓库目录执行 agent-profile init');
  }

  try {
    const stats = await fs.stat(config.activeRepo);
    if (!stats.isDirectory()) {
      throw new Error('not directory');
    }
  } catch {
    throw new Error(`当前激活仓库不存在: ${config.activeRepo}`);
  }

  return config.activeRepo;
}
