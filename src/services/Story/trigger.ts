// src/services/story/triggers.ts

import { RegexSpec } from "@services/SchemaService/story-schema";

const REGEX_FROM_SLASHES = /^\/(.*)\/([dgimsuvy]*)$/;

export function compileRegex(spec?: RegexSpec): RegExp | null {
  if (!spec) return null;
  if (typeof spec === 'string') {
    const m = spec.match(REGEX_FROM_SLASHES);
    if (m) return new RegExp(m[1], m[2] || undefined);
    return new RegExp(spec, 'i');
  }
  return new RegExp(spec.pattern, spec.flags ?? 'i');
}

export function compileRegexList(spec?: RegexSpec | RegexSpec[]): RegExp[] {
  if (!spec) return [];
  const list = Array.isArray(spec) ? spec : [spec];
  return list.map((item) => compileRegex(item)!).filter(Boolean) as RegExp[];
}

function ensureRegExpArray(input: any): RegExp[] | undefined {
  if (!Array.isArray(input)) return undefined;
  return input.every((v) => v instanceof RegExp) ? input : undefined;
}

export function resolveTriggers(cp: any, key: 'win' | 'fail'): RegExp[] {
  const normalizedKey = key === 'win' ? 'winTriggers' : 'failTriggers';
  const known = ensureRegExpArray(cp?.[normalizedKey]);
  if (known) return known;

  const legacy = cp?.[`${key}_trigger`];
  if (legacy) return compileRegexList(legacy);

  const grouped = cp?.triggers?.[key];
  return compileRegexList(grouped);
}
