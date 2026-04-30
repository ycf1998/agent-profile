import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parseIniLike, serializeIniLike } from '../utils/ini';
import type { RepoConfig } from '../models/types';

export const CONFIG_FILE = 'agent-profile.conf';
export const STATE_FILE = 'sync-state';

function defaultClaudeRoot(): string {
  return path.join(os.homedir(), '.claude');
}

export async function loadRepoConfig(repoRoot: string): Promise<RepoConfig> {
  const configPath = path.join(repoRoot, CONFIG_FILE);
  let content: string;
  try {
    content = await fs.readFile(configPath, 'utf8');
  } catch (error) {
    throw new Error(`Missing ${CONFIG_FILE} in ${repoRoot}`);
  }

  const parsed = parseIniLike(content);
  const profileLines = parsed.sections.get('profile') ?? [];
  const dirLines = parsed.sections.get('dirs') ?? [];
  const excludeLines = parsed.sections.get('exclude') ?? [];
  const defaultProfile = profileLines[0] ?? null;
  const claudeSection = parsed.keyedSections.get('claude') ?? {};
  const rootPath = claudeSection.root
    ? path.resolve(repoRoot, claudeSection.root)
    : defaultClaudeRoot();

  return {
    defaultProfile,
    dirs: dirLines,
    excludes: excludeLines,
    rootPath,
  };
}

export async function addExcludeRule(repoRoot: string, managedPath: string): Promise<void> {
  const configPath = path.join(repoRoot, CONFIG_FILE);
  const content = await fs.readFile(configPath, 'utf8');
  const parsed = parseIniLike(content);
  const excludes = parsed.sections.get('exclude') ?? [];
  if (excludes.includes(managedPath)) {
    return;
  }

  excludes.push(managedPath);

  const plainSections: Array<[string, string[]]> = [];
  for (const [section, lines] of parsed.sections.entries()) {
    plainSections.push([section, section === 'exclude' ? excludes : lines]);
  }
  if (!parsed.sections.has('exclude')) {
    plainSections.push(['exclude', excludes]);
  }

  const keyedSections = Array.from(parsed.keyedSections.entries());
  const output = serializeIniLike(plainSections, keyedSections);
  await fs.writeFile(configPath, output, 'utf8');
}
