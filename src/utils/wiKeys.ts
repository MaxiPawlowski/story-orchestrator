export const LORE_KEY_LOGICS = ["and-any", "not-all", "not-any", "and-all"] as const;

export type LoreKeyLogic = (typeof LORE_KEY_LOGICS)[number];

export const LORE_KEY_LOGIC_CODE: Record<LoreKeyLogic, number> = { "and-any": 0, "not-all": 1, "not-any": 2, "and-all": 3 };

export const LORE_GENERATION_TRIGGERS = ["normal", "continue", "impersonate", "swipe", "regenerate", "quiet"] as const;

export const WI_POSITION_OUTLET = 7;

export const isLoreKeyLogic = (value: unknown): value is LoreKeyLogic => typeof value === "string" && (LORE_KEY_LOGICS as readonly string[]).includes(value);

export function parseKeyRegex(input: string): RegExp | null {
  const match = /^\/([\w\W]+?)\/([gimsuy]*)$/.exec(input);
  if (!match) return null;
  const [, pattern, flags] = match;
  if (/(^|[^\\])\//.test(pattern)) return null;
  try {
    return new RegExp(pattern.replace("\\/", "/"), flags);
  } catch {
    return null;
  }
}

export const looksLikeRegexKey = (key: string): boolean => /^\/.+\/[a-z]*$/s.test(key.trim());

export function regexKeyProblem(key: string): string | null {
  const trimmed = key.trim();
  if (!looksLikeRegexKey(trimmed) || parseKeyRegex(trimmed)) return null;
  return `The key "${trimmed}" looks like a pattern, but SillyTavern will match it as plain text: escape every "/" inside it as "\\/", use only the flags g, i, m, s, u, y, and check the pattern itself.`;
}

export const triggerGenerationType = (type: string | undefined): string | null =>
  type === undefined ? null : (LORE_GENERATION_TRIGGERS as readonly string[]).includes(type) ? type : "normal";

export const outletNameProblem = (name: string): string | null =>
  /[{}]/.test(name) ? `The outlet name "${name}" cannot hold "{" or "}": write it as {{outlet::name}} in the prompt and only the name here.` : null;
