import type { GateNode } from "./schema";

export const CODEX_PAGES = ["people", "places"] as const;
export type CodexPage = (typeof CODEX_PAGES)[number];
export const CODEX_FACTS_MAX = 12;
export const CODEX_ENTRIES_MAX = 40;
export const CODEX_TEXT_MAX = 200;
export const CODEX_NAME_MAX = 80;
export const CODEX_ALIASES_MAX = 8;
export const CODEX_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,47}$/;
export const CODEX_START = "start";

export interface CodexReached {
  reached: string;
}

export type CodexKnownWhen = GateNode | CodexReached | typeof CODEX_START;

export interface CodexFact {
  id: string;
  text: string;
  known_when: CodexKnownWhen;
  source?: string;
  rev?: number;
}

export interface CodexEntry {
  id: string;
  name?: string;
  member?: string;
  location?: string;
  aliases?: string[];
  known_when?: CodexKnownWhen;
  facts: CodexFact[];
}

export interface StoryCodex {
  people?: CodexEntry[];
  places?: CodexEntry[];
}

const PAGE_LETTER: Record<CodexPage, string> = { people: "p", places: "l" };

export const CODEX_KEY_PREFIXES = ["codex_p_", "codex_l_"] as const;

export const codexEntryKey = (page: CodexPage, entry: string): string => `codex_${PAGE_LETTER[page]}_${entry}`;

export const codexFactKey = (page: CodexPage, entry: string, fact: string): string => `${codexEntryKey(page, entry)}_${fact}`;

export const isCodexKey = (key: string): boolean => CODEX_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));

export const isReached = (value: CodexKnownWhen | undefined): value is CodexReached =>
  typeof value === "object" && value !== null && "reached" in value && typeof (value as CodexReached).reached === "string";

export const hasCodex = (codex: StoryCodex | undefined): boolean => Boolean(codex?.people?.length || codex?.places?.length);
