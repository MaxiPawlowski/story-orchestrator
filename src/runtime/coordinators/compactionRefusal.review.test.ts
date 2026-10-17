import { fakeHosts } from "../../../test/support/fakeHosts";
import { sendModel } from "../../../test/support/modelCall";

const reply = { text: "They crossed the river at dusk.", calls: 0 };
const CHAT = Array.from({ length: 14 }, (_, index) => ({ name: index % 2 ? "Mira" : "Max", mes: `line ${index}`, is_user: index % 2 === 0 }));

const stapi = {
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: CHAT, chatId: "chat-a", extensionSettings: {}, chatMetadata: {} }),
  getActiveGroup: () => null,
  getCharacterNameById: () => null,
  countTokens: async () => 4,
  sendConnectionProfileRequest: async () => { reply.calls += 1; return { ok: true, text: reply.text, finish: "stop" }; },
};

import { ExtractionCoordinator } from "./extractionCoordinator";
import { testOwnership } from "../../../test/findings/testOwnership";

const PREVIOUS = { id: "st-1", text: "Max met Mira at the ford.", tier: "short_term", pinned: false };

function harness() {
  const written: string[] = [];
  const journal: Array<[string, string]> = [];
  const coordinator = new ExtractionCoordinator({ hosts: fakeHosts(stapi), ownership: testOwnership(),
    getStory: () => ({ title: "S", qualityByKey: {}, checkpointById: {}, roster: [] }),
    getState: () => ({ activeCheckpointId: "cp1", boundary: 3 }),
    getExtraction: () => ({ audits: [], reconciliationEvents: [], judgedReads: [] }),
    model: sendModel(stapi.sendConnectionProfileRequest as never, "p1"),
    memory: {
      enabled: true,
      shortTermSummaryEnd: -1,
      shortTermEntry: () => PREVIOUS,
      replaceShortTerm: async (entry: { text: string }) => { written.push(entry.text); },
      updateInjection: () => {},
    },
    getFiredTransitions: () => [],
    getExpansionGateSources: () => [],
    enqueueExtractorDeltas: () => {},
    commitBoundary: async () => {},
    fireSceneBreakReplies: async () => {},
    emitSceneBreak: () => {},
    emitArcsResolved: () => {},
    setStatus: () => {},
    journal: (summary: string, note: string) => { journal.push([summary, note]); },
    persist: async () => {},
    notify: () => {},
  } as never);
  return { coordinator, written, journal };
}

beforeEach(() => { reply.text = "They crossed the river at dusk."; reply.calls = 0; });

describe("v2.8 69 K1: a refused compaction keeps the previous short-term entry", () => {
  it.each([
    ["empty", "   "],
    ["longer-than-inputs", `${PREVIOUS.text} ${CHAT.map((row) => `${row.name}: ${row.mes}`).join(" ")} and then everything again in more words`],
  ])("a %s summary is refused, journalled, and the previous entry survives", async (reason, text) => {
    reply.text = text;
    const run = harness();
    await run.coordinator.runShortTermCompaction();
    expect(run.written).toEqual([]);
    expect(run.journal).toEqual([["compaction-refused", expect.stringContaining(reason)]]);
  });

  it("control: a valid summary replaces the entry", async () => {
    const run = harness();
    await run.coordinator.runShortTermCompaction();
    expect(run.written).toEqual(["They crossed the river at dusk."]);
    expect(run.journal).toEqual([]);
  });

  it("the same refused input is retried once, then not asked again", async () => {
    reply.text = "  ";
    const run = harness();
    for (let attempt = 0; attempt < 4; attempt += 1) await run.coordinator.runShortTermCompaction();
    expect(reply.calls).toBe(2);
    expect(run.written).toEqual([]);
  });
});
