import { parseStoryV2OrThrow, type EngineState, type NormalizedStoryV2 } from "@engine/index";
import { callExtractionModel } from "@extraction/client";
import { clearStoryExtensionPrompt, disableWIEntry, enableWIEntry, loadLorebook, readWIEntry, setStoryExtensionPrompt, upsertWIEntry } from "@services/STAPI";
import { StagecraftCoordinator, type StagecraftCoordinatorDeps } from "./stagecraftCoordinator";
import { createStagecraft, sanitizeStagecraft } from "../extras";
import { mintToken, tokenMatches, type RunContext, type RunToken } from "../runToken";
import type { ExtractionRuntimeSettings, RuntimeExtras, StagecraftRuntimeState } from "../types";

const mockChat: Array<Record<string, unknown>> = [];

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readBackBoundary: () => null,
  setStoryExtensionPrompt: jest.fn(),
  clearStoryExtensionPrompt: jest.fn(),
  loadLorebook: jest.fn(),
  // The write edge reads the entry itself (R2); the fake book is the same source of truth.
  readWIEntry: jest.fn(),
  upsertWIEntry: jest.fn(async () => "updated"),
  enableWIEntry: jest.fn(async () => true),
  disableWIEntry: jest.fn(async () => true),
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
    (enableWIEntry as jest.Mock).mockImplementation(async (_lorebook: string, comment: string) => { const entry = entryOf(comment); if (!entry) return false; entry.disable = false; return true; });
    (disableWIEntry as jest.Mock).mockImplementation(async (_lorebook: string, comment: string) => { const entry = entryOf(comment); if (!entry) return false; entry.disable = true; return true; });
    (upsertWIEntry as jest.Mock).mockClear();
    (enableWIEntry as jest.Mock).mockClear();
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
    expect(upsertWIEntry).toHaveBeenCalledWith("Story Lore", "The bridge", "The bridge stands, its ropes cut.", ["bridge"]);
    expect(read().proposals[0].ops[0].status).toBe("applied");
    expect(journal.some((entry) => entry.includes("applied 1 change(s)"))).toBe(true);
  });

  it("auto mode accepts on the spot so the next boundary writes it", async () => {
    const { coordinator } = harness({ settings: { acceptMode: "auto" } });
    respond("[disable] The bridge");
    const { record } = await coordinator.runCuratorPass();
    expect(record?.ops[0].status).toBe("accepted");
    expect(await coordinator.applyAccepted()).toBe(1);
    expect(disableWIEntry).toHaveBeenCalledWith("Story Lore", "The bridge");
  });

  it("fails a switch whose entry or book is gone by the time the boundary writes it", async () => {
    const { coordinator, read } = harness({ settings: { acceptMode: "auto" } });
    respond("[disable] The bridge");
    await coordinator.runCuratorPass();
    (disableWIEntry as jest.Mock).mockResolvedValueOnce(false);
    expect(await coordinator.applyAccepted()).toBe(0);
    expect(read().proposals[0].ops[0]).toMatchObject({ status: "failed", message: "\"The bridge\" is not in \"Story Lore\"" });
  });

  it("applies the author's edited text, not the model's", async () => {
    const { coordinator } = harness();
    respond("[rewrite] The bridge || The bridge is gone.");
    const { record } = await coordinator.runCuratorPass();
    await coordinator.setOpDecision(record!.id, 0, "accepted", { kind: "rewrite", lorebook: "Story Lore", comment: "The bridge", text: "The bridge is rubble." });
    await coordinator.applyAccepted();
    expect(upsertWIEntry).toHaveBeenCalledWith("Story Lore", "The bridge", "The bridge is rubble.", ["bridge"]);
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
    expect(upsertWIEntry).toHaveBeenCalledWith("Story Lore", "The ferryman", "The ferryman is back.", ["ferryman"]);
    // The re-disable targets the entry this op wrote. The recovered revision asserted the other
    // entry name here, which its own fixture cannot satisfy (see plan 04's Gate record).
    expect(disableWIEntry).toHaveBeenCalledWith("Story Lore", "The ferryman");
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
    expect(upsertWIEntry).toHaveBeenCalledWith("Story Lore", "The bridge", "The bridge stands, its ropes new and taut.");
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
      expect(disableWIEntry).toHaveBeenCalledWith("Story Lore", "The bridge");
    });

    it("stops the ops behind it when the world changes mid-batch", async () => {
      const { coordinator, read, switchChat } = harness({ settings: { acceptMode: "auto" } });
      respond("[rewrite] The bridge || First\n[disable] The ferryman");
      await coordinator.runCuratorPass();
      // The chat moves AFTER the first write lands: the second op belongs to a world that is gone.
      let writes = 0;
      (upsertWIEntry as jest.Mock).mockImplementation(async (_lorebook: string, comment: string, text: string) => {
        const entry = entryOf(comment);
        if (!entry) return "failed";
        entry.content = text;
        writes += 1;
        if (writes === 1) switchChat();
        return "updated";
      });
      const applied = await coordinator.applyAccepted();
      expect(applied).toBe(1);
      expect(disableWIEntry).not.toHaveBeenCalled();
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
      (upsertWIEntry as jest.Mock).mockImplementation(async (_lorebook: string, comment: string, text: string) => {
        const entry = entryOf(comment);
        if (!entry) return "failed";
        entry.content = text;
        restores += 1;
        if (restores === 1) switchChat();
        return "updated";
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
    (enableWIEntry as jest.Mock).mockImplementation(async (_lorebook: string, comment: string) => { const entry = entryOf(comment); if (!entry) return false; entry.disable = false; return true; });
    (disableWIEntry as jest.Mock).mockImplementation(async (_lorebook: string, comment: string) => { const entry = entryOf(comment); if (!entry) return false; entry.disable = true; return true; });
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
    expect(env.read().proposals.at(-1)?.ops[0].status).toBe("applied");
    env.coordinator.clearContinuityNote();
    expect(clearStoryExtensionPrompt).toHaveBeenCalledWith(KEY);
    env.coordinator.onGenerationStarted("normal", false);
    expect(setStoryExtensionPrompt).toHaveBeenCalledTimes(1);
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
