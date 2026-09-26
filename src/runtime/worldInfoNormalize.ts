import { gatedWorldInfo } from "@engine/index";
import type { WriteResult } from "@utils/writeResult";
import { beginRun, type RunOwnership } from "./runToken";
import type { NormalizedLedger } from "./scanGatePlan";
import { bookKey } from "./worldInfoMatch";

// v2.4 plan 05 T13 spike: the one-time normalisation that makes "off" the FILE's resting state for
// every gated entry, so an ST editor, a disabled extension and a no-story chat all see it off.
// Incremental: an entry already in the ledger is never touched again, so a second run writes nothing
// and a story whose gated set grows normalises only what is new. In the spike it runs only on books
// `onlyBooks` admits (marker copies), never on a user's library book.
export const SCAN_SPIKE_BOOK_PREFIX = "SO-T13";

export const spikeBook = (name: string): boolean => name.trim().toLowerCase().startsWith(SCAN_SPIKE_BOOK_PREFIX.toLowerCase());

export interface NormalizeDeps {
  onlyBooks: (lorebook: string) => boolean;
  /** Comments present in the book (null when it is not listed). */
  present: (lorebook: string) => Promise<Set<string> | null>;
  disable: (lorebook: string, comments: string[]) => Promise<WriteResult<{ changed: boolean; confirmed?: boolean }>>;
  ownership: RunOwnership;
}

export interface NormalizeOutcome {
  ledger: NormalizedLedger;
  changed: boolean;
  flipped: Record<string, string[]>;
  alreadyOff: Record<string, string[]>;
  refused: string[];
  skippedBooks: string[];
  writes: number;
  lapsed: boolean;
}

const ledgerKeyFor = (ledger: NormalizedLedger, lorebook: string) => Object.keys(ledger).find((name) => bookKey(name) === bookKey(lorebook)) ?? lorebook;

export async function normalizeGatedEntries(stories: unknown[], ledger: NormalizedLedger, deps: NormalizeDeps): Promise<NormalizeOutcome> {
  const run = beginRun(deps.ownership);
  const next: NormalizedLedger = Object.fromEntries(Object.entries(ledger).map(([book, comments]) => [book, [...comments]]));
  const outcome: NormalizeOutcome = { ledger: next, changed: false, flipped: {}, alreadyOff: {}, refused: [], skippedBooks: [], writes: 0, lapsed: false };
  const byBook = new Map<string, { lorebook: string; comments: Set<string> }>();
  for (const [lorebook, comments] of gatedWorldInfo(stories)) {
    const key = bookKey(lorebook);
    const entry = byBook.get(key) ?? { lorebook, comments: new Set<string>() };
    comments.forEach((comment) => entry.comments.add(comment));
    byBook.set(key, entry);
  }
  for (const { lorebook, comments } of byBook.values()) {
    if (!deps.onlyBooks(lorebook)) {
      outcome.skippedBooks.push(lorebook);
      continue;
    }
    const ledgerKey = ledgerKeyFor(next, lorebook);
    const known = new Set(next[ledgerKey] ?? []);
    const wanted = [...comments].filter((comment) => !known.has(comment));
    if (!wanted.length) continue;
    const present = await deps.present(lorebook);
    const fresh = present ? wanted.filter((comment) => present.has(comment)) : [];
    if (!fresh.length) continue;
    if (!run.stillOwns()) {
      outcome.lapsed = true;
      break;
    }
    const result = await deps.disable(lorebook, fresh);
    if (!result.ok) {
      outcome.refused.push(result.reason);
      continue;
    }
    if (result.changed) {
      outcome.writes += 1;
      outcome.flipped[lorebook] = fresh;
    } else {
      outcome.alreadyOff[lorebook] = fresh;
    }
    if (result.confirmed === false) continue;
    next[ledgerKey] = [...known, ...fresh];
    outcome.changed = true;
  }
  return outcome;
}
