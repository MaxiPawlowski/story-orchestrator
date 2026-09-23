import { buildContinuityRequest, continuityNote, CONTINUITY_MAX_FACTS, CONTINUITY_TIMEOUT_MS, type ContinuityNote } from "@judge/index";
import { isLive, type ConflictPair, type LedgerView, type MemoryEntry } from "@memory/index";
import type { Provenance } from "@memory/provenance";
import type { JudgeRuntime } from "./judge";

/**
 * v2.3 plan 05. What the warden is allowed to hold a reply to, WITH the ids it came from. The card
 * the author reviews has to be able to say where the claim came from — a bare sentence is a claim
 * with no owner, and the plan's structural fix is that the fact list travels as records.
 */
export interface EstablishedFact {
  id: string;
  text: string;
  provenance?: Provenance;
  /** Another store says something else about the same thing, and the author has not decided yet. */
  conflictingValue?: string;
}

export type ContinuityCheck = (reply: { speaker: string; text: string }, facts: string[]) => Promise<ContinuityNote | null>;

const factTexts = (facts: EstablishedFact[]) => facts.map((fact) => fact.text);

// v2.2 plan 05: what the warden holds a reply to. The ledger's bound rows come first (the blackboard
// alone writes them), then live facts, pinned ones first.
export function establishedFacts(
  entries: MemoryEntry[],
  ledger: LedgerView[],
  boundProvenance: Record<string, Provenance> = {},
  conflicts: ConflictPair[] = [],
): EstablishedFact[] {
  // v2.3 plan 05 (C3): the warden reads live rows only. A quarantined or conflicted fact must never
  // be the thing a character is corrected toward.
  const live = entries
    .filter((entry) => isLive(entry))
    .filter((entry) => (entry.tier === "facts" || entry.pinned) && !entry.supersededBy && !entry.foldedInto && !entry.contradicted)
    .sort((left, right) => Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)) || right.importance - left.importance || right.createdAt - left.createdAt)
    .map((entry) => ({ id: entry.id, text: entry.text, ...(entry.provenance ? { provenance: entry.provenance } : {}) }));
  const bound = ledger.filter((row) => row.bound).map((row) => {
    const id = `bound:${row.entity}:${row.field}`;
    const origin = boundProvenance[`${row.entity}|${row.field}`];
    return { id, text: `${row.entity} ${row.field} = ${row.value}`, ...(origin ? { provenance: origin } : {}) };
  });
  const seen = new Set<string>();
  const facts: EstablishedFact[] = [];
  for (const fact of [...bound, ...live]) {
    if (seen.has(fact.text)) continue;
    seen.add(fact.text);
    const conflict = conflicts.find((pair) => pair.sides.some((side) => side.id === fact.id));
    const other = conflict?.sides.find((side) => side.id !== fact.id);
    facts.push({ ...fact, ...(other ? { conflictingValue: other.label } : {}) });
    if (facts.length >= CONTINUITY_MAX_FACTS) break;
  }
  return facts;
}

export const establishedFactTexts = (facts: EstablishedFact[]) => factTexts(facts);

// The warden's own switch is `stagecraft.wardenEnabled`; the judge's master switch still gates
// every call, so nothing is sent while the judgment model is off.
export const createContinuityCheck = (judge: () => JudgeRuntime | null): ContinuityCheck => async (reply, facts) => {
  const runtime = judge();
  if (!runtime?.enabled() || !facts.length) return null;
  const result = await runtime.ask("warden", buildContinuityRequest(reply, facts), {
    timeoutMs: CONTINUITY_TIMEOUT_MS,
    summarize: (answers) => ({ facts: Math.min(facts.length, CONTINUITY_MAX_FACTS), flagged: answers ? continuityNote(answers, facts)?.facts.length ?? 0 : 0 }),
  });
  return result.answers ? continuityNote(result.answers, facts) : null;
};
