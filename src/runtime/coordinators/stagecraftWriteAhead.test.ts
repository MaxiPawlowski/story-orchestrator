import { textModel } from "../../../test/support/modelCall";
import { parseStoryV2OrThrow, type EngineState, type NormalizedStoryV2 } from "@engine/index";
import type { CuratorOpRecord, CuratorProposalRecord } from "@stagecraft/index";
import { StagecraftCoordinator, type StagecraftCoordinatorDeps } from "./stagecraftCoordinator";
import { createStagecraft } from "../extras";
import { mintToken, tokenMatches, type RunContext, type RunToken } from "../runToken";
import type { ExtractionRuntimeSettings, StagecraftRuntimeState } from "../types";

jest.mock("@services/STAPI", () => ({ settingsAreLoaded: () => true, settingsReady: async () => {} }));

const host = {
  setStoryExtensionPrompt: jest.fn(),
  clearStoryExtensionPrompt: jest.fn(),
  loadLorebook: jest.fn(),
  readWIEntry: jest.fn(),
  readWIEntryAt: jest.fn(),
  restoreWIEntryAt: jest.fn(),
  updateWIEntryByUid: jest.fn(),
  upsertWIEntry: jest.fn(),
  getContext: () => ({ extensionSettings: {}, chat: [] }),
};
const { readWIEntryAt, restoreWIEntryAt, updateWIEntryByUid } = host;


const callExtractionModel = jest.fn(async (..._args: unknown[]): Promise<string> => "NONE");

const ORIGINAL = "The bridge stands, its ropes new and taut.";
const REWRITTEN = "The bridge is gone.";
const PATCHED = "The bridge stands, its ropes cut.";

const entries: Record<number, { comment: string; content: string; disable: boolean }> = {};

const story = (): NormalizedStoryV2 => parseStoryV2OrThrow({
  format: 2,
  id: "write-ahead-fixture",
  title: "Crossing",
  description: "Curator write-ahead.",
  qualities: [{ key: "crossed", type: "bool", source: "extractor", rubric: "Crossed?" }],
  checkpoints: [{ id: "cp1", name: "The bank", objective: "Cross", type: "anchor", start: true }],
  transitions: [],
  roster: [],
  stagecraft: { lorebooks: ["Story Lore"] },
});

const pendingOp = (kind: "rewrite" | "patch", after: string): CuratorOpRecord => ({
  op: kind === "rewrite"
    ? { kind: "rewrite", lorebook: "Story Lore", comment: "The bridge", text: REWRITTEN, uid: 1 }
    : { kind: "patch", lorebook: "Story Lore", comment: "The bridge", anchor: "new || taut", replace: "cut", uid: 1 },
  status: "accepted",
  before: { content: ORIGINAL, disabled: false, uid: 1 },
  after: { content: after, disabled: false },
  target: { lorebookFileId: "Story Lore", uid: 1 },
  writeAhead: { status: "pending", at: "2026-09-25T10:00:00.000Z", messageId: 22 },
} as CuratorOpRecord);

const crashedRecord = (op: CuratorOpRecord): CuratorProposalRecord => ({
  id: "wi-10-20", curator: "wi", at: "2026-09-25T09:59:00.000Z", boundary: 10, messageId: 20, checkpointId: "cp1",
  reason: "curator", summary: "The bridge fell.", mode: "auto", ops: [op], dropped: [],
} as CuratorProposalRecord);

const harness = (record: CuratorProposalRecord) => {
  let state: StagecraftRuntimeState = { ...createStagecraft(), settings: { ...createStagecraft().settings, curatorEnabled: true, acceptMode: "auto" }, proposals: [record] };
  const journal: string[] = [];
  let chatId = "chat-a";
  const context = (): RunContext => ({ chatId, storyId: "write-ahead-fixture", playedVersion: 1, sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null });
  const coordinator = new StagecraftCoordinator({ hosts: { prompt: host, chat: { chatRows: () => host.getContext().chat }, player: { getPlayerName: () => "Max" }, curator: host } as never,
    getStory: () => story(),
    getState: () => ({ activeCheckpointId: "cp1", boundary: 12, lastMessageId: 24, blackboard: { values: {}, versions: {}, latched: {} } } as unknown as EngineState),
    getStagecraft: () => state,
    setStagecraft: (next) => { state = next; },
    model: textModel(callExtractionModel),
    getCanon: () => "",
    getOpenArcs: () => [],
    journal: (summary) => journal.push(summary),
    persist: async () => undefined,
    notify: () => undefined,
    ownership: { mint: () => mintToken(context()), check: (token: RunToken) => tokenMatches(context(), token) },
  } as StagecraftCoordinatorDeps);
  return { coordinator, journal, read: () => state, op: () => state.proposals[0].ops[0], switchChat: () => { chatId = "chat-b"; } };
};

describe("C10: a curator write-ahead marker is reconciled on hydrate", () => {
  beforeEach(() => {
    entries[1] = { comment: "The bridge", content: ORIGINAL, disable: false };
    (readWIEntryAt as jest.Mock).mockReset().mockImplementation(async ({ uid }: { uid: number }) => {
      const entry = entries[uid];
      return entry ? { comment: entry.comment, content: entry.content, keys: ["bridge"], constant: false, disabled: entry.disable, uid } : null;
    });
    (updateWIEntryByUid as jest.Mock).mockReset().mockImplementation(async ({ uid }: { uid: number }, patch: { content?: string; disabled?: boolean }) => {
      const entry = entries[uid];
      if (!entry) return { ok: false, reason: "gone" };
      if (patch.content !== undefined) entry.content = patch.content;
      if (patch.disabled !== undefined) entry.disable = patch.disabled;
      return { ok: true, confirmed: true };
    });
    (restoreWIEntryAt as jest.Mock).mockReset().mockImplementation(async ({ uid }: { uid: number }, image: { content: string; disabled: boolean }) => {
      entries[uid].content = image.content;
      entries[uid].disable = image.disabled;
      return { ok: true, confirmed: true };
    });
  });

  it("a rewrite that landed before the crash is recorded applied and is not re-applied at the next boundary", async () => {
    entries[1].content = REWRITTEN;
    const env = harness(crashedRecord(pendingOp("rewrite", REWRITTEN)));
    expect(await env.coordinator.reconcileWriteAhead()).toEqual({ applied: 1, retry: 0, left: 0 });
    expect(env.op()).toMatchObject({ status: "applied" });
    expect(env.op().writeAhead).toBeUndefined();
    expect(await env.coordinator.applyAccepted()).toBe(0);
    expect(updateWIEntryByUid).not.toHaveBeenCalled();
  });

  it("a patch that landed before the crash is not retried, so it cannot fail on its own output", async () => {
    entries[1].content = PATCHED;
    const env = harness(crashedRecord(pendingOp("patch", PATCHED)));
    await env.coordinator.reconcileWriteAhead();
    expect(env.op().status).toBe("applied");
    expect(await env.coordinator.applyAccepted()).toBe(0);
    expect(env.op().status).toBe("applied");
    expect(entries[1].content).toBe(PATCHED);
  });

  it("control: without the reconcile the same crashed patch is retried and fails on its own output", async () => {
    entries[1].content = PATCHED;
    const env = harness(crashedRecord(pendingOp("patch", PATCHED)));
    await env.coordinator.applyAccepted();
    expect(env.op().status).toBe("failed");
  });

  it("a reconciled write carries the boundary it was written at, so a rollback past it reverts it", async () => {
    entries[1].content = REWRITTEN;
    const env = harness(crashedRecord(pendingOp("rewrite", REWRITTEN)));
    await env.coordinator.reconcileWriteAhead();
    expect(env.read().proposals[0]).toMatchObject({ messageId: 22 });
    expect(env.read().proposals[0].appliedAt).toBeTruthy();
    expect(await env.coordinator.revertAppliedSince(21)).toBe(1);
    expect(entries[1].content).toBe(ORIGINAL);
  });

  it("a write that never reached the file goes back to accepted and is written once, from a fresh read", async () => {
    const env = harness(crashedRecord(pendingOp("rewrite", REWRITTEN)));
    expect(await env.coordinator.reconcileWriteAhead()).toEqual({ applied: 0, retry: 1, left: 0 });
    expect(env.op()).toMatchObject({ status: "accepted" });
    expect(env.op().writeAhead).toBeUndefined();
    expect(await env.coordinator.applyAccepted()).toBe(1);
    expect(updateWIEntryByUid).toHaveBeenCalledTimes(1);
    expect(entries[1].content).toBe(REWRITTEN);
  });

  it("an entry that holds neither image was edited by someone else and is left alone", async () => {
    entries[1].content = "Someone else wrote this.";
    const env = harness(crashedRecord(pendingOp("rewrite", REWRITTEN)));
    expect(await env.coordinator.reconcileWriteAhead()).toEqual({ applied: 0, retry: 0, left: 1 });
    expect(env.op().status).toBe("externally-edited");
    expect(await env.coordinator.applyAccepted()).toBe(0);
    expect(entries[1].content).toBe("Someone else wrote this.");
  });

  it("an entry that is gone fails the op instead of creating one", async () => {
    delete entries[1];
    const env = harness(crashedRecord(pendingOp("rewrite", REWRITTEN)));
    await env.coordinator.reconcileWriteAhead();
    expect(env.op().status).toBe("failed");
    expect(await env.coordinator.applyAccepted()).toBe(0);
    expect(updateWIEntryByUid).not.toHaveBeenCalled();
  });

  it("a switch during the read settles nothing into the chat that replaced it", async () => {
    entries[1].content = REWRITTEN;
    const env = harness(crashedRecord(pendingOp("rewrite", REWRITTEN)));
    (readWIEntryAt as jest.Mock).mockImplementationOnce(async () => { env.switchChat(); return { comment: "The bridge", content: REWRITTEN, keys: [], constant: false, disabled: false, uid: 1 }; });
    const before = JSON.stringify(env.read());
    expect(await env.coordinator.reconcileWriteAhead()).toEqual({ applied: 0, retry: 0, left: 0 });
    expect(JSON.stringify(env.read())).toBe(before);
    expect(env.journal).toEqual([]);
  });

  it("the apply path stamps the boundary into the write-ahead marker", async () => {
    const record = crashedRecord({ ...pendingOp("rewrite", REWRITTEN), writeAhead: undefined, before: undefined, after: undefined, target: undefined });
    const env = harness(record);
    (updateWIEntryByUid as jest.Mock).mockImplementationOnce(async () => {
      expect(env.op().writeAhead).toMatchObject({ status: "pending", messageId: 24 });
      return { ok: true, confirmed: true };
    });
    expect(await env.coordinator.applyAccepted()).toBe(1);
  });

  it("a chat with no pending marker reads nothing", async () => {
    const env = harness(crashedRecord({ ...pendingOp("rewrite", REWRITTEN), writeAhead: undefined, status: "applied" }));
    expect(await env.coordinator.reconcileWriteAhead()).toEqual({ applied: 0, retry: 0, left: 0 });
    expect(readWIEntryAt).not.toHaveBeenCalled();
  });
});
