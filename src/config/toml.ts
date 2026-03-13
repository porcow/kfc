type TomlValue =
  | string
  | number
  | boolean
  | TomlValue[]
  | Record<string, TomlValue>;

function stripComment(line: string): string {
  let inString = false;
  let escaped = false;
  let result = '';

  for (const character of line) {
    if (character === '"' && !escaped) {
      inString = !inString;
    }
    if (character === '#' && !inString) {
      break;
    }
    result += character;
    escaped = character === '\\' && !escaped;
    if (character !== '\\') {
      escaped = false;
    }
  }

  return result.trim();
}

function splitArrayItems(content: string): string[] {
  const items: string[] = [];
  let current = '';
  let inString = false;
  let escaped = false;

  for (const character of content) {
    if (character === '"' && !escaped) {
      inString = !inString;
    }
    if (character === ',' && !inString) {
      items.push(current.trim());
      current = '';
    } else {
      current += character;
    }
    escaped = character === '\\' && !escaped;
    if (character !== '\\') {
      escaped = false;
    }
  }

  if (current.trim()) {
    items.push(current.trim());
  }

  return items;
}

function parseString(value: string): string {
  return JSON.parse(value);
}

function parseValue(value: string): TomlValue {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return parseString(trimmed);
  }
  if (trimmed === 'true') {
    return true;
  }
  if (trimmed === 'false') {
    return false;
  }
  if (/^-?\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) {
      return [];
    }
    return splitArrayItems(inner).map((item) => parseValue(item));
  }
  throw new Error(`Unsupported TOML value: ${trimmed}`);
}

function ensureObject(target: Record<string, TomlValue>, key: string): Record<string, TomlValue> {
  const current = target[key];
  if (current === undefined) {
    const created: Record<string, TomlValue> = {};
    target[key] = created;
    return created;
  }
  if (typeof current === 'object' && !Array.isArray(current) && current !== null) {
    return current as Record<string, TomlValue>;
  }
  throw new Error(`Expected object at key ${key}`);
}

function assignPath(
  root: Record<string, TomlValue>,
  path: string[],
  value: TomlValue,
): void {
  let cursor = root;
  for (const segment of path.slice(0, -1)) {
    cursor = ensureObject(cursor, segment);
  }
  cursor[path.at(-1)!] = value;
}

export function parseToml(text: string): Record<string, TomlValue> {
  const root: Record<string, TomlValue> = {};
  let currentPath: string[] = [];

  for (const originalLine of text.split(/\r?\n/u)) {
    const line = stripComment(originalLine);
    if (!line) {
      continue;
    }

    if (line.startsWith('[') && line.endsWith(']')) {
      currentPath = line
        .slice(1, -1)
        .split('.')
        .map((segment) => segment.trim())
        .filter(Boolean);
      assignPath(root, currentPath, {});
      continue;
    }

    const separator = line.indexOf('=');
    if (separator === -1) {
      throw new Error(`Invalid TOML line: ${line}`);
    }

    const key = line.slice(0, separator).trim();
    const value = parseValue(line.slice(separator + 1));
    assignPath(root, [...currentPath, key], value);
  }

  return root;
}
