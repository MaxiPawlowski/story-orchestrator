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
import { pushBeat } from "./innerRender";
import { applyLedgerSignals, buildLedgerView } from "./ledger";
import { reverseMemoryState, type MemoryRollbackState, type SealSkip } from "./reverse";
import { addMemoryEntries, createMemoryState, excludeEntry, hashMemoryText, rollingShortTerm, type ShortTermPlacement } from "./stores";
import { appendShortTerm } from "./shortTermAppend";
import type { ArcEntry, ChapterDisposition, ChapterRecord, ChronicleState, EpistemicEntry, InnerBeat, LedgerEntry, MemoryEntry } from "./types";
import { foldChapter, foldEpistemic } from "./chapterFold";
import { commitRecordBridge, markRecapSeen, pendingBridge, pushSealSkip, unfoldAt } from "./chapterUnfold";
import { eraCandidates, eraMessageId, fallbackEraText } from "./chronicle";

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
const TAGS = ["knows", "believes", "suspects", "intends"] as const;

interface Op {
  kind: "read" | "ledger" | "epistemic" | "intend" | "beat" | "consolidate" | "exclude" | "compact" | "seal" | "arc" | "resolve" | "bridge" | "skip" | "recap" | "hide";
  messageId: number;
  index: number;
}

const KINDS: Op["kind"][] = ["read", "read", "ledger", "epistemic", "consolidate", "exclude", "compact", "seal"];
const INNER_KINDS: Op["kind"][] = [
  "read", "read", "ledger", "epistemic", "intend", "beat", "consolidate", "exclude", "compact", "seal", "seal", "arc", "arc", "resolve", "bridge", "skip", "recap", "hide", "hide",
];

const memory = (index: number, messageId: number) => ({
  id: `m${index}`,
  tier: "facts",
  text: `fact ${index}`,
  type: "fact",
  importance: index % 3 === 0 ? 1 : 2,
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
  innerBeats: InnerBeat[];
  chapters: ChapterRecord[];
  chronicle: ChronicleState;
  chapterSealSkip: { pathLength: number; messageId: number } | null;
}

const emptyWorld = (): World => ({
  ...createMemoryState(), shortTermSummaryEnd: -1, arcs: [], epistemic: [], ledger: [], canon: null, verifyDrops: [], derived: [], innerBeats: [], chapters: [],
  chronicle: { eras: [] }, chapterSealSkip: null,
});

const POLICIES = ["carry", "decide", "close"] as const;
const DECIDED: ChapterDisposition[] = ["carry", "closed-offscreen", "abandoned"];

const mergeEra = (world: World, op: Op): World => {
  const merge = eraCandidates(world.chapters, world.chronicle.eras);
  if (merge.length < 2) return world;
  const era = { id: `era${op.index}`, recordIds: merge.map((record) => record.id), text: fallbackEraText(merge), messageId: eraMessageId(world.chapters) };
  return {
    ...world,
    chronicle: { eras: [...world.chronicle.eras, era] },
    derived: recordDerived(world.derived, { kind: "era_merge", inputs: era.recordIds, outputId: era.id, boundary: op.messageId, messageId: era.messageId }),
  };
};

const seal = (world: World, op: Op): World => {
  const previous = world.chapters[world.chapters.length - 1];
  const policy = POLICIES[op.index % POLICIES.length];
  const open = world.arcs.filter((arc) => arc.status === "open" && !arc.pinned);
  const decided = open.map((arc, index) => ({ arcId: arc.id, text: arc.text, disposition: DECIDED[(op.index + index + 1) % DECIDED.length] }));
  const record = {
    id: `ch${op.index}`,
    chapterId: op.index % 4 === 0 ? `era-${op.index}` : `c${op.index % 3}`,
    playerTitle: `Chapter ${op.index}`,
    short: `short ${op.index}.`,
    summary: `summary ${op.index}.`,
    range: { from: previous ? previous.range.to + 1 : 0, to: op.messageId },
    open: policy === "decide" ? decided : [],
    sealedAt: { boundary: op.messageId, messageId: op.messageId, at: 0, pathLength: world.chapters.length + 1 },
    bridge: { text: `bridge ${op.index}` },
  } as Partial<ChapterRecord> as ChapterRecord;
  const disposition = (arc: ArcEntry): ChapterDisposition => (policy === "carry" ? "carry" : policy === "close" ? "closed-offscreen" : decided.find((item) => item.arcId === arc.id)?.disposition ?? "carry");
  const folded = foldChapter(world, record, disposition);
  const leaving = new Set(SUBJECTS.filter((_subject, index) => (op.index + index) % 3 !== 0).map((subject) => subject.toLowerCase()));
  const knowledge = foldEpistemic(world.epistemic, record.id, leaving, SUBJECTS);
  const moved = folded.shortTermSummaryEnd > world.shortTermSummaryEnd;
  const derived = recordDerived(world.derived, {
    kind: "chapter_seal", inputs: [...folded.folded, ...folded.resolved, ...knowledge.folded], outputId: record.id, boundary: op.messageId, messageId: op.messageId,
    ...(moved ? { range: { from: world.shortTermSummaryEnd + 1, to: folded.shortTermSummaryEnd } } : {}),
  });
  const sealed = { ...world, entries: folded.entries, arcs: folded.arcs, epistemic: knowledge.epistemic, shortTermSummaryEnd: folded.shortTermSummaryEnd, chapters: [...world.chapters, record], derived };
  return world.chapters.length >= 2 ? mergeEra(sealed, op) : sealed;
};

const chapterStep = (world: World, op: Op): World => {
  if (op.kind === "arc") {
    const arc: ArcEntry = { id: `a${op.index}`, text: `thread ${op.index}`, status: "open", entities: [], openedAt: op.messageId, openedMessageId: op.messageId };
    return { ...world, arcs: [...world.arcs, arc] };
  }
  if (op.kind === "resolve") {
    const target = world.arcs.find((arc) => arc.status === "open");
    if (!target) return world;
    return { ...world, arcs: world.arcs.map((arc) => (arc === target ? { ...arc, status: "resolved", resolvedAt: op.messageId, resolvedMessageId: op.messageId } : arc)) };
  }
  if (op.kind === "bridge") {
    const last = world.chapters[world.chapters.length - 1];
    return last ? { ...world, chapters: commitRecordBridge(world.chapters, last.id, op.messageId) } : world;
  }
  if (op.kind === "recap") {
    const last = world.chapters[world.chapters.length - 1];
    return last ? { ...world, chapters: markRecapSeen(world.chapters, last.id, op.messageId) } : world;
  }
  return { ...world, chapterSealSkip: pushSealSkip(world.chapterSealSkip, { pathLength: world.chapters.length + 2, messageId: op.messageId }) };
};

const SHORT_TERM_LIMITS = { rows: 3, tokens: Number.POSITIVE_INFINITY };

const stepWith = (shape: ShortTermPlacement) => (world: World, op: Op): World => {
  if (op.kind === "seal") return seal(world, op);
  if (["arc", "resolve", "bridge", "skip", "recap"].includes(op.kind)) return chapterStep(world, op);
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
  if (op.kind === "hide") {
    const subject = SUBJECTS[op.index % SUBJECTS.length];
    const other = SUBJECTS[(op.index + 1) % SUBJECTS.length];
    const signal = op.index % 2 ? { subject, tag: "hiding" as const, content: `secret ${op.index}`, hiddenFrom: other } : { subject, tag: "suspects" as const, content: `${other} hides secret ${op.index}` };
    return { ...world, epistemic: applyEpistemicSignals(world.epistemic, [signal], { boundary: op.messageId, messageId: op.messageId }).entries };
  }
  if (op.kind === "intend") {
    const subject = SUBJECTS[op.index % SUBJECTS.length];
    const result = applyEpistemicSignals(world.epistemic, [{ subject, tag: "intends", content: `intent of ${subject}` }], { boundary: op.messageId, messageId: op.messageId });
    return { ...world, epistemic: result.entries };
  }
  if (op.kind === "beat") {
    const memberId = SUBJECTS[op.index % SUBJECTS.length];
    return { ...world, innerBeats: pushBeat(world.innerBeats, { chatId: "c", memberId, basedOnMessageId: op.messageId, checkpointId: "cp", beat: `beat ${op.index}`, at: "t" }) };
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
  const next = reverseMemoryState(world as World & Pick<MemoryRollbackState, "storyStart">, messageId, boundary, unfoldAt);
  return { ...world, ...next };
};

/** The ledger read model, which is what a player and the prompt actually see. */
const ledgerView = (ledger: LedgerEntry[]) => buildLedgerView(ledger, [], {}, {}).map((row) => `${row.entity}|${row.field}=${row.value}`);
const entryView = (entries: MemoryEntry[]) => entries.map((entry) => `${entry.id}${entry.supersededBy ? `->${entry.supersededBy}` : ""}${entry.foldedInto ? `@${entry.foldedInto}` : ""}|recall=${entry.recallCount}|confirmed=${(entry.confirmedAt ?? []).map((at) => at.messageId).join(",")}`).sort();
const beliefView = (entries: EpistemicEntry[]) => entries.map((entry) => `${entry.subject}|${entry.tag}|${entry.content}${entry.supersededBy ? "|retired" : ""}|${entry.affirmedAt?.at(-1)?.messageId ?? ""}${entry.foldedInto ? `@${entry.foldedInto}` : ""}`).sort();
const beatView = (beats: InnerBeat[] | undefined) => (beats ?? []).map((beat) => `${beat.memberId}@${beat.basedOnMessageId}`);
const beliefKey = (beliefs: EpistemicEntry[], id: string) => {
  const found = beliefs.find((entry) => entry.id === id);
  return found ? `belief:${found.subject}|${found.tag}|${found.content}` : id;
};
const derivedView = (records: DerivedRecord[], beliefs: EpistemicEntry[] = []) => records.map((record) => `${record.kind}|${record.messageId}|${record.outputId ?? ""}|${(record.inputs ?? []).map((id) => beliefKey(beliefs, id)).join(",")}|${(record.removed ?? []).map((entry) => entry.id).join(",")}|${record.hash ?? ""}`).sort();
const arcView = (arcs: ArcEntry[]) => arcs.map((arc) => JSON.stringify(Object.fromEntries(Object.entries(arc).sort(([left], [right]) => left.localeCompare(right))))).sort();

// Beats are compared both ways. The one difference allowed: the ring is capped (BEAT_RING_CAP), so a
// replay that stopped early still holds a beat the full run pushed out of the ring, and a rollback
// cannot bring back a beat the cap already dropped. Such a beat must be absent from the full run too.
const expectWorldsEqual = (where: string, rolled: World, replayed: World, full: World) => {
  expect({ where, entries: entryView(rolled.entries) }).toEqual({ where, entries: entryView(replayed.entries) });
  expect({ where, ledger: ledgerView(rolled.ledger) }).toEqual({ where, ledger: ledgerView(replayed.ledger) });
  expect({ where, beliefs: beliefView(rolled.epistemic) }).toEqual({ where, beliefs: beliefView(replayed.epistemic) });
  expect({ where, excluded: [...rolled.excluded].sort() }).toEqual({ where, excluded: [...replayed.excluded].sort() });
  expect({ where, derived: derivedView(rolled.derived, rolled.epistemic) }).toEqual({ where, derived: derivedView(replayed.derived, replayed.epistemic) });
  expect({ where, watermark: rolled.shortTermSummaryEnd }).toEqual({ where, watermark: replayed.shortTermSummaryEnd });
  const rolledBeats = beatView(rolled.innerBeats);
  const replayedBeats = beatView(replayed.innerBeats);
  expect({ where, extraBeats: rolledBeats.filter((beat) => !replayedBeats.includes(beat)) }).toEqual({ where, extraBeats: [] });
  expect({ where, lostBeats: replayedBeats.filter((beat) => !rolledBeats.includes(beat) && beatView(full.innerBeats).includes(beat)) }).toEqual({ where, lostBeats: [] });
  expect({ where, arcs: arcView(rolled.arcs) }).toEqual({ where, arcs: arcView(replayed.arcs) });
  expect({ where, chapters: rolled.chapters }).toEqual({ where, chapters: replayed.chapters });
  expect({ where, eras: rolled.chronicle.eras }).toEqual({ where, eras: replayed.chronicle.eras });
  expect({ where, bridge: pendingBridge(rolled.chapters) }).toEqual({ where, bridge: pendingBridge(replayed.chapters) });
  expect({ where, skip: rolled.chapterSealSkip ?? null }).toEqual({ where, skip: replayed.chapterSealSkip ?? null });
};

const randomCuts = (seed: number, step: (world: World, op: Op) => World) => {
  {
    const random = rng(seed);
    const ops: Op[] = [];
    const full = emptyWorld();
    const kinds = INNER_KINDS;

    for (let index = 0; index < 60; index += 1) {
      // Message ids ascend, so every op has a position on the timeline a mutation could reach.
      const op: Op = { kind: kinds[Math.floor(random() * kinds.length)], messageId: index, index };
      ops.push(op);
      Object.assign(full, step(full, op));
    }

    for (let probe = 0; probe < ITERATIONS; probe += 1) {
      const cut = 1 + Math.floor(random() * ops.length);
      const replayed = ops.filter((op) => op.messageId < cut).reduce(step, emptyWorld());
      const rolled = rollbackTo(full, cut, cut - 1);
      const where = `seed ${seed}, cut ${cut}`;
      expectWorldsEqual(where, rolled, replayed, full);
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
    const ops: Op[] = Array.from({ length: 60 }, (_, index) => ({ kind: INNER_KINDS[Math.floor(random() * INNER_KINDS.length)], messageId: index, index }));
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
      expectWorldsEqual(where, rolled, replayed, full);
    }
  }
};

describe("v2.6 plan 06 B: the generator reaches intents, their restatements and the beat ring", () => {
  it("control: some intent is restated, so the affirmation rollback is exercised, and beats are built", () => {
    const kinds: Op["kind"][] = ["read", "read", "ledger", "epistemic", "intend", "beat", "consolidate", "exclude", "compact"];
    const worlds = SEEDS.map((seed) => {
      const random = rng(seed);
      return Array.from({ length: 60 }, (_, index): Op => ({ kind: kinds[Math.floor(random() * kinds.length)], messageId: index, index })).reduce(step, emptyWorld());
    });
    expect(worlds.some((full) => full.epistemic.some((entry) => entry.tag === "intends" && (entry.affirmedAt ?? []).length > 0))).toBe(true);
    expect(worlds.every((full) => full.innerBeats.length > 0)).toBe(true);
  });
});

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

describe("v2.6 plan 07: rollback is replay across chapter seals", () => {
  it("control: the generator seals chapters that fold rows, so the property covers the fold", () => {
    const random = rng(SEEDS[0]);
    const ops: Op[] = Array.from({ length: 60 }, (_, index) => ({ kind: KINDS[Math.floor(random() * KINDS.length)], messageId: index, index }));
    const full = ops.reduce(step, emptyWorld());
    expect(full.chapters.length).toBeGreaterThan(1);
    expect(full.entries.some((entry) => entry.foldedInto)).toBe(true);
    expect(full.derived.some((record) => record.kind === "chapter_seal" && record.range)).toBe(true);
  });

  it("control (CR-E9): across the seeds the generator decides and closes arcs at a seal, merges eras, commits bridges, sees recaps and skips seals", () => {
    const worlds = SEEDS.map((seed) => {
      const random = rng(seed);
      return Array.from({ length: 60 }, (_, index): Op => ({ kind: INNER_KINDS[Math.floor(random() * INNER_KINDS.length)], messageId: index, index })).reduce(step, emptyWorld());
    });
    const all = <T>(read: (world: World) => T[]) => worlds.flatMap(read);
    expect(all((world) => world.arcs).some((arc) => arc.resolvedBy)).toBe(true);
    expect(all((world) => world.arcs).some((arc) => arc.originChapter)).toBe(true);
    expect(all((world) => world.arcs).some((arc) => arc.foldedInto)).toBe(true);
    expect(all((world) => world.chapters).some((record) => record.open.some((item) => item.disposition === "abandoned"))).toBe(true);
    expect(all((world) => world.chronicle.eras).length).toBeGreaterThan(0);
    expect(all((world) => world.chapters).some((record) => record.bridge?.committedAt !== undefined)).toBe(true);
    expect(all((world) => world.chapters).some((record) => record.recapSeenAt !== undefined)).toBe(true);
    expect(worlds.some((world) => world.chapterSealSkip)).toBe(true);
    expect(all((world) => world.epistemic).some((entry) => entry.foldedInto)).toBe(true);
    expect(all((world) => world.chapters).some((record) => record.chapterId.startsWith("era-"))).toBe(true);
  });
});
