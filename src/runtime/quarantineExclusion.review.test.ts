jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  setStoryExtensionPrompt: jest.fn(),
  clearStoryExtensionPrompt: jest.fn(),
}));

import {
  activeEpistemic,
  applyLedgerSignals,
  buildLedgerView,
  buildMemoryInjectionBlocks,
  highImportanceFacts,
  provenance,
  renderPrivateEpistemicBlock,
  rollbackEpistemic,
  rollbackLedger,
  sceneFieldsInConflict,
  setLedgerPinned,
  withValidity,
  type EpistemicEntry,
  type MemoryEntry,
  type MemoryTier,
} from "@memory/index";
import { confirmedSceneFacts, sceneTrackerText, type SceneReadRecord } from "@judge/index";
import { mirroredEntries } from "./memoryMirror";

const QUARANTINED = "QUARANTINED-CLAIM";
const LIVE = "LIVE-CLAIM";

const entry = (overrides: Partial<MemoryEntry>): MemoryEntry => ({
  id: overrides.id ?? "m",
  tier: "facts",
  text: "text",
  type: "fact",
  importance: 3,
  expiration: "permanent",
  entities: [],
  confidence: 1,
  activationTriggers: [],
  evidence: "evidence",
  createdAt: 1,
  recallCount: 0,
  provenance: provenance({ source: "extractor", messageId: 1, boundary: 1, pass: "shared-read" }),
  ...overrides,
});
const quarantine = <T extends MemoryEntry>(row: T, validity: "source-removed" | "conflicted" = "source-removed"): T => ({ ...row, ...withValidity(row, validity) });

const budgets: Record<MemoryTier, number> = { facts: 100000, session_details: 100000, short_term: 100000, scene_history: 100000 };

describe("V7: a quarantined row reaches no consumer", () => {
  const rows: MemoryEntry[] = [
    quarantine(entry({ id: "q-fact", text: QUARANTINED })),
    quarantine(entry({ id: "q-rel", text: `${QUARANTINED} relationship`, type: "relationship", tier: "session_details" }), "conflicted"),
    quarantine(entry({ id: "q-scene", text: `${QUARANTINED} scene`, type: "scene", tier: "scene_history" })),
    entry({ id: "l-fact", text: LIVE }),
    entry({ id: "l-rel", text: `${LIVE} relationship`, type: "relationship", tier: "session_details" }),
  ];

  it("the injected tier blocks", () => {
    const blocks = buildMemoryInjectionBlocks(rows, null, { tokenBudgets: budgets, scoreContext: { boundary: 0, turnText: "", turnEntities: [] } });
    expect(Object.values(blocks).join("\n")).not.toContain(QUARANTINED);
    expect(blocks.facts).toContain(LIVE);
  });

  it("the World Info memory mirror", () => {
    const mirrored = mirroredEntries(rows).map((row) => row.id);
    expect(mirrored).not.toContain("q-rel");
    expect(mirrored).not.toContain("q-scene");
    expect(mirrored).toContain("l-rel");
  });

  it("the facts a canon synthesis is built from", () => {
    const ids = highImportanceFacts(rows, 30).map((row) => row.id);
    expect(ids).toEqual(["l-fact"]);
  });

  it("a pinned ledger row whose source was rolled back leaves the ledger view (and its block)", () => {
    const ledger = applyLedgerSignals([], [{ entity: "Kael", entityType: "character", field: "location", value: QUARANTINED }], new Set(), { boundary: 1, messageId: 4 });
    const rolled = rollbackLedger(setLedgerPinned(ledger, ledger[0].id, true), 4);
    expect(rolled).toHaveLength(1);
    expect(rolled[0].provenance?.validity).toBe("source-removed");
    expect(buildLedgerView(rolled, [], {}, {}).map((row) => row.value)).not.toContain(QUARANTINED);
  });

  it("a pinned private row whose source was rolled back leaves the private block", () => {
    const row: EpistemicEntry = { id: "e1", subject: "Arin", tag: "hiding", content: QUARANTINED, hiddenFrom: "Luke", pinned: true, messageId: 4, createdAt: 1 } as EpistemicEntry;
    const rolled = rollbackEpistemic([row], 4);
    expect(activeEpistemic(rolled)).toEqual([]);
    expect(renderPrivateEpistemicBlock(rolled, ["Arin"])).not.toContain(QUARANTINED);
  });

  it("a scene field named by a queued conflict is withheld from the tracker, the rest still steers", () => {
    const record = { facts: { location: "the north gate", time: "dusk", present: ["Arin"], headingTo: [] } } as unknown as SceneReadRecord;
    const withheld = sceneFieldsInConflict([{ sides: [{ store: "ledger", id: "led-1" }, { store: "scene", id: "scene:location" }] }]);
    const facts = confirmedSceneFacts(record, withheld);
    expect(facts?.location).toBeNull();
    expect(facts?.time).toBe("dusk");
    expect(sceneTrackerText(facts!)).not.toContain("north gate");
  });

  it("control: with no queued conflict the scene field steers", () => {
    const record = { facts: { location: "the north gate", time: "dusk", present: [], headingTo: [] } } as unknown as SceneReadRecord;
    expect(confirmedSceneFacts(record, sceneFieldsInConflict([]))?.location).toBe("the north gate");
  });
});
