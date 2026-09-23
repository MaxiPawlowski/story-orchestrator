// @memory/index reaches the host through the injector, which this test never calls.
jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  setStoryExtensionPrompt: jest.fn(),
  clearStoryExtensionPrompt: jest.fn(),
  MEMORY_INJECTION_KEY_PREFIX: "so-memory-",
}));

import { activeEpistemic, createMemoryState, dropByMessageId, provenance, sceneConflictValues, type LedgerEntry, type MemoryEntry } from "@memory/index";
import type { SceneReadRecord } from "@judge/index";
import { boundValuesFor, detectMemoryConflicts, discardMemoryRow, dismissMemoryConflict, getConflicts, reconfirmMemoryEntry, rereadConflictWindow, resolveMemoryConflict, storeDroppedEntry, type MemoryQueueDeps } from "./memoryQueue";
import type { MemoryRuntimeState } from "./types";

// v2.3 plan 05 (C3). The reconciliation queue's side of the author conversation: what a decision does
// to the stores, what it does to the canon, and where "re-read the window" actually reads.

const entry = (overrides: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id: "m1",
  tier: "facts",
  text: "Mara's condition is steady",
  type: "fact",
  importance: 2,
  expiration: "permanent",
  entities: ["Mara"],
  confidence: 1,
  activationTriggers: [],
  evidence: "she said so",
  createdAt: 1,
  messageId: 3,
  recallCount: 0,
  provenance: provenance({ source: "extractor", messageId: 3, boundary: 1, pass: "shared-read" }),
  ...overrides,
});

const state = (patch: Partial<MemoryRuntimeState> = {}): MemoryRuntimeState => ({
  entries: [],
  excluded: [],
  writeLog: [],
  settings: { enabled: true, epistemicLedgerCapable: false, injectionDepths: { facts: 4, session_details: 3, short_term: 2, scene_history: 6 }, tierBudgets: { facts: 50, session_details: 40, short_term: 10, scene_history: 20 }, tierTokenBudgets: { facts: 400, session_details: 400, short_term: 400, scene_history: 400 } },
  backfill: null,
  sceneCount: 0,
  shortTermSummaryEnd: -1,
  wiWrites: {},
  wiBook: null,
  arcs: [],
  epistemic: [],
  ledger: [],
  canon: { text: "WHAT HAS HAPPENED: the bridge fell.", inputHash: "h", updatedAt: "t" },
  verifyDrops: [],
  derived: [],
  conflicts: [],
  resolvedConflicts: [],
  pinnedOverflow: 0,
  legacyPinPromptSeen: false,
  updatedAt: "t",
  ...patch,
});

const scene = (): SceneReadRecord => ({
  at: "t",
  boundary: 4,
  messageId: 9,
  model: "jev",
  location: { value: "the desert road", confidence: 0.9 },
  facts: { location: "the desert road", time: null, present: [], headingTo: [] },
});

function harness(options: { memory?: MemoryRuntimeState; reread?: jest.Mock; save?: () => Promise<void>; unsaved?: () => boolean; scene?: SceneReadRecord | null } = {}) {
  let memory = options.memory ?? state();
  const patches: Partial<MemoryRuntimeState>[] = [];
  const reread = options.reread ?? jest.fn(async () => undefined);
  const deps: MemoryQueueDeps = {
    getMemory: () => memory,
    patch: (next) => { patches.push(next); memory = { ...memory, ...next }; },
    boundValues: () => ({}),
    sceneValues: () => sceneConflictValues(options.scene),
    boundaryStamp: () => 12,
    updateInjection: () => {},
    save: options.save ?? (async () => {}),
    reread: (window, reason) => reread(window, reason),
    invalidateCanon: () => { memory = { ...memory, canon: memory.canon ? { ...memory.canon, stale: true } : null }; },
    ...(options.unsaved ? { unsaved: options.unsaved } : {}),
  };
  return { deps, patches, reread, read: () => memory };
}

const memoryConflict = () => [
  { key: "fact:m1:mara|condition", detectedAt: "2026-09-21T00:00:00.000Z", window: { from: 3, to: 7 }, sides: [
    { store: "memory" as const, id: "m1", label: "Mara's condition is steady", messageId: 3 },
    { store: "ledger" as const, id: "l1", label: "Mara condition = injured", messageId: 7 },
  ] },
];

describe("the blackboard's envelope for a bound value (v2.3 plan 05)", () => {
  const binding = { qualityKey: "mara_hp", entity: "Mara", field: "hp" };

  it("names the blackboard as the source, the quality key as its input, and the value's version as its revision", () => {
    const bound = boundValuesFor([binding], { mara_hp: 5 }, { mara_hp: 3 });
    expect(bound.mara_hp.provenance).toMatchObject({
      source: "blackboard",
      pass: "blackboard",
      messageId: -1,
      boundary: 0,
      sourceRevision: 3,
      inputs: [{ store: "blackboard", id: "mara_hp" }],
    });
  });

  // A bound field the blackboard has not set is not the blackboard's claim, so it gets no envelope —
  // an envelope saying "the blackboard said this" over an absent value would be the inverse.
  it("says nothing about a bound field with no value", () => {
    expect(boundValuesFor([binding], {}, {})).toEqual({});
    expect(boundValuesFor([binding], { mara_hp: null }, {})).toEqual({});
    expect(boundValuesFor([binding], { mara_hp: 0 }, {})).toMatchObject({ mara_hp: { value: "0" } });
  });
});

describe("the reconciliation queue", () => {
  it("marks both sides on the pass that finds them, and nothing else", () => {
    const h = harness({ memory: state({ entries: [entry()], conflicts: memoryConflict() }) });
    expect(getConflicts(h.deps)).toHaveLength(1);
  });

  it("dismissing puts both sides back in play and stops asking about the pair", async () => {
    const conflicted = { ...entry(), provenance: { ...entry().provenance!, validity: "conflicted" as const } };
    const h = harness({ memory: state({ entries: [conflicted], conflicts: memoryConflict() }) });
    expect(await dismissMemoryConflict(h.deps, "fact:m1:mara|condition")).toBe(true);
    expect(h.read().entries[0].provenance?.validity).toBe("live");
    expect(h.read().conflicts).toEqual([]);
    expect(h.read().resolvedConflicts).toEqual(["fact:m1:mara|condition"]);
  });

  it("refuses a key it is not holding", async () => {
    const h = harness({ memory: state({ entries: [entry()] }) });
    expect(await dismissMemoryConflict(h.deps, "nope")).toBe(false);
    expect(await resolveMemoryConflict(h.deps, "nope", "m1")).toBe(false);
  });

  // v2.3 plan 05: "Lock as canon" is ONE decision. Two awaited calls could leave the pair resolved
  // with an unlocked winner if the second never ran.
  it("locks the kept side in the same write as the resolution", async () => {
    const conflicted = { ...entry(), provenance: { ...entry().provenance!, validity: "conflicted" as const } };
    const h = harness({ memory: state({ entries: [conflicted], conflicts: memoryConflict() }) });
    expect(await resolveMemoryConflict(h.deps, "fact:m1:mara|condition", "m1", true)).toBe(true);
    const kept = h.read().entries.find((row) => row.id === "m1")!;
    expect(kept.locked).toBe(true);
    expect(kept.pinned).toBe(true);
    expect(kept.supersededBy).toBeUndefined();
    expect(kept.provenance).toMatchObject({ source: "author", validity: "live", override: { from: "reconciled" } });
    expect(h.read().conflicts).toEqual([]);
  });

  // v2.3 plan 05: the decision and the write it needs are two events. A resolution the chat cannot
  // persist has to be put back, or the session retires a claim it will not remember retiring and the
  // next pass queues the same pair again.
  it("puts the decision back when the save fails, and says so", async () => {
    const conflicted = { ...entry(), provenance: { ...entry().provenance!, validity: "conflicted" as const } };
    const before = state({ entries: [conflicted], conflicts: memoryConflict() });
    const h = harness({ memory: before, save: async () => { throw new Error("chat file on disk disagrees with the page"); } });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await resolveMemoryConflict(h.deps, "fact:m1:mara|condition", "m1", true)).toBe(false);
    expect(h.read().entries[0].provenance?.validity).toBe("conflicted");
    expect(h.read().entries[0].locked).toBeUndefined();
    expect(h.read().conflicts).toHaveLength(1);
    expect(h.read().resolvedConflicts).toEqual([]);
    expect(h.read().canon?.stale).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("keeping the blackboard side supersedes the ledger row and leaves the fact alone", async () => {
    const h = harness({ memory: state({ entries: [entry()], conflicts: memoryConflict() }) });
    expect(await resolveMemoryConflict(h.deps, "fact:m1:mara|condition", "bound:Mara:condition")).toBe(true);
    const kept = h.read().entries.find((row) => row.id === "m1")!;
    expect(kept.supersededBy).toBeUndefined();
    expect(kept.locked).toBeUndefined();
  });

  // A decided disagreement changes what a canon synthesis would have been built from, so the text
  // derived from the losing claim stops being read until the next pass replaces it.
  it("marks the canon stale, and dismiss leaves it alone", async () => {
    const conflicted = { ...entry(), provenance: { ...entry().provenance!, validity: "conflicted" as const } };
    const resolved = harness({ memory: state({ entries: [conflicted], conflicts: memoryConflict() }) });
    await resolveMemoryConflict(resolved.deps, "fact:m1:mara|condition", "m1");
    expect(resolved.read().canon?.stale).toBe(true);
    expect(resolved.read().canon?.text).toBe("WHAT HAS HAPPENED: the bridge fell.");

    const dismissed = harness({ memory: state({ entries: [conflicted], conflicts: memoryConflict() }) });
    await dismissMemoryConflict(dismissed.deps, "fact:m1:mara|condition");
    expect(dismissed.read().canon?.stale).toBeUndefined();
  });

  // v2.3 plan 05: the re-read asks about the messages the claims came FROM, not about whatever the
  // transcript now ends with — which is the whole difference between resolving and re-reading.
  it("re-reads the conflict's own window, and falls back when the sides name no message", async () => {
    const h = harness({ memory: state({ conflicts: memoryConflict() }) });
    expect(await rereadConflictWindow(h.deps, "fact:m1:mara|condition")).toBe(true);
    expect(h.reread).toHaveBeenCalledWith({ from: 3, to: 7 }, "conflict-reread");

    const nameless = harness({ memory: state({ conflicts: [{ ...memoryConflict()[0], sides: [{ store: "memory", id: "m1", label: "a" }, { store: "ledger", id: "l1", label: "b" }] }] }) });
    await rereadConflictWindow(nameless.deps, "fact:m1:mara|condition");
    expect(nameless.reread).toHaveBeenCalledWith({ from: -1, to: -1 }, "conflict-reread");
  });

  it("does nothing when the caller wired no re-read", async () => {
    const h = harness({ memory: state({ conflicts: memoryConflict() }) });
    delete (h.deps as { reread?: unknown }).reread;
    expect(await rereadConflictWindow(h.deps, "fact:m1:mara|condition")).toBe(false);
  });

  // The read's own verdict is the answer: a re-read that could not read (no story, no state) reports
  // `false` from `runNow`, and reporting that as a re-read would be the same "a refused write looks
  // like a success" shape the queue's other actions are guarded against.
  it("reports the re-read's own verdict rather than that it was asked for", async () => {
    const h = harness({ memory: state({ conflicts: memoryConflict() }), reread: jest.fn(async () => false) });
    expect(await rereadConflictWindow(h.deps, "fact:m1:mara|condition")).toBe(false);
    expect(h.reread).toHaveBeenCalled();
  });
});

describe("a decision the chat never stored (v2.3 plan 05)", () => {
  // The live shape of a save that did not land: ST's `saveChatConditional` wraps the whole write in
  // try/catch (script.js:9412) and `saveMetadata` is a wrapper around it, so the awaited call RESOLVES
  // whatever happened — a `catch` around it is unreachable for the failure it names. The plan-06 save
  // evidence is the signal that is, which is why every decision below reads it and puts itself back.
  const conflicted = () => ({ ...entry(), provenance: { ...entry().provenance!, validity: "conflicted" as const } });
  const neverWritten = () => async () => true;
  const quarantined = () => ({ ...entry(), provenance: { ...entry().provenance!, validity: "source-removed" as const } });

  it("puts a resolution back, and answers false, when the save resolved but did not land", async () => {
    const h = harness({ memory: state({ entries: [conflicted()], conflicts: memoryConflict() }), unsaved: neverWritten() });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await resolveMemoryConflict(h.deps, "fact:m1:mara|condition", "m1", true)).toBe(false);
    expect(h.read().entries[0].provenance?.validity).toBe("conflicted");
    expect(h.read().entries[0].locked).toBeUndefined();
    expect(h.read().conflicts).toHaveLength(1);
    expect(h.read().resolvedConflicts).toEqual([]);
    expect(h.read().canon?.stale).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("puts a dismissal back, so both sides stay out of play and the pair is still asked about", async () => {
    const h = harness({ memory: state({ entries: [conflicted()], conflicts: memoryConflict() }), unsaved: neverWritten() });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await dismissMemoryConflict(h.deps, "fact:m1:mara|condition")).toBe(false);
    expect(h.read().entries[0].provenance?.validity).toBe("conflicted");
    expect(h.read().conflicts).toHaveLength(1);
    expect(h.read().resolvedConflicts).toEqual([]);
    warn.mockRestore();
  });

  it("puts Store anyway back, so a dropped row is not written as a claim the chat will forget", async () => {
    const dropped = entry({ id: "d1", text: "The ferryman owes the player a crossing" });
    const h = harness({ memory: state({ verifyDrops: [{ entry: dropped, p: 0.2, at: "t", model: "jev" }] }), unsaved: neverWritten() });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await storeDroppedEntry(h.deps, "d1", "2026-09-21T00:00:00.000Z")).toBe(false);
    expect(h.read().entries).toEqual([]);
    expect(h.read().verifyDrops).toHaveLength(1);
    warn.mockRestore();
  });

  it("puts a reconfirmation back in either store, so a quarantined row is not called live on a rumour", async () => {
    const h = harness({ memory: state({ entries: [quarantined()] }), unsaved: neverWritten() });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await reconfirmMemoryEntry(h.deps, "m1", "t")).toBe(false);
    expect(h.read().entries[0].provenance?.validity).toBe("source-removed");
    const privateRow = { id: "e1", tag: "hiding" as const, subject: "Arin", hiddenFrom: "Ponticius", content: "cash", createdAt: 2, messageId: 4, entities: ["Arin"], confidence: 1, provenance: { ...provenance({ source: "extractor", messageId: 4, boundary: 1, pass: "epistemic" }), validity: "source-removed" as const } };
    const p = harness({ memory: state({ epistemic: [privateRow] }), unsaved: neverWritten() });
    expect(await reconfirmMemoryEntry(p.deps, "e1", "t")).toBe(false);
    expect(p.read().epistemic[0].provenance?.validity).toBe("source-removed");
    warn.mockRestore();
  });

  // The control for the four above: the same wiring, with the save evidence saying the write landed.
  it("lets the same decisions stand when the write did land", async () => {
    const h = harness({ memory: state({ entries: [conflicted()], conflicts: memoryConflict() }), unsaved: () => false });
    expect(await resolveMemoryConflict(h.deps, "fact:m1:mara|condition", "m1", true)).toBe(true);
    expect(h.read().entries[0].locked).toBe(true);
    expect(h.read().resolvedConflicts).toEqual(["fact:m1:mara|condition"]);
  });
});

describe("a decision and a rollback (v2.3 plan 05)", () => {
  // The override is anchored to the boundary it was MADE at, not to the message it was about, so
  // undoing the source does not undo the decision — and undoing the decision does.
  it("survives a rollback past the source message, and goes with a rollback past its own boundary", async () => {
    const conflicted = { ...entry(), provenance: { ...entry().provenance!, validity: "conflicted" as const } };
    const h = harness({ memory: state({ entries: [conflicted], conflicts: memoryConflict() }) });
    await resolveMemoryConflict(h.deps, "fact:m1:mara|condition", "m1");
    const resolved = { ...h.read().entries[0] };
    expect(resolved.provenance?.override?.boundary).toBe(12);

    // The rollback lands AFTER the decision (boundary 14 > 12): the decision stands, and so does the
    // row — the author kept it knowing where it came from.
    const pastSource = dropByMessageId({ ...createMemoryState(), entries: [resolved] }, 3, 14);
    expect(pastSource.entries.map((row) => row.id)).toEqual(["m1"]);
    expect(pastSource.entries[0].provenance?.override?.boundary).toBe(12);

    // The rollback lands AT the decision: undoing it and removing the message it was about are the
    // same act, and this row had no other life, so it goes rather than being resurrected.
    const both = dropByMessageId({ ...createMemoryState(), entries: [resolved] }, 3, 12);
    expect(both.entries).toEqual([]);
  });
});

describe("the author's other memory decisions", () => {
  it("Store anyway writes the dropped row as the author's claim", async () => {
    const dropped = entry({ id: "d1", text: "The ferryman owes the player a crossing" });
    const h = harness({ memory: state({ verifyDrops: [{ entry: dropped, p: 0.2, at: "t", model: "jev" }] }) });
    expect(await storeDroppedEntry(h.deps, "d1", "2026-09-21T00:00:00.000Z")).toBe(true);
    const written = h.read().entries[0];
    expect(written.text).toBe(dropped.text);
    expect(written.confidence).toBe(0.2);
    expect(written.provenance).toMatchObject({ source: "author", validity: "live", override: { boundary: 12, from: "verify-drop" } });
    expect(h.read().verifyDrops).toEqual([]);
  });

  it("Store anyway answers false for a row it has no drop for", async () => {
    const h = harness({ memory: state() });
    expect(await storeDroppedEntry(h.deps, "nope", "t")).toBe(false);
  });

  it("reconfirming a quarantined row makes it the author's claim", async () => {
    const quarantined = { ...entry(), provenance: { ...entry().provenance!, validity: "source-removed" as const } };
    const h = harness({ memory: state({ entries: [quarantined] }) });
    await reconfirmMemoryEntry(h.deps, "m1", "2026-09-21T00:00:00.000Z");
    expect(h.read().entries[0].provenance).toMatchObject({ source: "author", validity: "live", override: { from: "reconfirm" } });
  });

  it("reconfirms a quarantined PRIVATE row too — the same decision, the other store", async () => {
    // `activeEpistemic` said a rolled-back private row "stays in the store so the author can see and
    // reconfirm it"; nothing did, so a rolled-back `[hiding]` fact was unrecoverable (2026-09-21).
    const hidden = {
      id: "e1", tag: "hiding" as const, subject: "Arin", hiddenFrom: "Ponticius", content: "Arin palmed the guild's petty cash",
      createdAt: 2, messageId: 4, entities: ["Arin"], confidence: 1,
      provenance: { ...provenance({ source: "extractor", messageId: 4, boundary: 1, pass: "epistemic" }), validity: "source-removed" as const },
    };
    const h = harness({ memory: state({ epistemic: [hidden] }) });
    await reconfirmMemoryEntry(h.deps, "e1", "2026-09-21T00:00:00.000Z");
    expect(h.read().epistemic[0].provenance).toMatchObject({ source: "author", validity: "live", override: { from: "reconfirm" } });
    expect(activeEpistemic(h.read().epistemic)).toHaveLength(1);
  });

  it("V7: reconfirms a quarantined pinned LEDGER row, which a rollback now quarantines instead of keeping live", async () => {
    const row: LedgerEntry = { id: "l1", entity: "Kael", entityType: "character", field: "location", value: "the crypt", createdAt: 2, messageId: 4, pinned: true,
      provenance: { ...provenance({ source: "extractor", messageId: 4, boundary: 1, pass: "ledger" }), validity: "source-removed" as const } };
    const h = harness({ memory: state({ ledger: [row] }) });
    expect(await reconfirmMemoryEntry(h.deps, "l1", "2026-09-23T00:00:00.000Z")).toBe(true);
    expect(h.read().ledger[0].provenance).toMatchObject({ source: "author", validity: "live", override: { from: "reconfirm" } });
  });

  it("writes nothing for an id neither store holds", async () => {
    const h = harness({ memory: state({ entries: [entry()] }) });
    await reconfirmMemoryEntry(h.deps, "ghost", "t");
    expect(h.read().entries[0].provenance).toMatchObject({ source: "extractor" });
    expect(h.read().epistemic).toEqual([]);
  });
});

describe("the scene read joins the queue (v2.3 plan 05)", () => {
  const ledgerRow = (field: string, value: string): LedgerEntry => ({ id: `l-${field}`, entity: "The party", entityType: "group", field, value, createdAt: 5, messageId: 5 });

  it("queues a scene read the ledger disagrees with, and marks only the ledger row", () => {
    const h = harness({ memory: state({ ledger: [ledgerRow("location", "the guild hall")] }), scene: scene() });
    const queued = detectMemoryConflicts(h.deps);
    expect(queued.map((pair) => pair.key)).toEqual(["scene:location"]);
    expect(h.read().ledger[0].provenance?.validity).toBe("conflicted");
    expect(h.read().conflicts[0].sides[1]).toMatchObject({ store: "scene", messageId: 9, confidence: 0.9 });
  });

  it("leaves a scene that agrees alone", () => {
    const h = harness({ memory: state({ ledger: [ledgerRow("location", "the desert road")] }), scene: scene() });
    expect(detectMemoryConflicts(h.deps)).toEqual([]);
  });
});

describe("V8: Discard is written or it is put back", () => {
  const removed = { validity: "source-removed" as const };
  const fact = () => ({ ...entry(), provenance: { ...entry().provenance!, ...removed } });
  const hidden = () => ({ id: "e1", tag: "hiding" as const, subject: "Arin", hiddenFrom: "Ponticius", content: "cash", createdAt: 2, messageId: 4, entities: ["Arin"], confidence: 1, provenance: { ...provenance({ source: "extractor", messageId: 4, boundary: 1, pass: "epistemic" }), ...removed } });
  const ledgerRow = () => ({ id: "l1", entity: "Mara", entityType: "character", field: "condition", value: "injured", createdAt: 2, messageId: 7, provenance: { ...provenance({ source: "extractor", messageId: 7, boundary: 2, pass: "ledger" }), ...removed } }) as unknown as LedgerEntry;
  const full = () => state({ entries: [fact()], epistemic: [hidden()], ledger: [ledgerRow()] });

  it("puts a discarded fact, private row or ledger row back when the save did not land", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    for (const id of ["m1", "e1", "l1"]) {
      const h = harness({ memory: full(), unsaved: () => true });
      expect(await discardMemoryRow(h.deps, id)).toBe(false);
      expect([h.read().entries.length, h.read().epistemic.length, h.read().ledger.length]).toEqual([1, 1, 1]);
      expect(h.read().excluded).toEqual([]);
      expect(h.read().derived).toEqual([]);
    }
    warn.mockRestore();
  });

  it("control: a landed discard removes the row, and a discarded fact is an exclusion a rollback can undo", async () => {
    const h = harness({ memory: full(), unsaved: () => false });
    h.deps.lastMessageId = () => 9;
    expect(await discardMemoryRow(h.deps, "m1")).toBe(true);
    expect(h.read().entries).toEqual([]);
    expect(h.read().excluded).toHaveLength(1);
    expect(h.read().derived).toEqual([expect.objectContaining({ kind: "exclusion", inputs: ["m1"], boundary: 12, messageId: 9, removed: [expect.objectContaining({ id: "m1" })] })]);
    expect(await discardMemoryRow(h.deps, "e1")).toBe(true);
    expect(await discardMemoryRow(h.deps, "l1")).toBe(true);
    expect([h.read().epistemic, h.read().ledger]).toEqual([[], []]);
  });

  it("answers false for an id no store holds, and writes nothing", async () => {
    const save = jest.fn(async () => {});
    const h = harness({ memory: full(), save });
    expect(await discardMemoryRow(h.deps, "gone")).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });
});
