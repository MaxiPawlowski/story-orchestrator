import { textModel } from "../../../test/support/modelCall";
import type { ModelAsk } from "@extraction/modelRoute";
import { parseStoryV2OrThrow, type EngineState, type NormalizedStoryV2 } from "@engine/index";
import { createEligibility, type CreateEligibilityRow, type CuratorOpRecord, type CuratorProposalRecord } from "@stagecraft/index";
import { StagecraftCoordinator, type StagecraftCoordinatorDeps } from "./stagecraftCoordinator";
import { createExtras, createStagecraft, sanitizeStagecraft, stripGlobalSettings } from "../extras";
import { defaultGlobalSettings } from "../settingsModel";
import { mintToken, tokenMatches, type RunContext, type RunToken } from "../runToken";
import type { RuntimeExtras, StagecraftRuntimeState } from "../types";

type Entry = { uid: number; comment: string; content: string; key: string[]; disable: boolean };

const books = new Map<string, Record<number, Entry>>();
const calls = { create: 0, remove: 0 };

const host = {
  setStoryExtensionPrompt: jest.fn(),
  clearStoryExtensionPrompt: jest.fn(),
  loadLorebook: async (name: string) => (books.has(name) ? { entries: books.get(name) } : null),
  readWIEntry: async (name: string, comment: string) => {
    const found = Object.values(books.get(name) ?? {}).find((entry) => entry.comment === comment);
    return found ? { content: found.content, keys: found.key, constant: false, disabled: found.disable, uid: found.uid } : null;
  },
  readWIEntryAt: async ({ lorebookFileId, uid }: { lorebookFileId: string; uid: number }) => {
    const found = books.get(lorebookFileId)?.[uid];
    return found ? { comment: found.comment, content: found.content, keys: found.key, constant: false, disabled: found.disable, uid } : null;
  },
  updateWIEntryByUid: async ({ lorebookFileId, uid }: { lorebookFileId: string; uid: number }, patch: { content?: string; disabled?: boolean }) => {
    const found = books.get(lorebookFileId)?.[uid];
    if (!found) return { ok: false, reason: "gone" };
    if (patch.content !== undefined) found.content = patch.content;
    if (patch.disabled !== undefined) found.disable = patch.disabled;
    return { ok: true, confirmed: true };
  },
  restoreWIEntryAt: async () => ({ ok: true, confirmed: true }),
  createWIEntry: jest.fn(async (name: string, entry: { comment: string; keys: string[]; content: string }) => {
    calls.create += 1;
    const book = books.get(name);
    if (!book) return { ok: false, reason: `there is no lorebook "${name}"` };
    if (Object.values(book).some((existing) => existing.comment.toLowerCase() === entry.comment.toLowerCase())) return { ok: false, reason: "exists" };
    const uid = Math.max(-1, ...Object.keys(book).map(Number)) + 1;
    book[uid] = { uid, comment: entry.comment, content: entry.content, key: [...entry.keys], disable: false };
    return { ok: true, uid, lorebookFileId: name, confirmed: true };
  }),
  deleteWIEntryAt: jest.fn(async ({ lorebookFileId, uid }: { lorebookFileId: string; uid: number }) => {
    calls.remove += 1;
    const book = books.get(lorebookFileId);
    if (!book?.[uid]) return { ok: false, reason: "gone" };
    delete book[uid];
    return { ok: true, confirmed: true };
  }),
  getContext: () => ({ extensionSettings: {}, chat: [] }),
};

const story = (createCap?: number): NormalizedStoryV2 => parseStoryV2OrThrow({
  format: 2,
  id: "create-fixture",
  title: "The Delta",
  description: "Curator create op.",
  qualities: [{ key: "crossed", type: "bool", source: "extractor", rubric: "Crossed?" }],
  checkpoints: [
    { id: "cp1", name: "The bank", objective: "Cross", type: "anchor", start: true, effects: { world_info: { enable: [{ lorebook: "Story Lore", comments: ["Sealed Vault"] }] } } },
  ],
  transitions: [],
  roster: [{ id: "mira", name: "Mira" }],
  stagecraft: { lorebooks: ["Story Lore"], exclude: [{ lorebook: "Story Lore", comments: ["The Ferryman"] }], ...(createCap !== undefined ? { createCap } : {}) },
});

const FACTS = ["Oskar the boatwright patched the ferry at dawn.", "Oskar charges one silver to mend a hull.", "Garrick sold rope once."];
const OSKAR = "[create] Story Lore || Oskar || Oskar, boatwright || The delta's boatwright; mends hulls for a silver.";

interface Options {
  facts?: string[];
  mode?: "review" | "auto" | "off";
  createEnabled?: boolean;
  requireMeasured?: boolean;
  rows?: CreateEligibilityRow[];
  model?: string | null;
  cap?: number;
}

const harness = (options: Options = {}) => {
  const base = createStagecraft();
  let state: StagecraftRuntimeState = {
    ...base,
    settings: { ...base.settings, curatorEnabled: true, acceptMode: options.mode ?? "review", createEnabled: options.createEnabled ?? true, createRequireMeasured: options.requireMeasured ?? false },
  };
  const journal: string[] = [];
  let chatId = "chat-a";
  let lastMessageId = 24;
  const model = jest.fn(async (_prompt: string, ask: ModelAsk): Promise<string> => ask.debugResponse ?? "NONE");
  const context = (): RunContext => ({ chatId, storyId: "create-fixture", storyHash: "h1", sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null });
  const deps = {
    hosts: { prompt: host, chat: { chatRows: () => [] }, player: { getPlayerName: () => "Max" }, curator: host } as never,
    getStory: () => story(options.cap),
    getState: () => ({ activeCheckpointId: "cp1", boundary: 12, lastMessageId, checkpointStartedBoundary: 0, blackboard: { values: {}, versions: {}, latched: {} } } as unknown as EngineState),
    getStagecraft: () => state,
    setStagecraft: (next: StagecraftRuntimeState) => { state = next; },
    model: textModel(model),
    getCanon: () => "",
    getOpenArcs: () => [],
    lore: {
      facts: () => options.facts ?? FACTS,
      roster: () => ["Mira"],
      eligibility: () => createEligibility(options.model === undefined ? "deepseek:deepseek-chat" : options.model, options.rows ?? []),
    },
    journal: (summary: string) => journal.push(summary),
    persist: async () => undefined,
    notify: () => undefined,
    ownership: { mint: () => mintToken(context()), check: (token: RunToken) => tokenMatches(context(), token) },
  } as StagecraftCoordinatorDeps;
  const coordinator = new StagecraftCoordinator(deps);
  const creates = () => state.proposals.flatMap((record) => record.ops.map((entry, index) => ({ record, entry, index }))).filter(({ entry }) => entry.op.kind === "create");
  return {
    coordinator, journal, model, read: () => state, creates,
    switchChat: () => { chatId = "chat-b"; },
    at: (id: number) => { lastMessageId = id; },
  };
};

const PASSING_ROW: CreateEligibilityRow = { model: "deepseek:deepseek-chat", contract: "create-B", revision: "2", runs: ["r1", "r2"], propose: [0.95, 0.93], none: [1, 1], measuredAt: "2026-10-09" };

beforeEach(() => {
  books.clear();
  books.set("Story Lore", {
    0: { uid: 0, comment: "The Delta", content: "Reeds and channels.", key: ["delta"], disable: false },
    1: { uid: 1, comment: "The Ferryman", content: "Excluded by the author.", key: ["ferry"], disable: false },
    2: { uid: 2, comment: "Sealed Vault", content: "Gated by a checkpoint.", key: ["vault"], disable: true },
  });
  calls.create = 0;
  calls.remove = 0;
  host.createWIEntry.mockClear();
  host.deleteWIEntryAt.mockClear();
});

describe("v2.8 11: the curator create op, end to end through the coordinator", () => {
  it("proposes a card for an entity two facts name, on the lore role, and it waits for the author", async () => {
    const env = harness();
    const outcome = await env.coordinator.runCreatePass("checkpoint", OSKAR);
    expect(outcome.ran).toBe(true);
    const [card] = env.creates();
    expect(card.entry).toMatchObject({ status: "pending", op: { kind: "create", lorebook: "Story Lore", comment: "Oskar", keys: ["Oskar", "boatwright"] } });
    expect(card.record).toMatchObject({ curator: "wi", reason: "lore creation", mode: "review" });
    expect(env.journal.some((line) => line.startsWith("Lore creation proposed 1 new entry"))).toBe(true);
    expect(calls.create).toBe(0);
  });

  it("asks the model on the lore role with the create prompt", async () => {
    const env = harness();
    await env.coordinator.runCreatePass("checkpoint");
    const [prompt, ask] = env.model.mock.calls[0] as [string, { role: string; pass: string }];
    expect(ask).toMatchObject({ role: "lore", pass: "loreCreate" });
    expect(prompt).toContain("[create] <lorebook> || <new entry title>");
    expect(prompt).toContain("ESTABLISHED FACTS:");
  });

  it.each([
    ["named by one fact only (contract B)", "[create] Story Lore || Garrick || Garrick || A rope seller.", "only one live fact names"],
    ["a cast member", "[create] Story Lore || Mira || Mira || The heroine.", "cast member"],
    ["an excluded title, recreated beside it", "[create] Story Lore || The Ferryman || Oskar, ferry || Oskar runs the ferry.", "excluded from the curator"],
    ["a checkpoint-gated title, recreated beside it", "[create] Story Lore || Sealed Vault || Oskar, vault || Oskar knows the vault.", "switched by checkpoint effects"],
    ["a book off the allowlist", "[create] Other Lore || Oskar || Oskar || The boatwright.", "not on this story's stagecraft allowlist"],
    ["a curator marker in the new text", "[create] Story Lore || Oskar || Oskar || {{// so:auto}} The boatwright.", "adds a curator marker"],
  ])("refuses %s at plan time, and nothing reaches the ring as a card", async (_label, response, reason) => {
    const env = harness();
    await env.coordinator.runCreatePass("checkpoint", response);
    expect(env.creates()).toEqual([]);
    expect(env.read().proposals[0]?.dropped.join(" ")).toContain(reason);
  });

  it("never runs in off mode, with the switch off, or with fewer than two facts; no model call is sent", async () => {
    for (const env of [harness({ mode: "off" }), harness({ createEnabled: false }), harness({ facts: ["Oskar mends hulls."] })]) {
      const outcome = await env.coordinator.runCreatePass("checkpoint", OSKAR);
      expect(outcome.ran).toBe(false);
      expect(env.model).not.toHaveBeenCalled();
    }
  });

  it("auto mode never creates on its own: the card still waits, and the boundary writes nothing", async () => {
    const env = harness({ mode: "auto" });
    await env.coordinator.runCreatePass("checkpoint", OSKAR);
    expect(env.creates()[0].entry.status).toBe("pending");
    expect(await env.coordinator.applyAccepted()).toBe(0);
    expect(calls.create).toBe(0);
  });

  it("bulk accept never reaches a create: only the card's own accept does", async () => {
    const env = harness();
    await env.coordinator.runCreatePass("checkpoint", OSKAR);
    const [card] = env.creates();
    await env.coordinator.decideProposal(card.record.id, "accepted");
    expect(env.creates()[0].entry.status).toBe("pending");
    await env.coordinator.setOpDecision(card.record.id, card.index, "accepted");
    expect(env.creates()[0].entry.status).toBe("accepted");
  });

  it("an accepted card is written at the next boundary, into the listed book only, and recorded in the created ledger", async () => {
    const env = harness();
    await env.coordinator.runCreatePass("checkpoint", OSKAR);
    const [card] = env.creates();
    await env.coordinator.setOpDecision(card.record.id, card.index, "accepted");
    expect(await env.coordinator.applyAccepted()).toBe(1);
    const created = Object.values(books.get("Story Lore") ?? {}).find((entry) => entry.comment === "Oskar");
    expect(created).toMatchObject({ key: ["Oskar", "boatwright"], content: "The delta's boatwright; mends hulls for a silver.", disable: false });
    expect(env.creates()[0].entry).toMatchObject({ status: "applied", target: { lorebookFileId: "Story Lore", uid: created?.uid } });
    expect(env.read().created).toEqual([expect.objectContaining({ lorebook: "Story Lore", comment: "Oskar", uid: created?.uid })]);
    expect(env.journal).toContain("World Info curator created 1 new entry");
  });

  it("the author's edit to the card is what gets written", async () => {
    const env = harness();
    await env.coordinator.runCreatePass("checkpoint", OSKAR);
    const [card] = env.creates();
    await env.coordinator.setOpDecision(card.record.id, card.index, "accepted", { kind: "create", lorebook: "Story Lore", comment: "Oskar", keys: ["Oskar"], text: "Edited." });
    await env.coordinator.applyAccepted();
    expect(Object.values(books.get("Story Lore") ?? {}).find((entry) => entry.comment === "Oskar")).toMatchObject({ key: ["Oskar"], content: "Edited." });
  });

  it("the write edge refuses a title that appeared in the book since the proposal, and never edits it", async () => {
    const env = harness();
    await env.coordinator.runCreatePass("checkpoint", OSKAR);
    const [card] = env.creates();
    await env.coordinator.setOpDecision(card.record.id, card.index, "accepted");
    books.get("Story Lore")![7] = { uid: 7, comment: "Oskar", content: "The author wrote this.", key: ["Oskar"], disable: false };
    expect(await env.coordinator.applyAccepted()).toBe(0);
    expect(env.creates()[0].entry).toMatchObject({ status: "failed", message: expect.stringContaining("already exists") });
    expect(books.get("Story Lore")![7].content).toBe("The author wrote this.");
    expect(calls.create).toBe(0);
  });

  it("the write edge refuses an edited card whose title is excluded or gated, and one carrying a marker", async () => {
    for (const op of [
      { kind: "create" as const, lorebook: "Story Lore", comment: "The Ferryman", keys: ["ferry"], text: "x" },
      { kind: "create" as const, lorebook: "Story Lore", comment: "Sealed Vault", keys: ["vault"], text: "x" },
      { kind: "create" as const, lorebook: "Story Lore", comment: "Oskar", keys: ["Oskar"], text: "{{// so:protect}}x{{// so:end}}" },
    ]) {
      const env = harness();
      await env.coordinator.runCreatePass("checkpoint", OSKAR);
      const [card] = env.creates();
      await env.coordinator.setOpDecision(card.record.id, card.index, "accepted", op);
      expect(await env.coordinator.applyAccepted()).toBe(0);
      expect(env.creates()[0].entry.status).toBe("failed");
    }
    expect(calls.create).toBe(0);
  });

  it("createCap bounds the proposals and the writes: past the cap nothing is proposed and the pass sends no call", async () => {
    const env = harness({ cap: 1 });
    await env.coordinator.runCreatePass("checkpoint", `${OSKAR}\n[create] Story Lore || Oskar's yard || Oskar, yard || Where Oskar mends hulls.`);
    expect(env.creates()).toHaveLength(1);
    expect(env.read().proposals[0].dropped.join(" ")).toContain("limit of 1 new entry");
    env.model.mockClear();
    expect(await env.coordinator.runCreatePass("checkpoint", OSKAR)).toMatchObject({ ran: false, skipped: "cap-reached" });
    expect(env.model).not.toHaveBeenCalled();
  });

  it("a rollback past the write deletes the created entry under compare-and-set and trims the ledger", async () => {
    const env = harness();
    await env.coordinator.runCreatePass("checkpoint", OSKAR);
    const [card] = env.creates();
    await env.coordinator.setOpDecision(card.record.id, card.index, "accepted");
    await env.coordinator.applyAccepted();
    expect(await env.coordinator.revertAppliedSince(20)).toBe(1);
    expect(Object.values(books.get("Story Lore") ?? {}).some((entry) => entry.comment === "Oskar")).toBe(false);
    expect(env.read().created).toEqual([]);
    expect(env.journal.some((line) => line.includes("1 new entry deleted"))).toBe(true);
  });

  it("a created entry the author edited after the write is kept by the rollback and marked externally-edited", async () => {
    const env = harness();
    await env.coordinator.runCreatePass("checkpoint", OSKAR);
    const [card] = env.creates();
    await env.coordinator.setOpDecision(card.record.id, card.index, "accepted");
    await env.coordinator.applyAccepted();
    const created = Object.values(books.get("Story Lore") ?? {}).find((entry) => entry.comment === "Oskar") as Entry;
    created.key = ["Oskar", "hull"];
    expect(await env.coordinator.revertAppliedSince(20)).toBe(0);
    expect(books.get("Story Lore")?.[created.uid]).toBeDefined();
    expect(calls.remove).toBe(0);
    expect(env.creates()[0].entry.status).toBe("externally-edited");
  });

  it("a rollback that outlives its chat deletes nothing", async () => {
    const env = harness();
    await env.coordinator.runCreatePass("checkpoint", OSKAR);
    const [card] = env.creates();
    await env.coordinator.setOpDecision(card.record.id, card.index, "accepted");
    await env.coordinator.applyAccepted();
    const read = host.readWIEntryAt;
    host.readWIEntryAt = async (target) => {
      env.switchChat();
      return read(target);
    };
    try {
      await env.coordinator.revertAppliedSince(20);
    } finally {
      host.readWIEntryAt = read;
    }
    expect(calls.remove).toBe(0);
    expect(Object.values(books.get("Story Lore") ?? {}).some((entry) => entry.comment === "Oskar")).toBe(true);
  });

  it("a pass whose chat changed while the model answered is discarded and writes nothing", async () => {
    const env = harness();
    env.model.mockImplementationOnce(async () => {
      env.switchChat();
      return OSKAR;
    });
    expect(await env.coordinator.runCreatePass("checkpoint")).toMatchObject({ ran: true, record: null, discarded: "chat" });
    expect(env.creates()).toEqual([]);
  });

  it("a create interrupted after its write-ahead save is settled on reload by title: landed -> applied, absent -> written next boundary", async () => {
    const pending = (comment: string): CuratorOpRecord => ({
      op: { kind: "create", lorebook: "Story Lore", comment, keys: [comment], text: "Made." }, status: "accepted",
      after: { content: "Made.", disabled: false }, created: { keys: [comment] }, target: { lorebookFileId: "Story Lore" },
      writeAhead: { status: "pending", at: "2026-10-09T10:00:00.000Z", messageId: 22 },
    });
    const record: CuratorProposalRecord = { id: "lore-1", curator: "wi", at: "t", boundary: 10, messageId: 20, checkpointId: "cp1", reason: "lore creation", summary: "", mode: "review", ops: [pending("Landed"), pending("Lost")], dropped: [] };
    books.get("Story Lore")![9] = { uid: 9, comment: "Landed", content: "Made.", key: ["Landed"], disable: false };
    const env = harness();
    env.read().proposals.push(record);
    expect(await env.coordinator.reconcileWriteAhead()).toEqual({ applied: 1, retry: 1, left: 0 });
    expect(env.read().proposals[0].ops.map((entry) => entry.status)).toEqual(["applied", "accepted"]);
    expect(env.read().created).toEqual([expect.objectContaining({ comment: "Landed", uid: 9 })]);
  });

  it("the created ledger survives persistence and hydrate", () => {
    const extras = createExtras(defaultGlobalSettings);
    const row = { lorebook: "Story Lore", lorebookFileId: "Story Lore", uid: 4, comment: "Oskar", proposalId: "lore-1", messageId: 20, at: "t" };
    extras.stagecraft = { ...extras.stagecraft, created: [row] };
    const stored = JSON.parse(JSON.stringify(stripGlobalSettings(extras))) as RuntimeExtras;
    expect(stored.stagecraft.created).toEqual([row]);
    expect(sanitizeStagecraft(stored).created).toEqual([row]);
  });
});

describe("v2.8 11 B1: eligibility (route model x create-B x fixture revision 2)", () => {
  it("an unmeasured route, a repointed model and a stale revision each read not measured; a passing row reads measured", () => {
    expect(createEligibility("deepseek:deepseek-chat", []).state).toBe("not-measured");
    expect(createEligibility("deepseek:deepseek-chat", [PASSING_ROW]).state).toBe("measured");
    expect(createEligibility("deepseek:deepseek-reasoner", [PASSING_ROW]).state).toBe("not-measured");
    expect(createEligibility("deepseek:deepseek-chat", [PASSING_ROW], "3").state).toBe("not-measured");
    expect(createEligibility(null, [PASSING_ROW]).state).toBe("unknown-model");
    expect(createEligibility("deepseek:deepseek-chat", [{ ...PASSING_ROW, none: [1, 0.97] }]).state).toBe("below-floor");
    expect(createEligibility("deepseek:deepseek-chat", [{ ...PASSING_ROW, runs: ["r1"], propose: [0.95], none: [1] }]).state).toBe("below-floor");
  });

  it("with measurement required, an unmeasured route is refused before any call and the refusal is journaled", async () => {
    const env = harness({ requireMeasured: true });
    expect(await env.coordinator.runCreatePass("checkpoint", OSKAR)).toMatchObject({ ran: false, skipped: "not-measured" });
    expect(env.model).not.toHaveBeenCalled();
    expect(env.journal).toContain("Lore creation refused before any call: its route is not measured");
    expect(env.read().lastCreatePass?.reason).toContain("has not been measured");
  });

  it("with measurement required, a measured route runs; a repointed profile stops it again", async () => {
    expect((await harness({ requireMeasured: true, rows: [PASSING_ROW] }).coordinator.runCreatePass("checkpoint", OSKAR)).ran).toBe(true);
    const repointed = harness({ requireMeasured: true, rows: [PASSING_ROW], model: "openai:gpt-6" });
    expect((await repointed.coordinator.runCreatePass("checkpoint", OSKAR)).skipped).toBe("not-measured");
  });

  it("by default (owner 2026-10-09: floors informational) an unmeasured route still runs and the journal names its state", async () => {
    const env = harness();
    expect((await env.coordinator.runCreatePass("checkpoint", OSKAR)).ran).toBe(true);
    expect(env.journal.some((line) => line.includes("(not-measured)"))).toBe(true);
  });
});
