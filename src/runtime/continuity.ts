import { agencyForCheckpoint, type EngineState, type NormalizedStoryV2 } from "@engine/index";
import { buildWardenRequests, CONTINUITY_MAX_FACTS, CONTINUITY_TIMEOUT_MS, readWarden, wardenRecordP, type WardenFinding, type WardenInput } from "@judge/index";
import { isLive, type ConflictPair, type LedgerView, type MemoryEntry } from "@memory/index";
import type { Provenance } from "@memory/provenance";
import type { JudgeRuntime } from "./judge";

/**
 * What the warden is allowed to hold a reply to, WITH the ids it came from. The card
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

export type WardenCheck = (input: WardenInput) => Promise<WardenFinding[] | null>;

// What the warden holds a reply to. The ledger's bound rows come first (the blackboard
// alone writes them), then live facts, pinned ones first.
export function establishedFacts(
  entries: MemoryEntry[],
  ledger: LedgerView[],
  boundProvenance: Record<string, Provenance> = {},
  conflicts: ConflictPair[] = [],
): EstablishedFact[] {
  // The warden reads live rows only. A quarantined or conflicted fact must never
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

// The warden's own switch is `stagecraft.wardenEnabled`; the judge's master switch still gates
// every call, so nothing is sent while the judgment model is off. one call asks every
// family that is on (WARDEN_ARM), and no facts no longer skips it when another family is on.
export const createWardenCheck = (judge: () => JudgeRuntime | null): WardenCheck => async (input) => {
  const runtime = judge();
  const requests = buildWardenRequests(input);
  if (!runtime?.enabled() || !requests.length) return null;
  const results = await Promise.all(requests.map((request) => runtime.ask("warden", request, { timeoutMs: CONTINUITY_TIMEOUT_MS, summarize: (answers) => wardenRecordP(answers, input) })));
  if (results.some((result) => !result.answers)) return null;
  return readWarden(Object.assign({}, ...results.map((result) => result.answers)), input);
};

// Are their own judge.uses opt-ins. The agency check stands down where the checkpoint lets
// narration write the player (never_narrate_player_action false): the author allowed it.
export const wardenFamilies = (judge: () => JudgeRuntime | null, view: { getStory: () => NormalizedStoryV2 | null; getState: () => EngineState | null }) => () => {
  const runtime = judge();
  const story = view.getStory();
  const agency = Boolean(runtime?.active("agencyCheck")) && agencyForCheckpoint(story, view.getState()?.activeCheckpointId).never_narrate_player_action;
  return { agency, houseRules: runtime?.active("houseRules") ? [...(story?.house_rules ?? [])] : [] };
};

export const createWarden = (judge: () => JudgeRuntime | null, view: Parameters<typeof wardenFamilies>[1], own: { facts: () => EstablishedFact[]; nudgeActive: () => boolean }) => ({
  check: createWardenCheck(judge),
  families: wardenFamilies(judge, view),
  ...own,
});
