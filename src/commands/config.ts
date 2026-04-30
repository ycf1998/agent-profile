import { spawn } from 'node:child_process';
import path from 'node:path';

import { CONFIG_FILE } from '../core/config';

export async function runConfig(repoRoot: string): Promise<{ configPath: string }> {
  const configPath = path.join(repoRoot, CONFIG_FILE);

  if (process.platform === 'win32') {
    spawn('notepad', [configPath], {
      detached: true,
      stdio: 'ignore',
    }).unref();
  } else {
    throw new Error('config 命令当前只支持 Windows');
  }

  return { configPath };
}
