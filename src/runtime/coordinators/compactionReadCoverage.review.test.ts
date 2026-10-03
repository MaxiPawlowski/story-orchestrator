import { fakeHosts } from "../../../test/support/fakeHosts";
import { recordingModel } from "../../../test/support/modelCall";
import { testOwnership } from "../../../test/findings/testOwnership";
import { SHARED_SUMMARY_PRIVACY_RULE } from "@memory/contract";
import { ExtractionCoordinator } from "./extractionCoordinator";

const CHAT = Array.from({ length: 30 }, (_, index) => ({ name: index % 2 ? "Aria" : "Kel", mes: `line ${index}`, is_user: index % 2 === 0 }));

function harness({ group, coveredTo, capable = true }: { group: boolean; coveredTo: number | null; capable?: boolean }) {
  const written: Array<{ text: string; to: number }> = [];
  const model = recordingModel(() => "They crossed the river at dusk.");
  const stapi = {
    getContext: () => ({ chat: CHAT, chatId: "chat-a", extensionSettings: {}, chatMetadata: {} }),
    getActiveGroup: () => (group ? { id: "g", members: ["Aria.png", "Bram.png"], disabled_members: [] } : null),
    countTokens: async () => 4,
  };
  const audits = coveredTo === null ? [] : [{ id: "r1", window: { from: Math.max(0, coveredTo - 4), to: coveredTo } }];
  const coordinator = new ExtractionCoordinator({ hosts: fakeHosts(stapi), ownership: testOwnership(),
    getStory: () => ({ title: "S", qualityByKey: {}, checkpointById: {}, roster: [] }),
    getState: () => ({ activeCheckpointId: "cp1", boundary: 3 }),
    getExtraction: () => ({ settings: { enabled: true }, audits, reconciliationEvents: [], judgedReads: [] }),
    model,
    memory: {
      enabled: true,
      capable,
      shortTermSummaryEnd: -1,
      shortTermEntry: () => null,
      replaceShortTerm: async (entry: { text: string }, span: { to: number }) => { written.push({ text: entry.text, to: span.to }); },
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
    persist: async () => {},
    notify: () => {},
  } as never);
  return { coordinator, written, model };
}

describe("T7-1 secret spread: the rolling summary never gets ahead of the reads that name secrets (payloads.jsonl:102,104)", () => {
  it("in a group that tracks knowledge, compaction waits while the reads have covered too little", async () => {
    const run = harness({ group: true, coveredTo: 10 });
    expect(run.coordinator.shouldCompactShortTerm(29)).toBe(false);
    await run.coordinator.runShortTermCompaction();
    expect(run.written).toEqual([]);
  });

  it("then summarizes only up to the last message a read has seen, under the shared-summary privacy rule", async () => {
    const run = harness({ group: true, coveredTo: 20 });
    expect(run.coordinator.shouldCompactShortTerm(29)).toBe(true);
    await run.coordinator.runShortTermCompaction();
    expect(run.written).toEqual([{ text: "They crossed the river at dusk.", to: 20 }]);
    expect(run.model.calls[0].prompt).toContain(SHARED_SUMMARY_PRIVACY_RULE);
    expect(run.model.calls[0].prompt).not.toContain("line 21");
  });

  it("control: a solo chat, or a group without knowledge tracking, compacts the whole window as before", async () => {
    for (const options of [{ group: false, coveredTo: 10 }, { group: true, coveredTo: 10, capable: false }]) {
      const run = harness(options);
      await run.coordinator.runShortTermCompaction();
      expect(run.written).toEqual([{ text: "They crossed the river at dusk.", to: 29 }]);
    }
  });

  it("control: reads stalled far behind (extraction paused) do not freeze the summary", async () => {
    const run = harness({ group: true, coveredTo: 3 });
    await run.coordinator.runShortTermCompaction();
    expect(run.written).toEqual([{ text: "They crossed the river at dusk.", to: 29 }]);
  });
});

describe("T7-1 secret spread: a read's secret is stored before the shared rows it came with", () => {
  it("applies the knowledge lines before the memory rows, so no injection carries a row without its secret", async () => {
    const order: string[] = [];
    const coordinator = new ExtractionCoordinator({ hosts: fakeHosts({ getContext: () => ({ chat: CHAT, chatId: "chat-a" }), getActiveGroup: () => null }), ownership: testOwnership(),
      getStory: () => ({ title: "S", qualityByKey: {}, checkpointById: {}, roster: [] }),
      getState: () => ({ activeCheckpointId: "cp1", boundary: 3 }),
      getExtraction: () => ({ settings: { enabled: true }, audits: [], reconciliationEvents: [], judgedReads: [] }),
      model: recordingModel(),
      memory: {
        enabled: true,
        capable: true,
        applyEntries: async () => { order.push("rows"); },
        applyEpistemic: () => { order.push("secrets"); },
        recordVerifyDrops: () => {},
        updateInjection: () => {},
      },
      judge: () => null,
      enqueueExtractorDeltas: () => {},
      emitSceneBreak: () => {},
      emitArcsResolved: () => {},
      persist: async () => {},
      notify: () => {},
    } as never);
    const audit = { id: "r1", reason: "cadence", window: { from: 20, to: 23 }, acceptedDeltas: [] };
    const memory = [{ tier: "session_details", text: "Kel carries a silver key.", type: "detail", importance: 2, expiration: "session", entities: [], evidence: "x" }];
    const secret = [{ tag: "hiding", subject: "Kel", hiddenFrom: "Bram", content: "that he carries a silver key" }];
    await coordinator.applyAudit(audit as never, [], memory as never, [], secret as never);
    expect(order).toEqual(["secrets", "rows"]);
  });
});
