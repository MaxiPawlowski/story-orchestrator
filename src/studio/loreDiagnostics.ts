import { checkpointWorldInfo, gatedWorldInfo, LORE_UNTIL_CHAPTER, loreAlongPath, type Story } from "@engine/index";

type LoreCode = "world-info-until-unknown" | "lore-path-over-budget";

export const LORE_PATH_BUDGET_TOKENS = 2500;
export const LORE_PATH_VISITS = 4000;
export const LORE_PATH_KEYWORD_PICKS = 8;

export const LORE_LIFETIME_CONSEQUENCES: Record<LoreCode, string> = {
  "world-info-until-unknown": "This lore never ends where you meant: no checkpoint has that id, so it stays on until a checkpoint switches it off.",
  "lore-path-over-budget": "Lore switched on along this path is larger than the lore budget, so it crowds older chat history out of the prompt in a long chat.",
};

export interface LoreTokenEntry {
  comment: string;
  tokens: number;
  disabled: boolean;
  constant?: boolean;
}

export interface LoreFacts {
  loreEntries?: (lorebook: string) => readonly LoreTokenEntry[] | null;
  loreLifetime?: boolean;
}

export interface LoreRun {
  draft: Story;
  context: LoreFacts;
  push: (code: LoreCode, severity: "warning", path: string, message: string) => void;
}

const fold = (text: string) => text.trim().toLowerCase();

export interface LorePathPeak {
  tokens: number;
  path: string[];
}

export type LoreMeter = "prompt" | "all";

const promptTokens = (on: readonly LoreTokenEntry[], picks: number, meter: LoreMeter) => {
  if (meter === "all") return on.reduce((sum, row) => sum + row.tokens, 0);
  const constant = on.filter((row) => row.constant).reduce((sum, row) => sum + row.tokens, 0);
  const keyword = on.filter((row) => !row.constant).map((row) => row.tokens).sort((left, right) => right - left).slice(0, picks);
  return constant + keyword.reduce((sum, tokens) => sum + tokens, 0);
};

export function storyLoreBooks(draft: Story): string[] {
  const books = [...(draft.requirements?.lorebooks ?? []), ...gatedWorldInfo([draft]).keys(), ...(draft.lore_select?.lorebooks ?? [])];
  const seen = new Set<string>();
  return books.filter((book) => fold(book) && !seen.has(fold(book)) && Boolean(seen.add(fold(book))));
}

// The largest lore one prompt can carry anywhere along any simple path: every constant entry switched on, plus the
// keyword entries switched on that lore-select can force (its top_k, else 8), largest first. "all" adds every entry on.
export function lorePathPeak(draft: Story, entries: (lorebook: string) => readonly LoreTokenEntry[] | null, lifetime: boolean, meter: LoreMeter = "prompt"): LorePathPeak | null {
  const books = storyLoreBooks(draft);
  const loaded = books.map((book) => [book, entries(book)] as const);
  if (!books.length || loaded.some(([, rows]) => rows === null)) return null;
  const gated = new Map([...gatedWorldInfo([draft])].map(([book, comments]) => [fold(book), new Set([...comments].map(fold))]));
  const gatedRows = new Map<string, LoreTokenEntry[]>();
  const base: LoreTokenEntry[] = [];
  for (const [book, rows] of loaded) {
    for (const row of rows ?? []) {
      const key = `${fold(book)}|${fold(row.comment)}`;
      if (gated.get(fold(book))?.has(fold(row.comment))) gatedRows.set(key, [...(gatedRows.get(key) ?? []), row]);
      else if (!row.disabled) base.push(row);
    }
  }
  const picks = Math.max(1, Math.round(draft.lore_select?.top_k ?? LORE_PATH_KEYWORD_PICKS));
  const next = new Map<string, string[]>();
  draft.transitions.forEach((transition) => next.set(transition.from, [...(next.get(transition.from) ?? []), transition.to]));
  const start = draft.checkpoints.find((checkpoint) => checkpoint.start)?.id ?? draft.checkpoints[0]?.id;
  if (!start) return null;
  let peak: LorePathPeak = { tokens: promptTokens(base, picks, meter), path: [] };
  let visits = 0;
  const stack: string[][] = [[start]];
  while (stack.length && visits < LORE_PATH_VISITS) {
    const path = stack.pop() ?? [];
    visits += 1;
    const on = [...base];
    for (const [book, comments] of loreAlongPath({ checkpoints: draft.checkpoints }, path, lifetime)) {
      for (const comment of comments.keys()) on.push(...(gatedRows.get(`${fold(book)}|${fold(comment)}`) ?? []));
    }
    const tokens = promptTokens(on, picks, meter);
    if (tokens > peak.tokens) peak = { tokens, path };
    for (const to of next.get(path[path.length - 1]) ?? []) if (!path.includes(to)) stack.push([...path, to]);
  }
  return peak;
}

export function checkLoreLifetime(run: LoreRun) {
  const { draft, context, push } = run;
  const ids = new Set(draft.checkpoints.map((checkpoint) => checkpoint.id));
  draft.checkpoints.forEach((checkpoint, index) => {
    checkpointWorldInfo(checkpoint).enable.forEach((ref, position) => {
      if (ref.until && ref.until !== LORE_UNTIL_CHAPTER && !ids.has(ref.until)) {
        push("world-info-until-unknown", "warning", `checkpoints.${index}.effects.world_info.enable.${position}`,
          `'until' names '${ref.until}', which is not a checkpoint of this story`);
      }
    });
  });
  if (!context.loreEntries) return;
  const peak = lorePathPeak(draft, context.loreEntries, context.loreLifetime !== false);
  if (!peak || peak.tokens <= LORE_PATH_BUDGET_TOKENS || !peak.path.length) return;
  const at = peak.path[peak.path.length - 1];
  const index = draft.checkpoints.findIndex((checkpoint) => checkpoint.id === at);
  const names = peak.path.map((id) => draft.checkpoints.find((checkpoint) => checkpoint.id === id)?.name || id);
  push("lore-path-over-budget", "warning", `checkpoints.${Math.max(0, index)}.effects.world_info`,
    `Along ${names.join(" → ")} one prompt can carry about ${peak.tokens} tokens of this story's lore (its constant entries switched on plus the `
      + `largest keyword entries lore-select may add; budget about ${LORE_PATH_BUDGET_TOKENS}). `
      + "Give beat lore an end (its chapter, or until a checkpoint), switch passed scenes off, or trim entries");
}
