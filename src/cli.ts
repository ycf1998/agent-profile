#!/usr/bin/env node
import { Command } from 'commander';
import process from 'node:process';

import { runConfig } from './commands/config';
import { runDetach } from './commands/detach';
import { runInit } from './commands/init';
import { runRemove } from './commands/remove';
import { runStatus } from './commands/status';
import { runSync } from './commands/sync';
import { getActiveRepoOrThrow } from './core/machine';

function formatHelp(command: Command, helper: ReturnType<Command['createHelp']>): string {
  const lines: string[] = [];
  const commandUsage = helper.commandUsage(command);
  lines.push(`用法：${commandUsage}`);

  const description = command.description();
  if (description) {
    lines.push('');
    lines.push(description);
  }

  const options = helper.visibleOptions(command);
  if (options.length > 0) {
    lines.push('');
    lines.push('选项：');
    for (const option of options) {
      lines.push(`  ${helper.optionTerm(option)}  ${option.description ?? ''}`.trimEnd());
    }
  }

  const commands = helper.visibleCommands(command);
  if (commands.length > 0) {
    lines.push('');
    lines.push('命令：');
    for (const subcommand of commands) {
      lines.push(`  ${helper.subcommandTerm(subcommand)}  ${subcommand.description()}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

function applyChineseHelp(command: Command): Command {
  command.helpOption('-h, --help', '显示帮助');
  command.helpInformation = function helpInformation(): string {
    return formatHelp(this, this.createHelp());
  };
  command.configureHelp({
    formatHelp,
  });
  return command;
}

function printDivider(): void {
  console.log('--------------------------------------------');
}

function printTitle(title: string): void {
  console.log('============================================');
  console.log(`  ${title}`);
  console.log('============================================');
}

function formatSyncSummary(result: {
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
  conflicts: number;
  errors: number;
}): string {
  const parts = [`新建=${result.created}`];
  if (result.updated > 0) {
    parts.push(`更新=${result.updated}`);
  }
  if (result.deleted > 0) {
    parts.push(`删除=${result.deleted}`);
  }
  if (result.skipped > 0) {
    parts.push(`跳过=${result.skipped}`);
  }
  if (result.conflicts > 0) {
    parts.push(`冲突=${result.conflicts}`);
  }
  if (result.errors > 0) {
    parts.push(`错误=${result.errors}`);
  }
  return parts.join(', ');
}

function humanizeOperationDetail(detail?: string): string | null {
  if (!detail) {
    return null;
  }
  if (detail.includes('EPERM: operation not permitted, symlink')) {
    return '创建链接失败，通常是权限不足。Windows 下文件软链接通常需要管理员权限或开启开发者模式。';
  }
  return detail;
}

function printSyncResult(result: {
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
  conflicts: number;
  errors: number;
  conflictPaths: string[];
  invalid: string[];
  operations: Array<{
    kind: 'create' | 'update' | 'delete' | 'skip' | 'conflict' | 'error';
    relativePath: string;
    detail?: string;
  }>;
}, dryRun: boolean): void {
  printTitle(dryRun ? 'Agent Profile Dry Run' : 'Agent Profile Sync');
  if (dryRun) {
    console.log('[DRY RUN] 仅预览，不实际写入');
    console.log();
  }

  console.log(`同步完成: ${formatSyncSummary(result)}`);

  if (result.operations.length > 0) {
    console.log();
    printDivider();
    console.log('操作明细');
    printDivider();
    for (const operation of result.operations) {
      const symbol = {
        create: '✓ 新建',
        update: '✓ 更新',
        delete: '✓ 删除',
        skip: '- 跳过',
        conflict: '! 冲突',
        error: '✗ 失败',
      }[operation.kind];
      const detail = humanizeOperationDetail(operation.detail);
      if (detail) {
        console.log(`  ${symbol}: ${operation.relativePath} (${detail})`);
      } else {
        console.log(`  ${symbol}: ${operation.relativePath}`);
      }
    }
  }

}

function printRemoveResult(result: {
  deleted: number;
  skipped: number;
  errors: number;
  removedPaths: string[];
  excludeAdded?: string | null;
}): void {
  printTitle('Agent Profile Remove');

  if (result.removedPaths.length > 0 || result.skipped > 0) {
    console.log('[REMOVE]');
    for (const item of result.removedPaths) {
      console.log(`  ✓ 删除: ${item}`);
    }
  }

  console.log();
  printDivider();
  console.log(`移除完成: 删除=${result.deleted}, 跳过=${result.skipped}, 错误=${result.errors}`);
  if (result.excludeAdded) {
    console.log(`已写入 exclude: ${result.excludeAdded}`);
  }
}

function printStatusResult(result: {
  profile: string | null;
  repoRoot: string;
  rootPath: string;
  managedCount: number;
  baseCount: number;
  profileCount: number;
  invalidPaths: string[];
  conflictPaths: string[];
  managedPaths: string[];
}): void {
  printTitle('Agent Profile Status');
  console.log(`Profile: ${result.profile ?? '(无)'}`);
  console.log(`Repo:    ${result.repoRoot}`);
  console.log(`Claude:  ${result.rootPath}`);
  console.log();
  if (result.managedCount === 0) {
    console.log('当前没有任何已托管项');
    if (result.conflictPaths.length > 0) {
      console.log();
      printDivider();
      console.log('冲突项');
      printDivider();
      result.conflictPaths.forEach((item) => console.log(`  ! ${item} (目标位置已有非托管内容)`));
    }
    return;
  }
  console.log(
    `统计: 总计=${result.managedCount}  base=${result.baseCount}  profile=${result.profileCount}  失效=${result.invalidPaths.length}  冲突=${result.conflictPaths.length}`,
  );

  console.log();
  printDivider();
  console.log('托管项');
  printDivider();
  result.managedPaths.forEach((item) => console.log(`  ✓ ${item}`));

  if (result.invalidPaths.length > 0) {
    console.log();
    printDivider();
    console.log('失效项');
    printDivider();
    result.invalidPaths.forEach((item) => console.log(`  ! ${item}`));
  }

  if (result.conflictPaths.length > 0) {
    console.log();
    printDivider();
    console.log('冲突项');
    printDivider();
    result.conflictPaths.forEach((item) => console.log(`  ! ${item} (目标位置已有非托管内容)`));
  }
}

async function main(): Promise<void> {
  const program = applyChineseHelp(new Command());
  program.name('agent-profile').description('Claude Code 本地配置资产挂载工具');
  program.addHelpCommand('help [command]', '显示命令帮助');

  applyChineseHelp(
    program
    .command('init')
    .description('初始化或激活当前目录为 agent-profile 仓库')
    .action(async () => {
      const result = await runInit(process.cwd());
      printTitle('Agent Profile Init');
      result.createdPaths.forEach((item) => console.log(`  ✓ ${item}`));
    }),
  );

  applyChineseHelp(
    program
    .command('config')
    .description('打开当前激活仓库的 agent-profile.conf')
    .action(async () => {
      const repoRoot = await getActiveRepoOrThrow();
      const result = await runConfig(repoRoot);
      printTitle('Agent Profile Config');
      console.log(`已打开: ${result.configPath}`);
    }),
  );

  applyChineseHelp(
    program
    .command('detach')
    .description('解绑当前激活仓库，要求当前没有已托管项')
    .action(async () => {
      await runDetach();
      printTitle('Agent Profile Detach');
      console.log('已解除当前激活仓库');
    }),
  );

  applyChineseHelp(
    program
    .command('sync')
    .description('将当前激活仓库中的资产挂载到 Claude 目录')
    .option('--profile <name>')
    .option('--rebuild', '先清理当前托管项，再重新同步')
    .option('--dry-run', '仅预览同步结果，不实际写入')
    .action(async (options) => {
      const repoRoot = await getActiveRepoOrThrow();
      const result = await runSync({
        repoRoot,
        profile: options.profile,
        rebuild: Boolean(options.rebuild),
        dryRun: Boolean(options.dryRun),
      });
      printSyncResult(result, Boolean(options.dryRun));
      process.exitCode = result.errors > 0 ? 1 : 0;
    }),
  );

  applyChineseHelp(
    program
    .command('remove')
    .description('移除当前激活仓库托管的链接')
    .argument('[managedPath]')
    .option('--all', '移除全部托管链接')
    .option('--once', '只移除当前挂载，不写入 exclude')
    .action(async (managedPath, options) => {
      const repoRoot = await getActiveRepoOrThrow();
      const result = await runRemove({
        repoRoot,
        managedPath,
        all: Boolean(options.all),
        once: Boolean(options.once),
      });
      printRemoveResult(result);
    }),
  );

  applyChineseHelp(
    program
    .command('status')
    .description('显示当前激活仓库的托管状态、失效项和冲突项')
    .action(async () => {
      const repoRoot = await getActiveRepoOrThrow();
      const result = await runStatus(repoRoot);
      printStatusResult(result);
    }),
  );

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
