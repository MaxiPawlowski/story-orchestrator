import type { WriteResult } from "@utils/writeResult";
import { beginRun, type RunOwnership } from "./runToken";
import type { NormalizedLedger } from "./scanGatePlan";
import type { NormalizedFrom } from "./settingsStore";
import { gatedIndex, type BookEntries } from "./worldInfoLedger";
import { bookKey } from "./worldInfoMatch";

// v2.5 plan 01 A. Makes "off" the FILE's resting state for every gated entry of every library story, so ST's
// editor, a disabled extension and a no-story chat all see it off. Incremental: an entry the ledger holds is
// never re-read unless `recheck` names it (the author's re-normalise), so a second run writes nothing and a
// grown gated set normalises only what is new. Only a confirmed write, or a read showing the entry already
// off, enters the ledger, with what the entry was before (W1).
export type NormalizedProvenance = Record<string, NormalizedFrom[]>;

export interface NormalizeDeps {
  read: (lorebook: string) => Promise<BookEntries | null>;
  disable: (lorebook: string, comments: string[]) => Promise<WriteResult<{ changed: boolean; confirmed?: boolean }>>;
  ownership: RunOwnership;
  recheck?: (lorebook: string, comment: string) => boolean;
}

export interface NormalizeOutcome {
  ledger: NormalizedLedger;
  from: NormalizedProvenance;
  changed: boolean;
  flipped: Record<string, string[]>;
  alreadyOff: Record<string, string[]>;
  refused: string[];
  skippedBooks: string[];
  writes: number;
  lapsed: boolean;
}

const keyIn = <T>(record: Record<string, T>, lorebook: string) => Object.keys(record).find((name) => bookKey(name) === bookKey(lorebook)) ?? lorebook;

export async function normalizeGatedEntries(stories: unknown[], state: { ledger: NormalizedLedger; from: NormalizedProvenance }, deps: NormalizeDeps): Promise<NormalizeOutcome> {
  const run = beginRun(deps.ownership);
  const ledger: NormalizedLedger = Object.fromEntries(Object.entries(state.ledger).map(([book, comments]) => [book, [...comments]]));
  const from: NormalizedProvenance = Object.fromEntries(Object.entries(state.from).map(([book, rows]) => [book, rows.map((row) => ({ ...row }))]));
  const outcome: NormalizeOutcome = { ledger, from, changed: false, flipped: {}, alreadyOff: {}, refused: [], skippedBooks: [], writes: 0, lapsed: false };
  const record = (lorebook: string, comments: string[], wasOn: boolean) => {
    if (!comments.length) return;
    const ledgerKey = keyIn(ledger, lorebook);
    const fromKey = keyIn(from, lorebook);
    const known = new Set(ledger[ledgerKey] ?? []);
    const rows = from[fromKey] ?? [];
    ledger[ledgerKey] = [...(ledger[ledgerKey] ?? []), ...comments.filter((comment) => !known.has(comment))];
    from[fromKey] = [...rows, ...comments.filter((comment) => !rows.some((row) => row.comment === comment)).map((comment) => ({ comment, wasOn }))];
    outcome.changed = true;
  };
  for (const { lorebook, comments } of gatedIndex(stories).values()) {
    const known = new Set(ledger[keyIn(ledger, lorebook)] ?? []);
    const wanted = [...comments].filter((comment) => !known.has(comment) || deps.recheck?.(lorebook, comment));
    if (!wanted.length) continue;
    const entries = await deps.read(lorebook);
    if (!entries) {
      outcome.skippedBooks.push(lorebook);
      continue;
    }
    const present = wanted.filter((comment) => entries.has(comment));
    const flip = present.filter((comment) => entries.get(comment) !== true);
    const off = present.filter((comment) => entries.get(comment) === true);
    if (flip.length) {
      if (!run.stillOwns()) {
        outcome.lapsed = true;
        break;
      }
      const result = await deps.disable(lorebook, flip);
      if (!result.ok) outcome.refused.push(result.reason);
      else if (result.confirmed !== false) {
        if (result.changed) {
          outcome.writes += 1;
          outcome.flipped[lorebook] = flip;
        } else {
          outcome.alreadyOff[lorebook] = [...flip];
        }
        record(lorebook, flip, true);
      }
    }
    if (off.length) {
      outcome.alreadyOff[lorebook] = [...(outcome.alreadyOff[lorebook] ?? []), ...off];
      record(lorebook, off, false);
    }
  }
  return outcome;
}
