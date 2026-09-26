import { plantedModel } from "../../../test/support/modelCall";
const stapi = {
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: [], chatId: "chat-a", extensionSettings: {}, chatMetadata: {} }),
  getActiveGroup: () => null,
};

import { ExtractionCoordinator } from "./extractionCoordinator";
import type { ReadOwnership } from "@extraction/index";
import { testOwnership } from "../../../test/findings/testOwnership";

function harness() {
  const writes: string[] = [];
  const extraction = { audits: [] as unknown[], reconciliationEvents: [] as unknown[], judgedReads: [] as unknown[] };
  const memory = {
    enabled: true,
    capable: true,
    applyEntries: async () => { writes.push("applyEntries"); },
    recordVerifyDrops: () => { writes.push("recordVerifyDrops"); },
    applyArcSignals: () => { writes.push("applyArcSignals"); return []; },
    applyEpistemic: () => { writes.push("applyEpistemic"); },
    applyLedger: () => { writes.push("applyLedger"); },
    updateInjection: () => {},
  };
  const coordinator = new ExtractionCoordinator({ ownership: testOwnership(),
    getStory: () => ({ title: "S", qualityByKey: {}, checkpointById: {}, roster: [] }),
    getState: () => ({ activeCheckpointId: "cp1", boundary: 3 }),
    getExtraction: () => extraction,
    model: plantedModel,
    memory,
    getFiredTransitions: () => [],
    getExpansionGateSources: () => [],
    enqueueExtractorDeltas: () => { writes.push("enqueueExtractorDeltas"); },
    commitBoundary: async () => {},
    emitSceneBreak: () => {},
    emitArcsResolved: () => {},
    setStatus: () => {},
    judge: () => null,
    persist: async () => { writes.push("persist"); },
    notify: () => {},
  } as never);
  return { coordinator, writes, extraction };
}

const audit = { reason: "cadence", window: { from: 0, to: 4 }, acceptedDeltas: [{ key: "reached_gate", value: true }], sceneBreak: null } as never;
const facts = [{ text: "The gate is open.", importance: 2, evidence: "gate" }] as never;
const guard = (owns: boolean): ReadOwnership => ({ stillOwns: () => owns, lapsedDetail: () => (owns ? null : "chat: chat-a -> chat-b") });

describe("V2: a lapsed shared read writes nothing, deltas included", () => {
  it("drops the whole result when the read's world moved during the model call", async () => {
    const h = harness();
    await h.coordinator.applyAudit(audit, facts, [], [], [], [], guard(false));
    expect(h.writes).toEqual([]);
    expect(h.extraction.audits).toHaveLength(0);
  });

  it("control: an owned read enqueues its deltas and stores its facts", async () => {
    const h = harness();
    await h.coordinator.applyAudit(audit, facts, [], [], [], [], guard(true));
    expect(h.writes).toEqual(expect.arrayContaining(["enqueueExtractorDeltas", "applyEntries"]));
    expect(h.extraction.audits).toHaveLength(1);
  });
});
