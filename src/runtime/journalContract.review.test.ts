import { testModel } from "../../test/support/modelCallHost";
jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: [], chatId: "chat-a", extensionSettings: {}, chatMetadata: {} }),
  getActiveGroup: () => null,
}));

import * as linearStory from "../../test/fixtures/linear.story.json";
import { ApplyQueue } from "@engine/applyQueue";
import { Blackboard } from "@engine/blackboard";
import { parseStoryV2OrThrow } from "@engine/validate";
import type { BoundaryLogEntry } from "@engine/index";
import type { SharedReadAudit } from "@extraction/index";
import { ExtractionCoordinator } from "./coordinators/extractionCoordinator";
import { buildSessionJournal, DISCARD_REASON } from "./journal";
import { testOwnership } from "../../test/findings/testOwnership";

// Plan 01 §A, the journal contract: read -> queued -> applied/discarded is linked by the read's id,
// not by matching equal delta strings; a boundary that applied nothing is journaled; a discarded write
// is named with its reason.

const at = (seconds: number) => new Date(Date.parse("2026-09-23T10:00:00.000Z") + seconds * 1000).toISOString();

const audit = (id: string, q: string, seconds: number): SharedReadAudit => ({
  id, createdAt: at(seconds), priority: 1, reason: "cadence", contractHash: "h", scope: [q], window: { from: 0, to: 2 },
  prompt: "", rawResponse: "", acceptedDeltas: [{ delta: { q, v: true, source: "extractor" }, evidence: q }], rejected: [],
});

const sources = (boundaryLog: BoundaryLogEntry[], audits: SharedReadAudit[], pending: BoundaryLogEntry["queue"]["discarded"] = []) =>
  buildSessionJournal({ records: [], boundaryLog, audits, reconciliationEvents: [], payloadCaptures: [], talkDecisions: [], pending });

describe("V20e: the journal contract", () => {
  it("the queue keeps a write's origin through the drain, applied and discarded alike", () => {
    const story = parseStoryV2OrThrow(linearStory);
    const queue = new ApplyQueue();
    queue.enqueue({ source: "extractor", origin: "audit-old", blackboardVersionSum: 0, turnRange: { from: 1, to: 1 }, deltas: [{ q: "has_key", v: true, source: "extractor" }] });
    queue.enqueue({ source: "extractor", origin: "audit-new", blackboardVersionSum: 0, turnRange: { from: 1, to: 2 }, deltas: [{ q: "has_key", v: false, source: "extractor" }, { q: "door_open", v: true, source: "extractor" }] });
    const result = queue.drainAtBoundary(new Blackboard(story));
    expect(result.applied.map((entry) => entry.origin)).toEqual(["audit-new"]);
    expect(result.discarded.map((entry) => entry.origin)).toEqual(["audit-old"]);
  });

  it("a shared read enqueues its deltas under its own audit id", async () => {
    const origins: string[] = [];
    const coordinator = new ExtractionCoordinator({ ownership: testOwnership(),
      getStory: () => ({ title: "S", qualityByKey: {}, checkpointById: {}, roster: [] }),
      getState: () => ({ activeCheckpointId: "cp1", boundary: 3 }),
      getExtraction: () => ({ audits: [], reconciliationEvents: [], judgedReads: [] }),
      model: testModel("p1"),
      memory: { enabled: false, capable: false, applyEntries: async () => {}, recordVerifyDrops: () => {}, applyArcSignals: () => [], applyEpistemic: () => {}, applyLedger: () => {}, updateInjection: () => {} },
      getFiredTransitions: () => [],
      getExpansionGateSources: () => [],
      enqueueExtractorDeltas: (_accepted: unknown, _window: unknown, origin: string) => { origins.push(origin); },
      commitBoundary: async () => {},
      emitSceneBreak: () => {},
      emitArcsResolved: () => {},
      setStatus: () => {},
      judge: () => null,
      persist: async () => {},
      notify: () => {},
    } as never);
    await coordinator.applyAudit(audit("audit-7", "has_key", 0), [], [], [], [], [], null);
    expect(origins).toEqual(["audit-7"]);
  });

  it("links a read to the boundary that applied it, and names the one that was discarded", () => {
    const boundary: BoundaryLogEntry = {
      at: Date.parse(at(5)), boundary: 4, source: "gate", fired: null, evaluated: {}, context: { lastMessageId: 2, chatLength: 3 },
      before: { activeCheckpointId: "cp1" } as BoundaryLogEntry["before"], after: { activeCheckpointId: "cp1" } as BoundaryLogEntry["after"],
      queue: {
        applied: [{ source: "extractor", origin: "audit-new", blackboardVersionSum: 0, deltas: [{ q: "door_open", v: true }], outcomes: [] }],
        discarded: [{ source: "extractor", origin: "audit-old", blackboardVersionSum: 0, deltas: [{ q: "has_key", v: true }] }],
      },
    };
    const journal = sources([boundary], [audit("audit-old", "has_key", 1), audit("audit-new", "door_open", 2)]);
    const row = journal.find((event) => event.kind === "boundary");
    expect(row?.summary).toBe("applied door_open=true; discarded has_key=true (superseded)");
    expect(row?.detail?.applied).toEqual([{ origin: "audit-new", deltas: ["door_open=true"] }]);
    expect(row?.detail?.discarded).toEqual([{ origin: "audit-old", deltas: ["has_key=true"], reason: DISCARD_REASON }]);
    const readIds = journal.filter((event) => event.kind === "delta").map((event) => event.detail?.auditId);
    expect(readIds).toEqual(["audit-old", "audit-new"]);
  });

  it("journals a boundary that applied nothing instead of omitting it", () => {
    const quiet: BoundaryLogEntry = {
      at: Date.parse(at(3)), boundary: 2, source: "gate", fired: null, evaluated: {}, context: { lastMessageId: 1, chatLength: 2 },
      before: { activeCheckpointId: "cp1" } as BoundaryLogEntry["before"], after: { activeCheckpointId: "cp1" } as BoundaryLogEntry["after"],
      queue: { applied: [], discarded: [] },
    };
    expect(sources([quiet], []).map((event) => event.summary)).toEqual(["boundary 2: nothing applied (gate)"]);
  });

  it("shows a write still in the queue as queued, at the read that produced it", () => {
    const journal = sources([], [audit("audit-9", "has_key", 4)], [{ source: "extractor", origin: "audit-9", blackboardVersionSum: 0, turnRange: { from: 0, to: 2 }, deltas: [{ q: "has_key", v: true }] }]);
    const queued = journal.find((event) => event.detail?.state === "queued");
    expect(queued).toMatchObject({ at: at(4), kind: "delta", summary: "queued has_key=true for the next boundary", detail: { origin: "audit-9" } });
  });
});
