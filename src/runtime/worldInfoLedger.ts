import { gatedWorldInfo } from "@engine/index";
import type { NormalizedLedger } from "./scanGatePlan";
import type { NormalizedFrom } from "./settingsStore";
import { bookKey } from "./worldInfoMatch";

// B. The ledger says which gated entries rest off in their files; the files are the truth.
// Read-only: a verdict is evidence for a Repair row, and every write needs the author's click.
export type BookEntries = Map<string, boolean | null>;

export interface GatedEntryRef {
  lorebook: string;
  comment: string;
}

export interface LedgerVerdict {
  drift: GatedEntryRef[];
  missing: GatedEntryRef[];
  unreadable: string[];
}

export type GatedIndex = Map<string, { lorebook: string; comments: Set<string> }>;

export function gatedIndex(stories: unknown[]): GatedIndex {
  const index: GatedIndex = new Map();
  for (const [lorebook, comments] of gatedWorldInfo(stories)) {
    const key = bookKey(lorebook);
    const entry = index.get(key) ?? { lorebook, comments: new Set<string>() };
    comments.forEach((comment) => entry.comments.add(comment));
    index.set(key, entry);
  }
  return index;
}

// D: the author table says which story gates each entry.
export function gatedBy(records: Array<{ title: string; raw: unknown }>): (lorebook: string, comment: string) => string[] {
  const indexes = records.map((record) => ({ title: record.title, index: gatedIndex([record.raw]) }));
  return (lorebook, comment) => indexes.filter((entry) => isGated(entry.index, lorebook, comment)).map((entry) => entry.title);
}

export const isGated = (index: GatedIndex, lorebook: string, comment: string): boolean => index.get(bookKey(lorebook))?.comments.has(comment) ?? false;

export async function verifyLedger(ledger: NormalizedLedger, index: GatedIndex, read: (lorebook: string) => Promise<BookEntries | null>): Promise<LedgerVerdict> {
  const verdict: LedgerVerdict = { drift: [], missing: [], unreadable: [] };
  for (const [lorebook, comments] of Object.entries(ledger)) {
    const checked = comments.filter((comment) => isGated(index, lorebook, comment));
    if (!checked.length) continue;
    const entries = await read(lorebook);
    if (!entries) {
      verdict.unreadable.push(lorebook);
      continue;
    }
    for (const comment of checked) {
      if (!entries.has(comment)) verdict.missing.push({ lorebook, comment });
      else if (entries.get(comment) !== true) verdict.drift.push({ lorebook, comment });
    }
  }
  return verdict;
}

export interface RestoreBook {
  lorebook: string;
  comments: string[];
}

// E. Only what normalisation turned off (`wasOn`), still in the ledger, and gated by no remaining story.
export function restorePlan(removed: unknown, remaining: unknown[], ledger: NormalizedLedger, from: Record<string, NormalizedFrom[]>): RestoreBook[] {
  const kept = gatedIndex(remaining);
  const held = (records: Record<string, string[]>, lorebook: string) => Object.entries(records).find(([name]) => bookKey(name) === bookKey(lorebook))?.[1] ?? [];
  const wasOn = (lorebook: string, comment: string) => Object.entries(from).find(([name]) => bookKey(name) === bookKey(lorebook))?.[1].some((row) => row.comment === comment && row.wasOn) ?? false;
  const plan: RestoreBook[] = [];
  for (const { lorebook, comments } of gatedIndex([removed]).values()) {
    const inLedger = new Set(held(ledger, lorebook));
    const restorable = [...comments].filter((comment) => inLedger.has(comment) && wasOn(lorebook, comment) && !isGated(kept, lorebook, comment));
    if (restorable.length) plan.push({ lorebook, comments: restorable });
  }
  return plan;
}

export const ledgerCounts = (ledger: NormalizedLedger): { books: number; entries: number } => ({
  books: Object.keys(ledger).length,
  entries: Object.values(ledger).reduce((sum, comments) => sum + comments.length, 0),
});
