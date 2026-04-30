import path from 'node:path';

import { promises as fs } from 'node:fs';

import type { DesiredItem } from '../models/types';
import { listImmediateChildren } from '../utils/fs';
import { createGlobMatchers, matchesAnyPattern } from './patterns';

function normalizeRelativePath(dirName: string, itemName: string): string {
  return path.posix.join(dirName, itemName);
}

function buildDesiredItem(
  dirName: string,
  itemName: string,
  sourceRoot: string,
  targetRoot: string,
  sourceDescriptor: DesiredItem['sourceDescriptor'],
  itemType: DesiredItem['itemType'],
): DesiredItem {
  const relativePath = normalizeRelativePath(dirName, itemName);
  return {
    relativePath,
    sourceDescriptor,
    sourcePath: path.join(sourceRoot, itemName),
    targetPath: path.join(targetRoot, itemName),
    itemType,
  };
}

export async function collectDesiredItems(
  repoRoot: string,
  dirs: string[],
  profile: string | null,
  excludes: string[],
  rootPath: string,
): Promise<Map<string, DesiredItem>> {
  const excludeMatchers = createGlobMatchers(excludes);
  const desired = new Map<string, DesiredItem>();

  for (const dirName of dirs) {
    const baseDir = path.join(repoRoot, 'assets', dirName);
    for (const itemName of await listImmediateChildren(baseDir)) {
      const sourcePath = path.join(baseDir, itemName);
      const stats = await fs.lstat(sourcePath);
      const item = buildDesiredItem(
        dirName,
        itemName,
        baseDir,
        path.join(rootPath, dirName),
        'base',
        stats.isDirectory() ? 'dir' : 'file',
      );
      desired.set(item.relativePath, item);
    }

    if (profile) {
      const profileDir = path.join(repoRoot, 'profiles', profile, dirName);
      for (const itemName of await listImmediateChildren(profileDir)) {
        const sourcePath = path.join(profileDir, itemName);
        const stats = await fs.lstat(sourcePath);
        const item = buildDesiredItem(
          dirName,
          itemName,
          profileDir,
          path.join(rootPath, dirName),
          `profile:${profile}`,
          stats.isDirectory() ? 'dir' : 'file',
        );
        desired.set(item.relativePath, item);
      }
    }
  }

  for (const [relativePath] of Array.from(desired.entries())) {
    if (matchesAnyPattern(relativePath, excludeMatchers)) {
      desired.delete(relativePath);
    }
  }

  return desired;
}

export async function collectCandidateRelativePaths(
  repoRoot: string,
  dirs: string[],
  profile: string | null,
  excludes: string[],
): Promise<string[]> {
  const excludeMatchers = createGlobMatchers(excludes);
  const candidates = new Set<string>();

  for (const dirName of dirs) {
    const roots = [path.join(repoRoot, 'assets', dirName)];
    if (profile) {
      roots.push(path.join(repoRoot, 'profiles', profile, dirName));
    }

    for (const currentDir of roots) {
      for (const itemName of await listImmediateChildren(currentDir)) {
        const relativePath = normalizeRelativePath(dirName, itemName);
        if (!matchesAnyPattern(relativePath, excludeMatchers)) {
          candidates.add(relativePath);
        }
      }
    }
  }

  return Array.from(candidates).sort();
}
