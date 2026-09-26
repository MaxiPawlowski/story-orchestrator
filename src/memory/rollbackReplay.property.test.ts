// v2.3 plan 04. The property the whole plan exists for: rolling back to a point must equal having
// stopped there. The review's version asserted it for one hand-written sequence at a time, which is
// how seven separate violations survived; this states it once and lets a seeded generator look for
// counterexamples across reads, consolidations, exclusions, compactions, ledger versions and
// epistemic retirements — through the SAME composition a mutation uses (`reverseMemoryState`), never
// a re-implementation of it.
//
// The rollback point is a MESSAGE id, so the comparison is against a store built by running the
// same operations whose message id is below it — replay. Two things are deliberately outside the
// generator: capping (it is not a function of the messages removed, so mixing it in would make the
// property false for a reason that is not a defect) and the canon (a rollback marks it stale rather
// than re-deriving it, which is conservative but not equal to replay; `derived.test.ts` pins that
// half).
//
// Seeds are fixed, so a failure is reproducible by name. Widen ITERATIONS locally when changing the
// stores; the committed count is what the gate runs.

import { decodeDelete, messageKeys } from "@runtime/messageIdentity";
import { applyConsolidation, type ConsolidationResult, type MatchSets } from "./consolidate";
import { disappearingEntries, recordDerived, type DerivedRecord } from "./derived";
import { applyEpistemicSignals } from "./epistemic";
import { applyLedgerSignals, buildLedgerView } from "./ledger";
import { reverseMemoryState, type MemoryRollbackState } from "./reverse";
import { addMemoryEntries, createMemoryState, excludeEntry, hashMemoryText, rollingShortTerm, type ShortTermPlacement } from "./stores";
import { appendShortTerm } from "./shortTermAppend";
import type { ArcEntry, EpistemicEntry, LedgerEntry, MemoryEntry } from "./types";

const ITERATIONS = 400;
const SEEDS = [1, 7, 20260921, 424242];

/** Deterministic PRNG: a failing case has to be reproducible from the seed alone. */
const rng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const SUBJECTS = ["Mara", "Kael", "Belle"];
const FIELDS = ["condition", "location"];
const TAGS = ["knows", "believes", "suspects"] as const;

interface Op { kind: "read" | "ledger" | "epistemic" | "consolidate" | "exclude" | "compact"; messageId: number; index: number }

const memory = (index: number, messageId: number) => ({
  id: `m${index}`,
  tier: "facts",
  text: `fact ${index}`,
  type: "fact",
  importance: 2,
  expiration: "permanent",
  entities: [SUBJECTS[index % SUBJECTS.length]],
  confidence: 1,
  activationTriggers: [],
  evidence: `evidence ${index}`,
  createdAt: messageId,
  messageId,
  recallCount: 0,
}) as Partial<MemoryEntry> as MemoryEntry;

/** Every store a mutation can reach, kept together so a rollback is one call. */
interface World {
  entries: MemoryEntry[];
  excluded: string[];
  writeLog: ReturnType<typeof createMemoryState>["writeLog"];
  shortTermSummaryEnd: number;
  arcs: ArcEntry[];
  epistemic: EpistemicEntry[];
  ledger: LedgerEntry[];
  canon: { text: string; inputHash: string; updatedAt: string } | null;
  verifyDrops: Array<{ entry: MemoryEntry }>;
  derived: DerivedRecord[];
}

const emptyWorld = (): World => ({ ...createMemoryState(), shortTermSummaryEnd: -1, arcs: [], epistemic: [], ledger: [], canon: null, verifyDrops: [], derived: [] });

const SHORT_TERM_LIMITS = { rows: 3, tokens: Number.POSITIVE_INFINITY };

const stepWith = (shape: ShortTermPlacement) => (world: World, op: Op): World => {
  if (op.kind === "read") {
    const { state } = addMemoryEntries(world, [memory(op.index, op.messageId)], { from: op.messageId, to: op.messageId });
    return { ...world, ...state };
  }
  if (op.kind === "ledger") {
    const entity = SUBJECTS[op.index % SUBJECTS.length];
    const field = FIELDS[op.index % FIELDS.length];
    return { ...world, ledger: applyLedgerSignals(world.ledger, [{ entity, entityType: "character", field, value: `v${op.index}` }], new Set(), { boundary: op.messageId, messageId: op.messageId }) };
  }
  if (op.kind === "epistemic") {
    const tag = TAGS[op.index % TAGS.length];
    const subject = SUBJECTS[op.index % SUBJECTS.length];
    const retire = world.epistemic.filter((entry) => !entry.supersededBy && entry.subject === subject).map((entry) => entry.id);
    const result = applyEpistemicSignals(world.epistemic, [{ subject, tag, content: `claim ${op.index}` }], { boundary: op.messageId, messageId: op.messageId }, retire);
    return { ...world, epistemic: result.entries };
  }
  if (op.kind === "exclude") {
    const candidate = world.entries[op.index % Math.max(1, world.entries.length)];
    if (!candidate) return world;
    const next = excludeEntry(world, candidate.id);
    const derived = recordDerived(world.derived, { kind: "exclusion", inputs: [candidate.id], removed: [candidate], hash: hashMemoryText(candidate.text), boundary: op.messageId, messageId: op.messageId });
    return { ...world, ...next, derived };
  }
  if (op.kind === "compact") {
    // The rolling short-term summary: one entry per tier, replaced, with the watermark moving with it.
    const summary: MemoryEntry = { ...memory(op.index + 100, op.messageId), tier: "short_term", type: "detail", text: `summary ${op.index}` };
    const { entries, inputs } = shape(world.entries, summary, () => SHORT_TERM_LIMITS);
    const from = world.shortTermSummaryEnd + 1;
    const derived = recordDerived(world.derived, { kind: "short_term", inputs, outputId: summary.id, range: { from, to: op.messageId }, removed: disappearingEntries(world.entries, entries), boundary: op.messageId, messageId: op.messageId });
    return { ...world, entries, shortTermSummaryEnd: op.messageId, derived };
  }
  // Consolidate: the newest fact supersedes the ones sharing its subject, which is M1's link.
  const subject = SUBJECTS[op.index % SUBJECTS.length];
  const matching = world.entries.filter((entry) => entry.entities.includes(subject));
  if (matching.length < 2) return world;
  const older = matching.slice(0, -1).map((entry) => entry.id);
  const winner = matching[matching.length - 1].id;
  const matches: MatchSets = { dup: [new Set(), new Set()], sameTopic: [new Set(), new Set()] };
  const pairs = older.map((loserId) => ({ loserId, winnerId: winner }));
  const result = { droppedIds: [], supersededPairs: pairs, confirmedIds: [], matches } as Partial<ConsolidationResult> as ConsolidationResult;
  const consolidated = applyConsolidation(world, result, { messageId: op.messageId });
  return { ...world, ...consolidated, derived: recordDerived(world.derived, { kind: "dedup", inputs: [winner], removed: disappearingEntries(world.entries, consolidated.entries), boundary: op.messageId, messageId: op.messageId }) };
};

const step = stepWith(rollingShortTerm);
const appendStep = stepWith(appendShortTerm);

const rollbackTo = (world: World, messageId: number, boundary: number): World => {
  const next = reverseMemoryState(world as World & Pick<MemoryRollbackState, "storyStart">, messageId, boundary);
  return { ...world, ...next };
};

/** The ledger read model, which is what a player and the prompt actually see. */
const ledgerView = (ledger: LedgerEntry[]) => buildLedgerView(ledger, [], {}, {}).map((row) => `${row.entity}|${row.field}=${row.value}`);
const entryView = (entries: MemoryEntry[]) => entries.map((entry) => `${entry.id}${entry.supersededBy ? `->${entry.supersededBy}` : ""}|recall=${entry.recallCount}|confirmed=${(entry.confirmedAt ?? []).map((at) => at.messageId).join(",")}`).sort();
const beliefView = (entries: EpistemicEntry[]) => entries.map((entry) => `${entry.subject}|${entry.tag}|${entry.content}${entry.supersededBy ? "|retired" : ""}`).sort();
const derivedView = (records: DerivedRecord[]) => records.map((record) => `${record.kind}|${record.messageId}|${record.outputId ?? ""}|${(record.inputs ?? []).join(",")}|${(record.removed ?? []).map((entry) => entry.id).join(",")}|${record.hash ?? ""}`).sort();

const randomCuts = (seed: number, step: (world: World, op: Op) => World) => {
  {
    const random = rng(seed);
    const ops: Op[] = [];
    const full = emptyWorld();
    const kinds: Op["kind"][] = ["read", "read", "ledger", "epistemic", "consolidate", "exclude", "compact"];

    for (let index = 0; index < 60; index += 1) {
      // Message ids ascend, so every op has a position on the timeline a mutation could reach.
      const op: Op = { kind: kinds[Math.floor(random() * kinds.length)], messageId: index, index };
      ops.push(op);
      const next = step(full, op);
      full.entries = next.entries;
      full.excluded = next.excluded;
      full.writeLog = next.writeLog;
      full.ledger = next.ledger;
      full.epistemic = next.epistemic;
      full.derived = next.derived;
      full.shortTermSummaryEnd = next.shortTermSummaryEnd;
    }

    for (let probe = 0; probe < ITERATIONS; probe += 1) {
      const cut = 1 + Math.floor(random() * ops.length);
      const replayed = ops.filter((op) => op.messageId < cut).reduce(step, emptyWorld());
      const rolled = rollbackTo(full, cut, cut - 1);
      const where = `seed ${seed}, cut ${cut}`;
      expect({ where, entries: entryView(rolled.entries) }).toEqual({ where, entries: entryView(replayed.entries) });
      expect({ where, ledger: ledgerView(rolled.ledger) }).toEqual({ where, ledger: ledgerView(replayed.ledger) });
      expect({ where, beliefs: beliefView(rolled.epistemic) }).toEqual({ where, beliefs: beliefView(replayed.epistemic) });
      expect({ where, excluded: [...rolled.excluded].sort() }).toEqual({ where, excluded: [...replayed.excluded].sort() });
      expect({ where, derived: derivedView(rolled.derived) }).toEqual({ where, derived: derivedView(replayed.derived) });
      expect({ where, watermark: rolled.shortTermSummaryEnd }).toEqual({ where, watermark: replayed.shortTermSummaryEnd });
      // And the read-coverage log, so a forced re-read after the rollback is not discarded as seen.
      expect({ where, coverage: rolled.writeLog.map((entry) => entry.range.to) }).toEqual({ where, coverage: replayed.writeLog.map((entry) => entry.range.to) });
    }
  }
};

describe("review: rollback is replay", () => {
  it.each(SEEDS)("holds across random sequences (seed %i)", (seed) => randomCuts(seed, step));
});

// v2.4 plan 01 T1. ST reports a delete as the post-delete chat length (host-facts 01-H1), which is the
// removed message only at the tail. The property above holds for a rollback POINT; this one feeds that
// point from the decoder over a real middle delete, so "rollback ≡ replay" holds end to end: the store
// must equal a replay that stopped before the removed message, whatever came after it.
const middleDeletes = (seed: number, step: (world: World, op: Op) => World) => {
  {
    const random = rng(seed);
    const kinds: Op["kind"][] = ["read", "read", "ledger", "epistemic", "consolidate", "exclude", "compact"];
    const ops: Op[] = Array.from({ length: 60 }, (_, index) => ({ kind: kinds[Math.floor(random() * kinds.length)], messageId: index, index }));
    const full = ops.reduce(step, emptyWorld());
    const chat = ops.map((op) => ({ send_date: `t${op.messageId}`, name: op.messageId % 2 ? "Arin" : "Player", is_user: op.messageId % 2 === 0, mes: `message ${op.messageId}` }));
    const before = messageKeys(chat);

    for (let probe = 0; probe < 100; probe += 1) {
      const count = 1 + Math.floor(random() * 3);
      const removed = 1 + Math.floor(random() * (chat.length - count - 1));
      const after = [...chat.slice(0, removed), ...chat.slice(removed + count)];
      const decoded = decodeDelete(before, after, after.length);
      const rolled = rollbackTo(full, decoded.start, decoded.start - 1);
      const replayed = ops.filter((op) => op.messageId < removed).reduce(step, emptyWorld());
      const where = `seed ${seed}, removed ${removed}+${count}, decoded ${decoded.start} (${decoded.basis})`;
      expect({ where, entries: entryView(rolled.entries) }).toEqual({ where, entries: entryView(replayed.entries) });
      expect({ where, ledger: ledgerView(rolled.ledger) }).toEqual({ where, ledger: ledgerView(replayed.ledger) });
      expect({ where, beliefs: beliefView(rolled.epistemic) }).toEqual({ where, beliefs: beliefView(replayed.epistemic) });
      expect({ where, excluded: [...rolled.excluded].sort() }).toEqual({ where, excluded: [...replayed.excluded].sort() });
      expect({ where, derived: derivedView(rolled.derived) }).toEqual({ where, derived: derivedView(replayed.derived) });
      expect({ where, watermark: rolled.shortTermSummaryEnd }).toEqual({ where, watermark: replayed.shortTermSummaryEnd });
    }
  }
};

describe("v2.4 T1: a middle delete through the decoder is replay without the removed message", () => {
  it.each(SEEDS)("holds for random middle deletes of one to three messages (seed %i)", (seed) => middleDeletes(seed, step));
});

describe("v2.5 plan 09 SP4 T1: rollback is replay with the append-only short_term", () => {
  it.each(SEEDS)("holds across random sequences (seed %i)", (seed) => randomCuts(seed, appendStep));
  it.each(SEEDS)("holds for random middle deletes of one to three messages (seed %i)", (seed) => middleDeletes(seed, appendStep));

  it("control: the generator really rotates and appends, so the property is not vacuous for this shape", () => {
    const kinds: Op["kind"][] = ["read", "read", "ledger", "epistemic", "consolidate", "exclude", "compact"];
    const random = rng(SEEDS[0]);
    const ops: Op[] = Array.from({ length: 60 }, (_, index) => ({ kind: kinds[Math.floor(random() * kinds.length)], messageId: index, index }));
    const full = ops.reduce(appendStep, emptyWorld());
    const compactions = full.derived.filter((record) => record.kind === "short_term");
    expect(full.entries.filter((entry) => entry.tier === "short_term").length).toBe(SHORT_TERM_LIMITS.rows);
    expect(compactions.some((record) => (record.removed ?? []).length > 0)).toBe(true);
    expect(compactions.every((record) => record.inputs.length === 0)).toBe(true);
  });
});
