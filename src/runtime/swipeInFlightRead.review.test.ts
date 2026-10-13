import { ExtractionScheduler, type ReadOwnership, type SchedulerHost, type SharedReadAudit, type SharedReadWindow } from "@extraction/index";
import { RuntimeManager } from "./runtimeManager";
import { TurnBridge } from "./turnBridge";
import { beginRun } from "./runToken";
import { SPIKE_STORY } from "../../test/support/spikeHarness";
import { resetSpikeHost, spikeContext, spikeEvents } from "../../test/support/spikeHost";

jest.mock("@services/STAPI", () => jest.requireActual("../../test/support/spikeHost").spikeStapi);

interface PendingRead {
  reason: string;
  window: SharedReadWindow;
  resolve: (result: unknown) => void;
}

const reads: PendingRead[] = [];

jest.mock("../extraction/sharedRead", () => {
  const actual = jest.requireActual("../extraction/sharedRead");
  return {
    ...actual,
    runSharedRead: (options: { reason: string; window: SharedReadWindow }) => new Promise((resolve) => {
      reads.push({ reason: options.reason, window: options.window, resolve });
    }),
  };
});

const settle = async () => {
  for (let tick = 0; tick < 30; tick += 1) await new Promise<void>((resolve) => setImmediate(resolve));
};

const finish = (index: number, text: string) => {
  const read = reads[index];
  const audit: SharedReadAudit = {
    id: `read-${index}`, createdAt: new Date().toISOString(), priority: 0, reason: read.reason,
    contractHash: "scripted", scope: ["key"], window: { from: read.window.from, to: read.window.to },
    prompt: "", rawResponse: text, acceptedDeltas: [], rejected: [],
  };
  read.resolve({ audit, facts: [{ text, evidence: text, importance: 2, messageId: read.window.to }], memory: [], arcs: [], epistemic: [], ledger: [] });
};

async function harness() {
  resetSpikeHost();
  const manager = new RuntimeManager();
  const bridge = new TurnBridge(manager, manager.chatSave);
  bridge.start();
  await spikeEvents.emit("CHAT_CHANGED");
  await manager.importStory(SPIKE_STORY);
  spikeContext.chat.push({ name: "Player", is_user: true, mes: "Look around." });
  spikeContext.chat.push({ name: "Guide", is_user: false, mes: "The lamp is blue.", swipes: ["The lamp is blue.", "The lamp is green."], swipe_id: 0 });
  await spikeEvents.emit("MESSAGE_RECEIVED", 1, "normal");
  await settle();
  const applied: string[] = [];
  const ownership: ReadOwnership[] = [];
  const host: SchedulerHost = {
    getStory: () => manager.getStory(), getEngineState: () => manager.getEngineState(),
    getExtractionSettings: () => ({ enabled: true, profileId: "scripted", cadence: 0, stabilityLag: 0 }),
    model: manager.model, getFacts: () => [], getFiredTransitions: () => [], getExpansionGateSources: () => [], getOpenArcs: () => [],
    beginRead: (window) => { const read = beginRun(manager.getOwnership(), window); ownership.push(read); return read; },
    applyExtractionAudit: async (audit, facts, memory, arcs, epistemic, ledger, read) => {
      await manager.applyExtractionAudit(audit, facts, memory, arcs, epistemic, ledger, read);
      if (read?.stillOwns()) applied.push(audit.id);
    },
    mutationSettled: () => manager.rollbackSettled(), epoch: () => manager.getRunContext().sessionEpoch,
    onSchedulerChange: () => {},
  };
  const scheduler = new ExtractionScheduler(host);
  const stop = manager.onRollback((messageId, window) => scheduler.schedule({ priority: 0, reason: `rollback:${messageId}`, window }));
  return { manager, bridge, scheduler, applied, ownership, close: () => { stop(); scheduler.dispose(); bridge.stop(); } };
}

beforeEach(() => { reads.length = 0; });

describe("A21: a swipe during an in-flight read owns a replacement read", () => {
  it("discards the old answer and writes only the swiped reply through the real coordinator", async () => {
    const h = await harness();
    try {
      h.scheduler.schedule({ priority: 1, reason: "cadence", window: { from: 0, to: 1, messages: [] } });
      await settle();
      expect(reads).toHaveLength(1);
      const row = spikeContext.chat[1];
      row.swipe_id = 1;
      row.mes = row.swipes![1];
      await spikeEvents.emit("MESSAGE_SWIPED", 1);
      await h.manager.rollbackSettled();
      expect(h.ownership[0].stillOwns()).toBe(false);
      finish(0, "The lamp is blue.");
      await settle();
      expect(h.applied).toEqual([]);
      expect(h.manager.getExtractionAudits().some((audit) => audit.id === "read-0")).toBe(false);
      expect(reads).toHaveLength(2);
      expect(reads[1].window.messages.some((message) => message.text.includes("green"))).toBe(true);
      expect(reads[1].window.messages.some((message) => message.text.includes("blue"))).toBe(false);
      finish(1, "The lamp is green.");
      await settle();
      expect(h.applied).toEqual(["read-1"]);
      expect(h.manager.getExtractionAudits().map((audit) => audit.id)).toContain("read-1");
      const facts = h.manager.getExtractionFacts().map((fact) => fact.text);
      expect(facts).toContain("The lamp is green.");
      expect(facts).not.toContain("The lamp is blue.");
      expect(reads).toHaveLength(2);
    } finally { h.close(); }
  });

  it("control: an unchanged reply accepts its original read without scheduling another", async () => {
    const h = await harness();
    try {
      h.scheduler.schedule({ priority: 1, reason: "cadence", window: { from: 0, to: 1, messages: [] } });
      await settle();
      finish(0, "The lamp is blue.");
      await settle();
      expect(h.applied).toEqual(["read-0"]);
      expect(h.manager.getExtractionFacts().map((fact) => fact.text)).toContain("The lamp is blue.");
      expect(reads).toHaveLength(1);
    } finally { h.close(); }
  });
});
