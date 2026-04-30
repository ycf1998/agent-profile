import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

import { runDetach } from '../commands/detach';
import { runInit } from '../commands/init';
import { runRemove } from '../commands/remove';
import { runStatus } from '../commands/status';
import { runSync } from '../commands/sync';
import { loadMachineConfig, saveMachineConfig } from '../core/machine';
import { deleteSyncState } from '../core/state';

async function makeRepo(): Promise<{ repoRoot: string; targetRoot: string }> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-profile-'));
  const repoRoot = path.join(base, 'repo');
  const targetRoot = path.join(base, 'target');
  await fs.mkdir(repoRoot, { recursive: true });
  await fs.mkdir(targetRoot, { recursive: true });
  process.env.CLAUDE_PROFILE_HOME = path.join(base, '.agent-profile-state');
  process.env.CLAUDE_PROFILE_STRICT_TEST = '1';
  return { repoRoot, targetRoot };
}

async function resetMachineState(): Promise<void> {
  if (!process.env.CLAUDE_PROFILE_HOME) {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-profile-machine-'));
    process.env.CLAUDE_PROFILE_HOME = path.join(base, '.agent-profile-state');
  }
  process.env.CLAUDE_PROFILE_STRICT_TEST = '1';
  await saveMachineConfig({ version: 1, activeRepo: null });
  await deleteSyncState();
}

async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

async function writeDirectoryAsset(dirPath: string, fileName = 'README.md'): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
  await fs.writeFile(path.join(dirPath, fileName), 'content', 'utf8');
}

async function seedConfig(repoRoot: string, targetRoot: string, extra = ''): Promise<void> {
  await writeFile(
    path.join(repoRoot, 'agent-profile.conf'),
    `[dirs]
skills

[claude]
root=${targetRoot}

${extra}`.trim() + '\n',
  );
}

async function testSyncCreatesManagedLinks(): Promise<void> {
  await resetMachineState();
  const { repoRoot, targetRoot } = await makeRepo();
  await seedConfig(repoRoot, targetRoot);
  await runInit(repoRoot);
  await writeDirectoryAsset(path.join(repoRoot, 'assets', 'skills', 'hello'));

  const result = await runSync({ repoRoot });
  assert.equal(result.created, 1);

  const targetPath = path.join(targetRoot, 'skills', 'hello');
  const stats = await fs.lstat(targetPath);
  assert.equal(stats.isSymbolicLink(), true);

  const status = await runStatus(repoRoot);
  assert.equal(status.managedCount, 1);
  assert.equal(status.invalidPaths.length, 0);
  assert.deepEqual(status.managedPaths, ['skills/hello']);
}

async function testProfileOverridesBaseAsset(): Promise<void> {
  await resetMachineState();
  const { repoRoot, targetRoot } = await makeRepo();
  await seedConfig(
    repoRoot,
    targetRoot,
    `
[profile]
work
`,
  );
  await runInit(repoRoot);
  await writeDirectoryAsset(path.join(repoRoot, 'assets', 'skills', 'tool'));
  await writeDirectoryAsset(path.join(repoRoot, 'profiles', 'work', 'skills', 'tool'));

  const result = await runSync({ repoRoot });
  assert.equal(result.created, 1);

  const destination = await fs.readlink(path.join(targetRoot, 'skills', 'tool'));
  assert.equal(
    path.normalize(destination),
    path.normalize(path.join(repoRoot, 'profiles', 'work', 'skills', 'tool')),
  );
}

async function testExcludeRemovesManagedItem(): Promise<void> {
  await resetMachineState();
  const { repoRoot, targetRoot } = await makeRepo();
  await seedConfig(repoRoot, targetRoot);
  await runInit(repoRoot);
  await writeDirectoryAsset(path.join(repoRoot, 'assets', 'skills', 'drop'));

  await runSync({ repoRoot });
  await seedConfig(
    repoRoot,
    targetRoot,
    `
[exclude]
skills/drop
`,
  );

  const result = await runSync({ repoRoot });
  assert.equal(result.deleted, 1);
  await assert.rejects(fs.lstat(path.join(targetRoot, 'skills', 'drop')));
}

async function testEmptyDirsMeansCleanupOnly(): Promise<void> {
  await resetMachineState();
  const { repoRoot, targetRoot } = await makeRepo();
  await writeFile(
    path.join(repoRoot, 'agent-profile.conf'),
    `[claude]
root=${targetRoot}
`,
  );
  await writeFile(path.join(repoRoot, 'assets', 'skills', 'unused.txt'), 'x');
  let result = await runSync({ repoRoot });
  assert.equal(result.created, 0);

  await saveMachineConfig({ version: 1, activeRepo: repoRoot });
  const machineDir = process.env.CLAUDE_PROFILE_HOME!;
  await fs.mkdir(machineDir, { recursive: true });
  await writeFile(
    path.join(machineDir, 'state.json'),
    `${JSON.stringify({
      version: 1,
      profile: null,
      repoRoot,
      rootPath: targetRoot,
      records: {
        'skills/legacy.txt': {
          relativePath: 'skills/legacy.txt',
          sourceDescriptor: 'base',
          sourcePath: path.join(repoRoot, 'assets', 'skills', 'legacy.txt'),
          targetPath: path.join(targetRoot, 'skills', 'legacy.txt'),
          itemType: 'file',
        },
      },
    }, null, 2)}\n`,
  );
  await writeFile(path.join(targetRoot, 'skills', 'legacy.txt'), 'old');
  result = await runSync({ repoRoot });
  assert.equal(result.deleted, 1);
}

async function testRemoveWritesExcludeByDefault(): Promise<void> {
  await resetMachineState();
  const { repoRoot, targetRoot } = await makeRepo();
  await seedConfig(repoRoot, targetRoot);
  await runInit(repoRoot);
  await writeDirectoryAsset(path.join(repoRoot, 'assets', 'skills', 'one'));
  await runSync({ repoRoot });

  const result = await runRemove({ repoRoot, managedPath: 'skills/one' });
  assert.equal(result.deleted, 1);

  const configContent = await fs.readFile(path.join(repoRoot, 'agent-profile.conf'), 'utf8');
  assert.match(configContent, /\[exclude][\s\S]*skills\/one/);
}

async function testStatusReportsConflict(): Promise<void> {
  await resetMachineState();
  const { repoRoot, targetRoot } = await makeRepo();
  await seedConfig(repoRoot, targetRoot);
  await runInit(repoRoot);
  await writeFile(path.join(repoRoot, 'assets', 'skills', 'conflict.txt'), 'x');
  await writeFile(path.join(targetRoot, 'skills', 'conflict.txt'), 'existing');

  const result = await runStatus(repoRoot);
  assert.deepEqual(result.conflictPaths, ['skills/conflict.txt']);
}

async function testInitCreatesDefaultSkeleton(): Promise<void> {
  await resetMachineState();
  const { repoRoot } = await makeRepo();
  const result = await runInit(repoRoot);
  assert.equal(result.createdPaths.includes('agent-profile.conf'), true);
  const configContent = await fs.readFile(path.join(repoRoot, 'agent-profile.conf'), 'utf8');
  assert.match(configContent, /\[dirs][\s\S]*skills[\s\S]*plugins/);
  await fs.access(path.join(repoRoot, 'assets', 'skills'));
  await fs.access(path.join(repoRoot, 'profiles'));
  const machine = await loadMachineConfig();
  assert.equal(machine.activeRepo, repoRoot);
}

async function testDetachRequiresEmptyState(): Promise<void> {
  await resetMachineState();
  const { repoRoot, targetRoot } = await makeRepo();
  await seedConfig(repoRoot, targetRoot);
  await runInit(repoRoot);
  await writeDirectoryAsset(path.join(repoRoot, 'assets', 'skills', 'one'));
  await runSync({ repoRoot });
  await assert.rejects(runDetach());
  await runRemove({ repoRoot, all: true });
  await runDetach();
  const machine = await loadMachineConfig();
  assert.equal(machine.activeRepo, null);
}

async function testRemoveAllRequiresExplicitFlag(): Promise<void> {
  await resetMachineState();
  const { repoRoot } = await makeRepo();
  await assert.rejects(runRemove({ repoRoot }));
}

async function main(): Promise<void> {
  const tests: Array<[string, () => Promise<void>]> = [
    ['sync creates managed links and state', testSyncCreatesManagedLinks],
    ['profile overrides base asset with same relative path', testProfileOverridesBaseAsset],
    ['exclude removes managed item on later sync', testExcludeRemovesManagedItem],
    ['dirs omitted means sync empty set and stale cleanup', testEmptyDirsMeansCleanupOnly],
    ['remove writes exclude by default', testRemoveWritesExcludeByDefault],
    ['status reports conflict for unmanaged target path', testStatusReportsConflict],
    ['init creates default skeleton', testInitCreatesDefaultSkeleton],
    ['detach requires empty state', testDetachRequiresEmptyState],
    ['remove all requires explicit flag', testRemoveAllRequiresExplicitFlag],
  ];

  for (const [name, run] of tests) {
    await run();
    console.log(`ok - ${name}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
