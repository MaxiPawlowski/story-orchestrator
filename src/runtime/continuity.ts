import { buildContinuityRequest, continuityNote, CONTINUITY_MAX_FACTS, type ContinuityNote } from "@judge/index";
import type { LedgerView, MemoryEntry } from "@memory/index";
import type { JudgeRuntime } from "./judge";

export type ContinuityCheck = (reply: { speaker: string; text: string }, facts: string[]) => Promise<ContinuityNote | null>;

// v2.2 plan 05: what the warden holds a reply to. The ledger's bound rows come first (the blackboard
// alone writes them), then live facts, pinned ones first.
export function establishedFacts(entries: MemoryEntry[], ledger: LedgerView[]): string[] {
  const live = entries
    .filter((entry) => (entry.tier === "facts" || entry.pinned) && !entry.supersededBy && !entry.foldedInto && !entry.contradicted)
    .sort((left, right) => Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)) || right.importance - left.importance || right.createdAt - left.createdAt)
    .map((entry) => entry.text);
  const bound = ledger.filter((row) => row.bound).map((row) => `${row.entity} ${row.field} = ${row.value}`);
  return [...new Set([...bound, ...live])].slice(0, CONTINUITY_MAX_FACTS);
}

// The warden's own switch is `stagecraft.wardenEnabled`; the judge's master switch still gates
// every call, so nothing is sent while the judgment model is off.
export const createContinuityCheck = (judge: () => JudgeRuntime | null): ContinuityCheck => async (reply, facts) => {
  const runtime = judge();
  if (!runtime?.enabled() || !facts.length) return null;
  const result = await runtime.ask("warden", buildContinuityRequest(reply, facts), {
    summarize: (answers) => ({ facts: Math.min(facts.length, CONTINUITY_MAX_FACTS), flagged: answers ? continuityNote(answers, facts)?.facts.length ?? 0 : 0 }),
  });
  return result.answers ? continuityNote(result.answers, facts) : null;
};
