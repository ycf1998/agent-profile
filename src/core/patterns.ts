function escapeRegex(value: string): string {
  return value.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

export function globToRegex(pattern: string): RegExp {
  const regex = escapeRegex(pattern).replace(/\\\*/g, '.*');
  return new RegExp(`^${regex}$`);
}

export function createGlobMatchers(patterns: string[]): RegExp[] {
  return patterns.map(globToRegex);
}

export function matchesAnyPattern(value: string, matchers: RegExp[]): boolean {
  return matchers.some((matcher) => matcher.test(value));
}
