export interface IniData {
  sections: Map<string, string[]>;
  keyedSections: Map<string, Record<string, string>>;
}

function stripComment(line: string): string {
  const trimmed = line.trim();
  if (trimmed.startsWith('#') || trimmed.startsWith(';')) {
    return '';
  }
  return line;
}

export function parseIniLike(content: string): IniData {
  const sections = new Map<string, string[]>();
  const keyedSections = new Map<string, Record<string, string>>();
  let currentSection = '';

  const ensureSection = (name: string): void => {
    if (!sections.has(name)) {
      sections.set(name, []);
    }
    if (!keyedSections.has(name)) {
      keyedSections.set(name, {});
    }
  };

  ensureSection(currentSection);

  for (const rawLine of content.split(/\r?\n/)) {
    const lineWithoutComment = stripComment(rawLine);
    const line = lineWithoutComment.trim();
    if (!line) {
      continue;
    }

    const sectionMatch = line.match(/^\[(.+)]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      ensureSection(currentSection);
      continue;
    }

    ensureSection(currentSection);
    const keyValueIndex = line.indexOf('=');
    if (keyValueIndex >= 0) {
      const key = line.slice(0, keyValueIndex).trim();
      const value = line.slice(keyValueIndex + 1).trim();
      keyedSections.get(currentSection)![key] = value;
    } else {
      sections.get(currentSection)!.push(line);
    }
  }

  return { sections, keyedSections };
}

export function serializeIniLike(
  plainSections: Array<[string, string[]]>,
  keyedSections: Array<[string, Record<string, string>]>,
): string {
  const parts: string[] = [];
  const keyedMap = new Map(keyedSections);

  for (const [section, lines] of plainSections) {
    parts.push(`[${section}]`);
    for (const line of lines) {
      parts.push(line);
    }
    const keyed = keyedMap.get(section);
    if (keyed) {
      for (const [key, value] of Object.entries(keyed)) {
        parts.push(`${key}=${value}`);
      }
      keyedMap.delete(section);
    }
    parts.push('');
  }

  for (const [section, keyed] of keyedMap.entries()) {
    parts.push(`[${section}]`);
    for (const [key, value] of Object.entries(keyed)) {
      parts.push(`${key}=${value}`);
    }
    parts.push('');
  }

  return `${parts.join('\n').trimEnd()}\n`;
}
