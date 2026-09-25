import { parseStoryV2OrThrow, type EngineState, type NormalizedStoryV2 } from "@engine/index";
import { callExtractionModel } from "@extraction/client";
import { clearStoryExtensionPrompt, disableWIEntry, enableWIEntry, loadLorebook, readWIEntry, readWIEntryAt, restoreWIEntryAt, setStoryExtensionPrompt, updateWIEntryByUid, upsertWIEntry } from "@services/STAPI";
import { StagecraftCoordinator, type StagecraftCoordinatorDeps } from "./stagecraftCoordinator";
import { createStagecraft, sanitizeStagecraft } from "../extras";
import { mintToken, tokenMatches, type RunContext, type RunToken } from "../runToken";
import type { ExtractionRuntimeSettings, RuntimeExtras, StagecraftRuntimeState } from "../types";

const mockChat: Array<Record<string, unknown>> = [];

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  setStoryExtensionPrompt: jest.fn(),
  clearStoryExtensionPrompt: jest.fn(),
  loadLorebook: jest.fn(),
  // The write edge reads the entry itself (R2); the fake book is the same source of truth.
  readWIEntry: jest.fn(),
  readWIEntryAt: jest.fn(),
  restoreWIEntryAt: jest.fn(),
  updateWIEntryByUid: jest.fn(),
  upsertWIEntry: jest.fn(async () => "updated"),
  enableWIEntry: jest.fn(async () => ({ ok: true, changed: true })),
  disableWIEntry: jest.fn(async () => ({ ok: true, changed: true })),
  getContext: () => ({ extensionSettings: {}, saveSettingsDebounced: () => undefined, chat: mockChat }),
}));

jest.mock("@extraction/client", () => ({ callExtractionModel: jest.fn(async () => "NONE") }));

const lorebook = (content = "The bridge stands, its ropes new and taut.") => ({
  entries: {
    1: { uid: 1, comment: "The bridge", content, key: ["bridge"], disable: false },
    2: { uid: 2, comment: "The ferryman", content: "Nobody has seen the ferryman.", key: ["ferryman"], disable: true },
  },
});

// The fake book is a real one-entry store: `upsertWIEntry` writes into it and the switch commands
// flip `disable`. Without that, a write edge that reads the entry (R2) would see a book that never
// changed and the compare-and-set would read every revert as an external edit.
type FakeBook = ReturnType<typeof lorebook>;
const book: { current: FakeBook } = { current: lorebook() };
const entryOf = (name: string) => Object.values(book.current.entries).find((entry) => entry.comment === name);

const story = (lorebooks: string[] = ["Story Lore"]): NormalizedStoryV2 => parseStoryV2OrThrow({
  format: 2,
  id: "coordinator-fixture",
  title: "Crossing",
  description: "Curator.",
  qualities: [{ key: "crossed", type: "bool", source: "extractor", rubric: "Crossed?" }],
  checkpoints: [{ id: "cp1", name: "The bank", objective: "Cross", type: "anchor", start: true }],
  transitions: [],
  roster: [],
  ...(lorebooks.length ? { stagecraft: { lorebooks } } : {}),
});

const gatedStory = (): NormalizedStoryV2 => parseStoryV2OrThrow({
  ...JSON.parse(JSON.stringify(story())),
  checkpoints: [{ id: "cp1", name: "The bank", objective: "Cross", type: "anchor", start: true, effects: { world_info: { enable: [{ lorebook: "Story Lore", comments: ["The ferryman"] }] } } }],
});

const engineState = (boundary = 10, lastMessageId = 20): EngineState => ({
  activeCheckpointId: "cp1",
  boundary,
  lastMessageId,
  blackboard: { values: {}, versions: {}, latched: {} },
  visitedAnchors: ["cp1"],
} as unknown as EngineState);

const harness = (options: { story?: NormalizedStoryV2 | null; state?: EngineState; settings?: Partial<StagecraftRuntimeState["settings"]>; filterEntries?: StagecraftCoordinatorDeps["filterEntries"]; warden?: StagecraftCoordinatorDeps["warden"]; owned?: boolean } = {}) => {
  let state: StagecraftRuntimeState = { ...createStagecraft(), settings: { curatorEnabled: true, acceptMode: "review", ...options.settings } };
  const journal: string[] = [];
  // The world this work belongs to, exactly as a live run's RunOwner reports it. A curator write
  // reaches a lorebook FILE shared by every chat that uses the book, so a batch that outlives its
  // chat must stop where it is — these tests are what holds that.
  let chatId = "chat-a";
  const context = (): RunContext => ({ chatId, storyId: "coordinator-fixture", playedVersion: 1, sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null });
  const ownership = options.owned === false ? undefined : { mint: () => mintToken(context()), check: (token: RunToken) => tokenMatches(context(), token) };
  const coordinator = new StagecraftCoordinator({
    getStory: () => (options.story === undefined ? story() : options.story),
    getState: () => options.state ?? engineState(),
    getStagecraft: () => state,
    setStagecraft: (next) => { state = next; },
    getExtractionSettings: () => ({ profileId: "p" } as ExtractionRuntimeSettings),
    getCanon: () => "The flood took the bridge.",
    getOpenArcs: () => ["Who cut the ropes?"],
    ...(options.filterEntries ? { filterEntries: options.filterEntries } : {}),
    ...(options.warden ? { warden: options.warden } : {}),
    journal: (summary) => journal.push(summary),
    persist: async () => undefined,
    notify: () => undefined,
    ...(ownership ? { ownership } : {}),
  } as StagecraftCoordinatorDeps);
  return { coordinator, journal, read: () => state, switchChat: () => { chatId = `chat-${Math.random().toString(36).slice(2, 8)}`; } };
};

const respond = (text: string) => (callExtractionModel as jest.Mock).mockResolvedValueOnce(text);

describe("StagecraftCoordinator", () => {
  beforeEach(() => {
    book.current = lorebook();
    (loadLorebook as jest.Mock).mockImplementation(async () => book.current);
    (readWIEntry as jest.Mock).mockImplementation(async (_book: string, comment: string) => {
      const data = await (loadLorebook as jest.Mock)();
      const entry = Object.values(data?.entries ?? {}).find((candidate) => (candidate as { comment?: string }).comment === comment) as { content?: string; key?: string[]; constant?: boolean; disable?: boolean; uid?: number } | undefined;
      return entry ? { content: String(entry.content ?? ""), keys: entry.key ?? [], constant: Boolean(entry.constant), disabled: Boolean(entry.disable), uid: entry.uid } : null;
    });
    (upsertWIEntry as jest.Mock).mockImplementation(async (_lorebook: string, comment: string, text: string) => { const entry = entryOf(comment); if (!entry) return "failed"; entry.content = text; entry.disable = false; return "updated"; });
    (enableWIEntry as jest.Mock).mockImplementation(async (_lorebook: string, comment: string) => { const entry = entryOf(comment); if (!entry) return { ok: false, reason: `"${comment}" is not in "${_lorebook}"` }; entry.disable = false; return { ok: true, changed: true }; });
    (disableWIEntry as jest.Mock).mockImplementation(async (_lorebook: string, comment: string) => { const entry = entryOf(comment); if (!entry) return { ok: false, reason: `"${comment}" is not in "${_lorebook}"` }; entry.disable = true; return { ok: true, changed: true }; });
    (upsertWIEntry as jest.Mock).mockClear();
    (enableWIEntry as jest.Mock).mockClear();
    const byUid = (uid: number) => (book.current.entries as Record<number, FakeBook["entries"][1]>)[uid];
    (readWIEntryAt as jest.Mock).mockImplementation(async ({ uid }: { uid: number }) => {
      const entry = byUid(uid);
      return entry ? { comment: entry.comment, content: entry.content, keys: entry.key, constant: false, disabled: entry.disable, uid } : null;
    });
    (restoreWIEntryAt as jest.Mock).mockImplementation(async ({ uid }: { uid: number }, image: { content: string; disabled: boolean }) => {
      const entry = byUid(uid);
      if (!entry) return { ok: false, reason: `entry ${uid} is gone` };
      entry.content = image.content;
      entry.disable = image.disabled;
      return { ok: true, confirmed: true };
    });
    (updateWIEntryByUid as jest.Mock).mockImplementation(async ({ uid }: { uid: number }, patch: { content?: string; disabled?: boolean }) => {
      const entry = byUid(uid);
      if (!entry) return { ok: false, reason: `entry ${uid} is no longer in "Story Lore"` };
      if (patch.content !== undefined) entry.content = patch.content;
      if (patch.disabled !== undefined) entry.disable = patch.disabled;
      return { ok: true, confirmed: true };
    });
    (updateWIEntryByUid as jest.Mock).mockClear();
    (disableWIEntry as jest.Mock).mockClear();
    (callExtractionModel as jest.Mock).mockClear();
  });

  // A pass that never ran and a pass that found nothing must be distinguishable — conflating them
  // made a live gate blame the model for a call that was never made.
  it("never runs without the capability flag or without an authored allowlist, and says which", async () => {
    const off = harness({ settings: { curatorEnabled: false } });
    expect(off.coordinator.curatorEnabled).toBe(false);
    expect(await off.coordinator.runCuratorPass()).toEqual({ ran: false, skipped: "disabled", record: null });

    const unscoped = harness({ story: story([]) });
    expect(unscoped.coordinator.curatorEnabled).toBe(false);
    expect(await unscoped.coordinator.runCuratorPass()).toEqual({ ran: false, skipped: "no-scope", record: null });
    expect(callExtractionModel).not.toHaveBeenCalled();
  });

  it("reports a pass that found nothing as having run, and keeps what the model said", async () => {
    const { coordinator, read } = harness();
    respond("NONE");
    expect(await coordinator.runCuratorPass("cadence")).toEqual({ ran: true, record: null });
    expect(read().lastPass).toMatchObject({ reason: "cadence", rawResponse: "NONE", proposed: 0 });
    expect(read().lastPass?.prompt).toContain("The bridge");
  });

  it("coalesces: one pass per boundary gap, and never while one is in flight", async () => {
    const { coordinator } = harness();
    expect(coordinator.dueForRun()).toBe(true);
    respond("NONE");
    await coordinator.runCuratorPass();
    expect(coordinator.dueForRun()).toBe(false);
  });

  it("records a proposal for review without writing anything", async () => {
    const { coordinator, read, journal } = harness();
    respond("[patch] The bridge || The bridge stands || new and taut || The bridge is gone.\n[why] The flood took it.");
    const { record } = await coordinator.runCuratorPass("scene-break");
    expect(record?.ops).toHaveLength(1);
    expect(record?.ops[0].status).toBe("pending");
    expect(record?.summary).toBe("The flood took it.");
    expect(upsertWIEntry).not.toHaveBeenCalled();
    expect(journal[0]).toContain("proposed 1 change(s)");
    expect(read().proposals).toHaveLength(1);
  });

  it("applies an accepted change at the boundary, and only then", async () => {
    const { coordinator, read, journal } = harness();
    respond("[patch] The bridge || its ropes new and taut || its ropes cut");
    const { record } = await coordinator.runCuratorPass();
    expect(await coordinator.applyAccepted()).toBe(0);
    await coordinator.setOpDecision(record!.id, 0, "accepted");
    expect(await coordinator.applyAccepted()).toBe(1);
    expect(updateWIEntryByUid).toHaveBeenCalledWith({ lorebookFileId: "Story Lore", uid: 1 }, { content: "The bridge stands, its ropes cut.", disabled: false });
    expect(upsertWIEntry).not.toHaveBeenCalled();
    expect(read().proposals[0].ops[0].status).toBe("applied");
    expect(journal.some((entry) => entry.includes("applied 1 change(s)"))).toBe(true);
  });

  it("auto mode accepts on the spot so the next boundary writes it", async () => {
    const { coordinator } = harness({ settings: { acceptMode: "auto" } });
    respond("[disable] The bridge");
    const { record } = await coordinator.runCuratorPass();
    expect(record?.ops[0].status).toBe("accepted");
    expect(await coordinator.applyAccepted()).toBe(1);
    expect(updateWIEntryByUid).toHaveBeenCalledWith({ lorebookFileId: "Story Lore", uid: 1 }, { content: "The bridge stands, its ropes new and taut.", disabled: true });
  });

  it("fails a switch whose entry or book is gone by the time the boundary writes it", async () => {
    const { coordinator, read } = harness({ settings: { acceptMode: "auto" } });
    respond("[disable] The bridge");
    await coordinator.runCuratorPass();
    (updateWIEntryByUid as jest.Mock).mockResolvedValueOnce({ ok: false, reason: 'entry 1 is no longer in "Story Lore"' });
    expect(await coordinator.applyAccepted()).toBe(0);
    expect(read().proposals[0].ops[0]).toMatchObject({ status: "failed", message: 'entry 1 is no longer in "Story Lore"' });
  });

  it("T17.2: an entry deleted before the boundary fails its op and is never re-created", async () => {
    const { coordinator, read } = harness({ settings: { acceptMode: "auto" } });
    respond("[rewrite] #1 || The bridge is gone.");
    await coordinator.runCuratorPass();
    delete (book.current.entries as Record<number, unknown>)[1];
    expect(await coordinator.applyAccepted()).toBe(0);
    expect(read().proposals[0].ops[0]).toMatchObject({ status: "failed", message: '"The bridge" is no longer in Story Lore' });
    expect(upsertWIEntry).not.toHaveBeenCalled();
    expect(updateWIEntryByUid).not.toHaveBeenCalled();
  });

  it("T17.2: an entry renamed into a checkpoint-gated title is refused at the write edge", async () => {
    const { coordinator, read } = harness({ story: gatedStory(), settings: { acceptMode: "auto" } });
    respond("[rewrite] The bridge || The bridge is gone.");
    await coordinator.runCuratorPass();
    book.current.entries[1].comment = "The ferryman";
    expect(await coordinator.applyAccepted()).toBe(0);
    expect(read().proposals[0].ops[0].message).toBe('"The bridge" is now "The ferryman", which the curator may not write');
    expect(updateWIEntryByUid).not.toHaveBeenCalled();
  });

  it("T17.2: a renamed entry is still written by its uid when the new title is writable", async () => {
    const { coordinator } = harness({ settings: { acceptMode: "auto" } });
    respond("[rewrite] The bridge || The bridge is gone.");
    await coordinator.runCuratorPass();
    book.current.entries[1].comment = "The old bridge";
    expect(await coordinator.applyAccepted()).toBe(1);
    expect(book.current.entries[1].content).toBe("The bridge is gone.");
  });

  it("applies the author's edited text, not the model's", async () => {
    const { coordinator } = harness();
    respond("[rewrite] The bridge || The bridge is gone.");
    const { record } = await coordinator.runCuratorPass();
    await coordinator.setOpDecision(record!.id, 0, "accepted", { kind: "rewrite", lorebook: "Story Lore", comment: "The bridge", text: "The bridge is rubble.", uid: 1 });
    await coordinator.applyAccepted();
    expect(updateWIEntryByUid).toHaveBeenCalledWith({ lorebookFileId: "Story Lore", uid: 1 }, { content: "The bridge is rubble.", disabled: false });
  });

  it("T17.3: an op the author declined at this checkpoint is not proposed again, and the prompt says so", async () => {
    const state = engineState(10, 20);
    const { coordinator, read } = harness({ state });
    respond("[rewrite] The bridge || The bridge is gone.");
    const first = await coordinator.runCuratorPass();
    await coordinator.setOpDecision(first.record!.id, 0, "rejected");
    Object.assign(state, { boundary: 14, lastMessageId: 28 });
    respond("[rewrite] #1 || The bridge is gone.");
    const second = await coordinator.runCuratorPass();
    expect(read().lastPass?.prompt).toContain("- [rewrite] The bridge");
    expect(second.record?.ops ?? []).toEqual([]);
    expect(read().lastPass?.dropped).toEqual(['rewrite: "The bridge" was declined earlier']);
  });

  it("T17.5: accepting a near-match patch writes the exact span it showed", async () => {
    const { coordinator } = harness();
    respond("[patch] The bridge || bridge stand its ropes || new and taut || bridge is ash.");
    const { record } = await coordinator.runCuratorPass();
    expect(record?.ops[0].fuzzy?.span).toBe("bridge stands, its ropes new and taut");
    await coordinator.setOpDecision(record!.id, 0, "accepted");
    expect(await coordinator.applyAccepted()).toBe(1);
    expect(book.current.entries[1].content).toBe("The bridge is ash.");
  });

  it("T17.5: auto mode never takes a near match", async () => {
    const { coordinator, read } = harness({ settings: { acceptMode: "auto" } });
    respond("[patch] The bridge || bridge stand its ropes || new and taut || bridge is ash.");
    expect((await coordinator.runCuratorPass()).record?.ops ?? []).toEqual([]);
    expect(read().lastPass?.dropped[0]).toContain("is not in this entry");
    expect(await coordinator.applyAccepted()).toBe(0);
  });

  it("a rejected change is never written", async () => {
    const { coordinator } = harness();
    respond("[rewrite] The bridge || The bridge is gone.");
    const { record } = await coordinator.runCuratorPass();
    await coordinator.decideProposal(record!.id, "rejected");
    expect(await coordinator.applyAccepted()).toBe(0);
    expect(upsertWIEntry).not.toHaveBeenCalled();
  });

  it("persists a before-image before the host write", async () => {
    const { coordinator, read } = harness({ settings: { acceptMode: "auto" } });
    respond("[rewrite] The bridge || The bridge is rubble.");
    await coordinator.runCuratorPass();
    (upsertWIEntry as jest.Mock).mockImplementationOnce(async () => {
      const op = read().proposals[0].ops[0];
      expect(op.writeAhead?.status).toBe("pending");
      expect(op.before?.content).toBe("The bridge stands, its ropes new and taut.");
      expect(op.after?.content).toBe("The bridge is rubble.");
      return "updated";
    });
    expect(await coordinator.applyAccepted()).toBe(1);
    expect(read().proposals[0].ops[0].writeAhead).toBeUndefined();
    expect(read().proposals[0].ops[0].status).toBe("applied");
  });

  it("keeps an entry the author had switched off, off after a rewrite", async () => {
    const { coordinator } = harness({ settings: { acceptMode: "auto" } });
    respond("[rewrite] The ferryman || The ferryman is back.");
    await coordinator.runCuratorPass();
    await coordinator.applyAccepted();
    expect(updateWIEntryByUid).toHaveBeenCalledWith({ lorebookFileId: "Story Lore", uid: 2 }, { content: "The ferryman is back.", disabled: true });
    expect(book.current.entries[2]).toMatchObject({ content: "The ferryman is back.", disable: true });
    expect(disableWIEntry).not.toHaveBeenCalled();
  });

  // V17: a refused write must never read as applied. The rewrite is now one uid-addressed update that
  // carries the author's own flag, so there is no second (re-disable) write that could be lost.
  it("fails a rewrite the host refused, and says so", async () => {
    const { coordinator, read } = harness({ settings: { acceptMode: "auto" } });
    respond("[rewrite] The ferryman || The ferryman is back.");
    await coordinator.runCuratorPass();
    (updateWIEntryByUid as jest.Mock).mockResolvedValueOnce({ ok: false, reason: "the host refused" });
    await coordinator.applyAccepted();
    expect(read().proposals[0].ops[0]).toMatchObject({ status: "failed", message: "the host refused" });
  });

  it("refuses a write outside the allowlist even if the record says otherwise", async () => {
    const { coordinator, read } = harness();
    respond("[rewrite] The bridge || The bridge is gone.");
    const { record } = await coordinator.runCuratorPass();
    await coordinator.setOpDecision(record!.id, 0, "accepted", { kind: "rewrite", lorebook: "The User's Own Book", comment: "The bridge", text: "hijacked" });
    expect(await coordinator.applyAccepted()).toBe(0);
    expect(upsertWIEntry).not.toHaveBeenCalled();
    expect(read().proposals[0].ops[0]).toMatchObject({ status: "failed" });
    expect(read().proposals[0].ops[0].message).toContain("not on this story's stagecraft allowlist");
  });

  it("never shows the curator an entry a checkpoint switches, so it cannot propose one", async () => {
    const { coordinator } = harness({ story: gatedStory() });
    expect((await coordinator.readScope()).map((view) => view.comment)).toEqual(["The bridge"]);
    respond("[enable] The ferryman\n[why] The ferry runs again.");
    const { record } = await coordinator.runCuratorPass();
    expect(record?.ops ?? []).toHaveLength(0);
  });

  it("refuses to write a checkpoint-switched entry even if an accepted record names it", async () => {
    const { coordinator, read } = harness({ story: gatedStory() });
    respond("[rewrite] The bridge || The bridge is gone.");
    const { record } = await coordinator.runCuratorPass();
    await coordinator.setOpDecision(record!.id, 0, "accepted", { kind: "enable", lorebook: "Story Lore", comment: "The ferryman" });
    expect(await coordinator.applyAccepted()).toBe(0);
    expect(enableWIEntry).not.toHaveBeenCalled();
    expect(read().proposals[0].ops[0].message).toContain("switched by checkpoint effects");
  });

  it("reverts an applied change when the story rolls back past it", async () => {
    const { coordinator, read, journal } = harness({ settings: { acceptMode: "auto" } });
    respond("[rewrite] The bridge || The bridge is gone.");
    await coordinator.runCuratorPass();
    await coordinator.applyAccepted();
    (upsertWIEntry as jest.Mock).mockClear();
    expect(await coordinator.revertAppliedSince(15)).toBe(1);
    expect(upsertWIEntry).not.toHaveBeenCalled();
    expect(restoreWIEntryAt).toHaveBeenCalledWith({ lorebookFileId: "Story Lore", uid: 1 }, expect.objectContaining({ content: "The bridge stands, its ropes new and taut.", disabled: false }));
    expect(entryOf("The bridge")?.content).toBe("The bridge stands, its ropes new and taut.");
    expect(read().proposals).toEqual([]);
    expect(journal.some((entry) => entry.includes("rolled back"))).toBe(true);
  });

  it("builds the prompt from the entries the pre-filter kept, cannot propose a hidden one, and says it focused", async () => {
    const seen: string[][] = [];
    const env = harness({ filterEntries: async (entries, context) => { seen.push([context.checkpoint.name, context.canon, ...context.openThreads]); return entries.filter((entry) => entry.comment === "The ferryman"); } });
    respond("[disable] The bridge");
    const outcome = await env.coordinator.runCuratorPass("test");
    expect(seen).toEqual([["The bank", "The flood took the bridge.", "Who cut the ropes?"]]);
    expect(env.read().lastPass?.prompt).toContain("The ferryman");
    expect(env.read().lastPass?.prompt).not.toContain("its ropes new and taut");
    expect(outcome.record?.ops ?? []).toHaveLength(0);
    expect(env.read().lastPass).toMatchObject({ proposed: 0, dropped: [expect.stringContaining("The bridge")], focus: { shown: 1, total: 2 } });
  });

  it("shows every entry when the pre-filter fails", async () => {
    const env = harness({ filterEntries: async () => { throw new Error("down"); } });
    respond("NONE");
    await env.coordinator.runCuratorPass("test");
    expect(env.read().lastPass?.prompt).toContain("its ropes new and taut");
    expect(env.read().lastPass?.focus).toBeUndefined();
  });

  it("records a model failure without breaking play", async () => {
    const { coordinator, read } = harness();
    (callExtractionModel as jest.Mock).mockRejectedValueOnce(new Error("profile is gone"));
    expect(await coordinator.runCuratorPass()).toEqual({ ran: true, record: null });
    expect(read().lastError).toBe("profile is gone");
  });
describe("ownership: a curator batch belongs to one chat", () => {
    it("applies a normal same-session write", async () => {
      const { coordinator, read } = harness({ settings: { acceptMode: "auto" } });
      respond("[rewrite] The bridge || The ropes are new.");
      await coordinator.runCuratorPass();
      expect(await coordinator.applyAccepted()).toBe(1);
      expect(read().proposals[0].ops[0].status).toBe("applied");
    });

    it("reaches the allowlisted book it was scoped to", async () => {
      const { coordinator } = harness({ settings: { acceptMode: "auto" } });
      respond("[disable] The bridge");
      await coordinator.runCuratorPass();
      await coordinator.applyAccepted();
      expect(updateWIEntryByUid).toHaveBeenCalledWith({ lorebookFileId: "Story Lore", uid: 1 }, expect.objectContaining({ disabled: true }));
    });

    it("stops the ops behind it when the world changes mid-batch", async () => {
      const { coordinator, read, switchChat } = harness({ settings: { acceptMode: "auto" } });
      respond("[rewrite] The bridge || First\n[enable] The ferryman");
      await coordinator.runCuratorPass();
      // The chat moves AFTER the first write lands: the second op belongs to a world that is gone.
      (updateWIEntryByUid as jest.Mock).mockImplementation(async ({ uid }: { uid: number }, patch: { content?: string }) => {
        const entry = (book.current.entries as Record<number, FakeBook["entries"][1]>)[uid];
        if (!entry) return { ok: false, reason: "gone" };
        if (patch.content !== undefined) entry.content = patch.content;
        switchChat();
        return { ok: true, confirmed: true };
      });
      const applied = await coordinator.applyAccepted();
      expect(applied).toBe(1);
      expect(updateWIEntryByUid).toHaveBeenCalledTimes(1);
      expect(read().proposals[0].ops.some((entry) => entry.status === "pending" || entry.status === "accepted")).toBe(true);
    });

    it("restores every applied write in its own world", async () => {
      const { coordinator, switchChat } = harness({ settings: { acceptMode: "auto" } });
      respond("[rewrite] The bridge || The ropes are new.");
      await coordinator.runCuratorPass();
      await coordinator.applyAccepted();
      expect(entryOf("The bridge")?.content).toBe("The ropes are new.");
      expect(await coordinator.revertAppliedSince(0)).toBe(1);
      expect(entryOf("The bridge")?.content).toBe("The bridge stands, its ropes new and taut.");
      expect(switchChat).toBeDefined();
    });

    it("stops restoring pre-write content once its world is gone mid-revert", async () => {
      const { coordinator, switchChat } = harness({ settings: { acceptMode: "auto" } });
      respond("[rewrite] The bridge || The ropes are new.\n[rewrite] The ferryman || The ferryman is back.");
      await coordinator.runCuratorPass();
      expect(await coordinator.applyAccepted()).toBe(2);
      // The chat moves after the FIRST inverse lands: the record behind it belongs to a world that
      // is gone, so its before-image must not be written back into the new one.
      let restores = 0;
      (restoreWIEntryAt as jest.Mock).mockImplementation(async ({ uid }: { uid: number }, image: { content: string }) => {
        (book.current.entries as Record<number, { content: string }>)[uid].content = image.content;
        restores += 1;
        if (restores === 1) switchChat();
        return { ok: true, confirmed: true };
      });
      expect(await coordinator.revertAppliedSince(0)).toBe(1);
      expect(restores).toBe(1);
    });
  });
});

describe("continuity warden (v2.2 plan 05)", () => {
  const KEY = "story_orchestrator_continuity";
  const note = { facts: ["The bridge fell in the flood."], text: "Continuity: established — The bridge fell in the flood. Keep the next reply consistent with it." };
  const warden = (options: { note?: typeof note | null; nudge?: boolean; onCheck?: () => void } = {}) => {
    const check = jest.fn(async () => { options.onCheck?.(); return options.note === undefined ? note : options.note; });
    return { check, facts: () => ["The bridge fell in the flood."], nudgeActive: () => options.nudge === true };
  };
  const wardenOn = (mode: "auto" | "review" | "off" = "auto") => ({ curatorEnabled: false, acceptMode: "review" as const, wardenEnabled: true, wardenAcceptMode: mode });

  beforeEach(() => {
    mockChat.splice(0, mockChat.length, { name: "Max", mes: "We look for a way across.", is_user: true }, { name: "Mira", mes: "I walked over the bridge this morning.", is_user: false });
    (setStoryExtensionPrompt as jest.Mock).mockClear();
    (clearStoryExtensionPrompt as jest.Mock).mockClear();
    (upsertWIEntry as jest.Mock).mockImplementation(async (_lorebook: string, comment: string, text: string) => { const entry = entryOf(comment); if (!entry) return "failed"; entry.content = text; entry.disable = false; return "updated"; });
    (enableWIEntry as jest.Mock).mockImplementation(async (_lorebook: string, comment: string) => { const entry = entryOf(comment); if (!entry) return { ok: false, reason: `"${comment}" is not in "${_lorebook}"` }; entry.disable = false; return { ok: true, changed: true }; });
    (disableWIEntry as jest.Mock).mockImplementation(async (_lorebook: string, comment: string) => { const entry = entryOf(comment); if (!entry) return { ok: false, reason: `"${comment}" is not in "${_lorebook}"` }; entry.disable = true; return { ok: true, changed: true }; });
    (upsertWIEntry as jest.Mock).mockClear();
    (enableWIEntry as jest.Mock).mockClear();
    (disableWIEntry as jest.Mock).mockClear();
  });

  it("auto: a contradicting reply queues one note; the next loud generation carries it once and its end clears it", async () => {
    const env = harness({ settings: wardenOn("auto"), warden: warden() });
    expect(await env.coordinator.runWardenPass(1)).toBe(true);
    const record = env.read().proposals.at(-1);
    expect(record).toMatchObject({ curator: "warden", messageId: 1, ops: [{ status: "accepted", op: { kind: "note", replyMessageId: 1, facts: note.facts } }] });
    env.coordinator.onGenerationStarted("normal", false);
    expect(setStoryExtensionPrompt).toHaveBeenCalledWith(KEY, note.text, 0);
    expect(env.read().proposals.at(-1)?.ops[0].status).toBe("accepted");
    env.coordinator.commitNote(true);
    expect(clearStoryExtensionPrompt).toHaveBeenCalledWith(KEY);
    expect(env.read().proposals.at(-1)?.ops[0].status).toBe("applied");
    env.coordinator.onGenerationStarted("normal", false);
    expect(setStoryExtensionPrompt).toHaveBeenCalledTimes(1);
  });

  it("v2.4 X6: a reply-less close keeps the note accepted for the next loud generation; only a render spends it", async () => {
    const env = harness({ settings: wardenOn("auto"), warden: warden() });
    await env.coordinator.runWardenPass(1);
    env.coordinator.onGenerationStarted("normal", false);
    env.coordinator.commitNote(false);
    expect(clearStoryExtensionPrompt).toHaveBeenCalledWith(KEY);
    expect(env.read().proposals.at(-1)?.ops[0].status).toBe("accepted");
    env.coordinator.onGenerationStarted("normal", false);
    expect(setStoryExtensionPrompt).toHaveBeenCalledTimes(2);
    env.coordinator.commitNote(true);
    expect(env.read().proposals.at(-1)?.ops[0]).toMatchObject({ status: "applied" });
    expect(env.read().proposals.at(-1)?.appliedAt).toEqual(expect.any(String));
  });

  it("v2.4 X6: a render never spends a note that was withdrawn or never carried", async () => {
    const env = harness({ settings: wardenOn("auto"), warden: warden() });
    await env.coordinator.runWardenPass(1);
    env.coordinator.commitNote(true);
    expect(env.read().proposals.at(-1)?.ops[0].status).toBe("accepted");
    env.coordinator.onGenerationStarted("normal", false);
    await env.coordinator.revertAppliedSince(1);
    env.coordinator.commitNote(true);
    expect(env.read().proposals.at(-1)?.ops[0]).toMatchObject({ status: "rejected", message: "reverted" });
    const cleared = harness({ settings: wardenOn("auto"), warden: warden() });
    await cleared.coordinator.runWardenPass(1);
    cleared.coordinator.onGenerationStarted("normal", false);
    cleared.coordinator.clearContinuityNote();
    cleared.coordinator.commitNote(true);
    expect(cleared.read().proposals.at(-1)?.ops[0].status).toBe("accepted");
  });

  it("never injects on a dry run, a quiet or impersonate pass, or while the author's nudge is set", async () => {
    for (const [type, dryRun, nudge] of [["normal", true, false], ["quiet", false, false], ["impersonate", false, false], ["normal", false, true]] as const) {
      const env = harness({ settings: wardenOn("auto"), warden: warden({ nudge }) });
      await env.coordinator.runWardenPass(1);
      env.coordinator.onGenerationStarted(type, dryRun);
      expect(env.read().proposals.at(-1)?.ops[0].status).toBe("accepted");
    }
    expect(setStoryExtensionPrompt).not.toHaveBeenCalled();
  });

  it("review: the note waits for the author, and a newer reply lapses it before it reaches any prompt", async () => {
    const env = harness({ settings: wardenOn("review"), warden: warden() });
    await env.coordinator.runWardenPass(1);
    expect(env.read().proposals.at(-1)?.ops[0].status).toBe("pending");
    mockChat.push({ name: "Max", mes: "Then we cross.", is_user: true }, { name: "Mira", mes: "Follow me.", is_user: false });
    const quiet = harness({ settings: wardenOn("review"), warden: warden({ note: null }) });
    expect(await quiet.coordinator.runWardenPass(3)).toBe(false);
    await env.coordinator.runWardenPass(3);
    const first = env.read().proposals.find((record) => record.messageId === 1);
    expect(first?.ops[0]).toMatchObject({ status: "rejected", message: "lapsed" });
    env.coordinator.onGenerationStarted("normal", false);
    expect(setStoryExtensionPrompt).toHaveBeenCalledTimes(0);
  });

  it("reads nothing for the player's message, a switched-off warden or mode off", async () => {
    for (const [settings, id] of [[wardenOn("auto"), 0], [{ ...wardenOn("auto"), wardenEnabled: false }, 1], [wardenOn("off"), 1]] as const) {
      const check = warden();
      const env = harness({ settings, warden: check });
      expect(await env.coordinator.runWardenPass(id)).toBe(false);
      expect(check.check).not.toHaveBeenCalled();
    }
  });

  it("stops injecting an accepted note once the author switches checking off", async () => {
    const env = harness({ settings: wardenOn("auto"), warden: warden() });
    await env.coordinator.runWardenPass(1);
    env.read().settings.wardenAcceptMode = "off";
    env.coordinator.onGenerationStarted("normal", false);
    expect(setStoryExtensionPrompt).not.toHaveBeenCalled();
  });

  it("lapses an older note even when a pass is already in flight", async () => {
    let release: (value: typeof note | null) => void = () => undefined;
    const slow = { check: jest.fn(() => new Promise<typeof note | null>((resolve) => { release = resolve; })), facts: () => ["The bridge fell in the flood."], nudgeActive: () => false };
    const env = harness({ settings: wardenOn("auto"), warden: slow });
    env.read().proposals.push({ id: "warden-0-1", curator: "warden", at: "", boundary: 0, messageId: 1, checkpointId: "cp1", reason: "continuity", summary: "", mode: "auto", ops: [{ op: { kind: "note", text: note.text, facts: note.facts, replyMessageId: 1 }, status: "accepted" }], dropped: [] });
    mockChat.push({ name: "Max", mes: "Then we cross.", is_user: true }, { name: "Mira", mes: "Follow me.", is_user: false });
    const inFlight = env.coordinator.runWardenPass(3);
    expect(await env.coordinator.runWardenPass(3)).toBe(false);
    expect(env.read().proposals.find((record) => record.id === "warden-0-1")?.ops[0]).toMatchObject({ status: "rejected", message: "lapsed" });
    env.coordinator.onGenerationStarted("normal", false);
    expect(setStoryExtensionPrompt).not.toHaveBeenCalled();
    release(null);
    await inFlight;
  });

  it("V3: a warden pass held open in another chat does not block this chat's pass", async () => {
    const releases: Array<(value: typeof note | null) => void> = [];
    const slow = { check: jest.fn(() => new Promise<typeof note | null>((resolve) => { releases.push(resolve); })), facts: () => ["The bridge fell in the flood."], nudgeActive: () => false };
    const env = harness({ settings: wardenOn("auto"), warden: slow });
    mockChat.push({ name: "Max", mes: "Then we cross.", is_user: true }, { name: "Mira", mes: "Follow me.", is_user: false });
    const old = env.coordinator.runWardenPass(1);
    await Promise.resolve();
    env.switchChat();
    const here = env.coordinator.runWardenPass(1);
    await Promise.resolve();
    expect(slow.check).toHaveBeenCalledTimes(2);
    releases.forEach((release) => release(null));
    await Promise.all([old, here]);
  });

  it("V3: an old warden pass finishing does not release the new pass's hold", async () => {
    const releases: Array<(value: typeof note | null) => void> = [];
    const slow = { check: jest.fn(() => new Promise<typeof note | null>((resolve) => { releases.push(resolve); })), facts: () => ["The bridge fell in the flood."], nudgeActive: () => false };
    const env = harness({ settings: wardenOn("auto"), warden: slow });
    mockChat.push({ name: "Max", mes: "Then we cross.", is_user: true }, { name: "Mira", mes: "Follow me.", is_user: false });
    const old = env.coordinator.runWardenPass(1);
    await Promise.resolve();
    env.switchChat();
    const current = env.coordinator.runWardenPass(1);
    await Promise.resolve();
    releases[0](null);
    await old;
    expect(await env.coordinator.runWardenPass(1)).toBe(false);
    expect(slow.check).toHaveBeenCalledTimes(2);
    releases[1](null);
    await current;
  });

  it("drops the note when the reply changed while the judge was reading", async () => {
    const env = harness({ settings: wardenOn("auto"), warden: warden({ onCheck: () => { mockChat[1] = { name: "Mira", mes: "The bridge is gone.", is_user: false }; } }) });
    expect(await env.coordinator.runWardenPass(1)).toBe(false);
    expect(env.read().proposals).toHaveLength(0);
  });

  it("the boundary write never touches a note, and a rollback past its reply withdraws it", async () => {
    const env = harness({ settings: wardenOn("auto"), warden: warden() });
    await env.coordinator.runWardenPass(1);
    expect(await env.coordinator.applyAccepted()).toBe(0);
    expect(upsertWIEntry).not.toHaveBeenCalled();
    expect(env.read().proposals.at(-1)?.ops[0].status).toBe("accepted");
    await env.coordinator.revertAppliedSince(1);
    expect(env.read().proposals.at(-1)?.ops[0]).toMatchObject({ status: "rejected", message: "reverted" });
    env.coordinator.onGenerationStarted("normal", false);
    expect(setStoryExtensionPrompt).not.toHaveBeenCalled();
  });
});


describe("stagecraft hydrate (v2.2 plan 05)", () => {
  it("tags records saved before the warden as the World Info curator's, and fills the warden settings", () => {
    const hydrated = sanitizeStagecraft({ stagecraft: { settings: { curatorEnabled: true, acceptMode: "auto" }, proposals: [{ id: "wi-1", ops: [], dropped: [] }], lastPass: null, lastRunBoundary: 3, lastError: null } } as unknown as RuntimeExtras);
    expect(hydrated.proposals[0].curator).toBe("wi");
    expect(hydrated.settings).toEqual({ curatorEnabled: true, acceptMode: "auto", wardenEnabled: false, wardenAcceptMode: "review" });
  });


});

// v2.3 plan 03's ownership rules, re-written here after the suite was lost (see plan 04's Gate
  // record, "A test file was destroyed and partially recovered"). The behaviour is unchanged and
  // unmodified; what these hold is that a curator batch cannot outlive the chat it belongs to.
