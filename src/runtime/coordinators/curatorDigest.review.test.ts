import { recordingModel } from "../../../test/support/modelCall";
import { parseStoryOrThrow, type EngineState, type NormalizedStory } from "@engine/index";
import {
  CURATOR_DIGEST_FULL_LIMIT, CURATOR_DIGEST_INDEX_LIMIT, DIGEST_NO_MATCH, SEEN_TARGET_REFUSAL, TITLE_ONLY_REFUSAL, buildWiCuratorPrompt, entriesForScope,
  type CuratorOpRecord, type CuratorProposalRecord,
} from "@stagecraft/index";
import { StagecraftCoordinator, type StagecraftCoordinatorDeps } from "./stagecraftCoordinator";
import { createStagecraft } from "../extras";
import { mintToken, tokenMatches, type RunContext, type RunToken } from "../runToken";
import type { StagecraftRuntimeState } from "../types";

type Entry = { uid: number; comment: string; key: string[]; content: string; disable: boolean; constant?: boolean };

const CANON = "The flood took the bridge.";

const storyWith = (stagecraft: Record<string, unknown>, extra: Record<string, unknown> = {}): NormalizedStory => parseStoryOrThrow({
  id: "digest-fixture", title: "Crossing", description: "Curator.", qualities: [],
  checkpoints: [{ id: "cp1", name: "The bank", objective: "Cross", type: "anchor", start: true, ...extra }], transitions: [], roster: [],
  stagecraft,
});

const plainStory = () => storyWith({ lorebooks: ["Story Lore"] });

const entries = (count: number, tweak: (entry: Entry) => Entry = (entry) => entry): Entry[] => Array.from({ length: count }, (_, index) => tweak({
  uid: index + 1,
  comment: index === 0 ? "Bridge" : index === 1 ? "Bank" : `Place ${index + 1}`,
  key: index === 0 ? ["bridge"] : index === 1 ? ["bank"] : [`zk${index}`],
  content: index === 0 ? "The bridge stands, its ropes new and taut." : index === 1 ? "The bank is quiet." : `Private text ${index + 1} ${"x".repeat(60)}`,
  disable: false,
}));

interface Options {
  mode?: "auto" | "review";
  story?: NormalizedStory;
  filterEntries?: StagecraftCoordinatorDeps["filterEntries"];
  onAsk?: () => void;
}

function harness(initial: Entry[], options: Options = {}) {
  const book = new Map(initial.map((entry) => [entry.uid, { ...entry }]));
  const writes: Array<{ uid: number; content?: string; disabled?: boolean }> = [];
  let state: StagecraftRuntimeState = { ...createStagecraft(), settings: { ...createStagecraft().settings, curatorEnabled: true, acceptMode: options.mode ?? "review" } };
  const replies: string[] = [];
  let chatId = "chat-a";
  const engine = { lastMessageId: 20 };
  const context = (): RunContext => ({ chatId, storyId: "digest-fixture", storyHash: "h1", sessionEpoch: 1, windowRevision: 0, lowestMutatedMessageId: null });
  const model = recordingModel(() => { options.onAsk?.(); return replies.shift() ?? "NONE"; });
  const view = (entry: Entry) => ({ comment: entry.comment, content: entry.content, keys: entry.key, constant: entry.constant === true, disabled: entry.disable, uid: entry.uid });
  const host = {
    loadLorebook: async () => ({ entries: Object.fromEntries([...book].map(([uid, entry]) => [uid, { ...entry }])) }),
    readWIEntry: async (_book: string, comment: string) => { const entry = [...book.values()].find((candidate) => candidate.comment === comment); return entry ? view(entry) : null; },
    readWIEntryAt: async ({ uid }: { uid: number }) => { const entry = book.get(uid); return entry ? view(entry) : null; },
    updateWIEntryByUid: async ({ uid }: { uid: number }, patch: { content?: string; disabled?: boolean }) => {
      const entry = book.get(uid);
      if (!entry) return { ok: false, reason: "gone" };
      writes.push({ uid, ...patch });
      if (patch.content !== undefined) entry.content = patch.content;
      if (patch.disabled !== undefined) entry.disable = patch.disabled;
      return { ok: true, confirmed: true };
    },
    restoreWIEntryAt: async ({ uid }: { uid: number }, image: { content: string; disabled: boolean }) => {
      const entry = book.get(uid);
      if (!entry) return { ok: false, reason: "gone" };
      entry.content = image.content;
      entry.disable = image.disabled;
      return { ok: true, confirmed: true };
    },
    setStoryExtensionPrompt: () => undefined,
    clearStoryExtensionPrompt: () => undefined,
  };
  const chosen = options.story ?? plainStory();
  const coordinator = new StagecraftCoordinator({
    hosts: { prompt: host, chat: { chatRows: () => [] }, player: { getPlayerName: () => "Max" }, curator: host } as never,
    getStory: () => chosen,
    getState: () => ({ activeCheckpointId: "cp1", boundary: 10, lastMessageId: engine.lastMessageId, blackboard: { values: {}, versions: {}, latched: {} }, visitedAnchors: ["cp1"] }) as unknown as EngineState,
    getStagecraft: () => state, setStagecraft: (next) => { state = next; },
    model, getCanon: () => CANON, getOpenArcs: () => [], journal: () => undefined,
    persist: async () => undefined, notify: () => undefined,
    ownership: { mint: () => mintToken(context()), check: (token: RunToken) => tokenMatches(context(), token) },
    ...(options.filterEntries ? { filterEntries: options.filterEntries } : {}),
  } as StagecraftCoordinatorDeps);
  return {
    coordinator, writes, book, engine,
    read: () => state,
    reply: (text: string) => replies.push(text),
    prompt: () => model.calls.at(-1)?.prompt ?? "",
    asks: () => model.calls.length,
    switchChat: () => { chatId = "chat-b"; },
    inject: (ops: CuratorOpRecord[]) => {
      const record: CuratorProposalRecord = { id: `inject-${state.proposals.length}`, curator: "wi", at: "", boundary: 10, messageId: 20, checkpointId: "cp1", reason: "replay", summary: "", mode: "review", ops, dropped: [] };
      state = { ...state, proposals: [...state.proposals, record] };
      return record.id;
    },
  };
}

const pass = async (run: ReturnType<typeof harness>, reply: string) => {
  run.reply(reply);
  return run.coordinator.runCuratorPass("test");
};

const kinds = (record: CuratorProposalRecord | null) => (record?.ops ?? []).map((entry) => `${entry.op.kind}:${(entry.op as { comment: string }).comment}`);

describe("C13-b curator digest through the coordinator", () => {
  it("below the threshold the request is the unchanged full-text prompt", async () => {
    const run = harness(entries(39));
    await pass(run, "NONE");
    expect(run.prompt()).toBe(buildWiCuratorPrompt({ storyTitle: "Crossing", checkpointName: "The bank", objective: "Cross", canon: CANON, openArcs: [], entries: entriesForScope("Story Lore", entries(39)), declined: [] }));
    expect(run.prompt()).not.toContain("OTHER ENTRIES");
    expect(run.read().lastPass?.digest).toBeUndefined();
  });

  it("from 40 entries the best matches keep their text and every other entry is a title", async () => {
    const run = harness(entries(60));
    await pass(run, "NONE");
    const prompt = run.prompt();
    expect(prompt).toContain("The bridge stands, its ropes new and taut.");
    expect(prompt).toContain("The bank is quiet.");
    expect(prompt).not.toContain("Private text 7");
    expect(prompt).toContain('"Place 7" [currently on]');
    expect(prompt).toContain("OTHER ENTRIES (title only");
    expect(run.read().lastPass?.digest).toEqual({ full: 2, titleOnly: 58, unlisted: 0 });
    expect(prompt.length).toBeLessThan(buildWiCuratorPrompt({ storyTitle: "Crossing", checkpointName: "The bank", objective: "Cross", canon: CANON, openArcs: [], entries: entriesForScope("Story Lore", entries(60)) }).length);
  });

  it("a scope with nothing relevant says so and still indexes every title", async () => {
    const run = harness(entries(45, (entry) => (entry.uid <= 2 ? { ...entry, comment: `Unrelated ${entry.uid}`, key: [`qq${entry.uid}`] } : entry)));
    await pass(run, "NONE");
    expect(run.prompt()).toContain(DIGEST_NO_MATCH);
    expect(run.read().lastPass?.digest).toEqual({ full: 0, titleOnly: 45, unlisted: 0 });
  });

  it("a very large scope keeps at most 16 in full and a bounded index; an unlisted entry cannot be named", async () => {
    const run = harness(entries(CURATOR_DIGEST_INDEX_LIMIT + 60, (entry) => (entry.uid <= 30 ? { ...entry, comment: `Bridge ${entry.uid}`, key: ["bridge"] } : entry)));
    const last = CURATOR_DIGEST_INDEX_LIMIT + 60;
    const outcome = await pass(run, `[disable] Place ${last}\n[disable] Place 40`);
    expect(run.read().lastPass?.digest).toEqual({ full: CURATOR_DIGEST_FULL_LIMIT, titleOnly: CURATOR_DIGEST_INDEX_LIMIT, unlisted: last - CURATOR_DIGEST_FULL_LIMIT - CURATOR_DIGEST_INDEX_LIMIT });
    expect(run.prompt()).toContain("more entries are not listed, so you may not touch them");
    expect(kinds(outcome.record)).toEqual(["disable:Place 40"]);
    expect(outcome.record!.dropped.join(" ")).toContain(`Place ${last}`);
  });

  it("an empty book and a book of hidden entries never reach the model", async () => {
    const empty = harness([]);
    expect(await empty.coordinator.runCuratorPass("test")).toEqual({ ran: false, skipped: "empty-scope", record: null });
    const gated = harness(entries(45), { story: storyWith({ lorebooks: ["Story Lore"], exclude: [{ lorebook: "Story Lore", comments: entries(45).map((entry) => entry.comment) }] }) });
    expect(await gated.coordinator.runCuratorPass("test")).toEqual({ ran: false, skipped: "empty-scope", record: null });
    expect(empty.asks() + gated.asks()).toBe(0);
  });

  it("a title-only rewrite or patch never becomes a card, and is remembered as refused", async () => {
    const run = harness(entries(60));
    const outcome = await pass(run, "[rewrite] Place 7 || A new body.\n[patch] Place 8 || Private text 8 || xxx || A new span.\n[patch] Bridge || The bridge stands || new and taut || The bridge is gone.");
    expect(kinds(outcome.record)).toEqual(["patch:Bridge"]);
    expect(outcome.record!.dropped.filter((reason) => reason.includes(TITLE_ONLY_REFUSAL))).toHaveLength(2);
    expect(outcome.record!.refused!.map((op) => op.comment)).toEqual(["Place 7", "Place 8"]);
    run.reply("NONE");
    await run.coordinator.runCuratorPass("test");
    expect(run.prompt()).toContain("THE AUTHOR DECLINED");
    expect(run.prompt()).toContain("[rewrite] Place 7");
  });

  it("a title-only on/off flip is a card marked as title-only, applies, and rolls back", async () => {
    const run = harness(entries(60, (entry) => (entry.uid === 8 ? { ...entry, disable: true } : entry)));
    const outcome = await pass(run, "[disable] Place 7\n[enable] Place 8");
    expect(kinds(outcome.record)).toEqual(["disable:Place 7", "enable:Place 8"]);
    expect(outcome.record!.ops.map((entry) => entry.seen)).toEqual(["title", "title"]);
    for (const index of [0, 1]) await run.coordinator.setOpDecision(outcome.record!.id, index, "accepted");
    expect(await run.coordinator.applyAccepted()).toBe(2);
    expect(run.book.get(7)!.disable).toBe(true);
    expect(run.book.get(8)!.disable).toBe(false);
    expect(await run.coordinator.revertAppliedSince(20)).toBe(2);
    expect(run.book.get(7)!.disable).toBe(false);
    expect(run.book.get(8)!.disable).toBe(true);
  });

  it("write edge: an accepted edit of a title-only entry is refused whatever the plan said, and the book is untouched", async () => {
    const run = harness(entries(60));
    const id = run.inject([
      { op: { kind: "rewrite", lorebook: "Story Lore", comment: "Place 7", uid: 7, text: "A new body." }, status: "accepted", seen: "title" },
      { op: { kind: "patch", lorebook: "Story Lore", comment: "Place 8", uid: 8, anchor: "Private text 8 || xxx", replace: "Changed." }, status: "accepted", seen: "title" },
    ]);
    expect(await run.coordinator.applyAccepted()).toBe(0);
    const ops = run.read().proposals.find((record) => record.id === id)!.ops;
    expect(ops.map((entry) => entry.status)).toEqual(["failed", "failed"]);
    expect(ops.every((entry) => (entry.message ?? "").includes(TITLE_ONLY_REFUSAL))).toBe(true);
    expect(run.writes).toEqual([]);
  });

  it("write edge control: the same edits without the title-only mark are written", async () => {
    const run = harness(entries(60));
    run.inject([{ op: { kind: "rewrite", lorebook: "Story Lore", comment: "Place 7", uid: 7, text: "A new body." }, status: "accepted" }]);
    expect(await run.coordinator.applyAccepted()).toBe(1);
    expect(run.book.get(7)!.content).toBe("A new body.");
  });

  it("an author cannot turn a title-only flip into an edit", async () => {
    const run = harness(entries(60));
    const outcome = await pass(run, "[disable] Place 7");
    await run.coordinator.setOpDecision(outcome.record!.id, 0, "accepted", { kind: "rewrite", lorebook: "Story Lore", comment: "Place 7", uid: 7, text: "Smuggled." });
    expect(await run.coordinator.applyAccepted()).toBe(0);
    expect(run.read().proposals[0].ops[0]).toMatchObject({ status: "failed", message: expect.stringContaining(TITLE_ONLY_REFUSAL) });
    expect(run.writes).toEqual([]);
  });

  it("write edge: an edit stamped at proposal cannot be moved onto an entry the curator was not shown", async () => {
    const run = harness(entries(60));
    const outcome = await pass(run, "[patch] Bridge || The bridge stands || new and taut || The bridge is gone.");
    expect(outcome.record!.ops.map((entry) => [entry.seen, entry.seenTarget?.comment])).toEqual([["full", "Bridge"]]);
    await run.coordinator.setOpDecision(outcome.record!.id, 0, "accepted", { kind: "rewrite", lorebook: "Story Lore", comment: "Place 7", uid: 7, text: "Smuggled." });
    expect(await run.coordinator.applyAccepted()).toBe(0);
    expect(run.read().proposals[0].ops[0]).toMatchObject({ status: "failed", message: expect.stringContaining(SEEN_TARGET_REFUSAL) });
    expect(run.writes).toEqual([]);
    const kept = harness(entries(60));
    const proposed = await pass(kept, "[patch] Bridge || The bridge stands || new and taut || The bridge is gone.");
    await kept.coordinator.setOpDecision(proposed.record!.id, 0, "accepted", { kind: "rewrite", lorebook: "Story Lore", comment: "Bridge", uid: 1, text: "The author's own words." });
    expect(await kept.coordinator.applyAccepted()).toBe(1);
    expect(kept.book.get(1)!.content).toBe("The author's own words.");
  });

  it("a relevant entry stays editable, and its protected span still holds", async () => {
    const run = harness(entries(60, (entry) => (entry.uid === 1 ? { ...entry, content: "The bridge stands {{// so:protect}}by the old oak{{// so:end}} and its ropes are taut." } : entry)));
    const outcome = await pass(run, "[patch] Bridge || and its ropes || are taut || and its ropes are cut.\n[rewrite] Bridge || The bridge is gone.");
    expect(kinds(outcome.record)).toEqual(["patch:Bridge"]);
    expect(outcome.record!.dropped.join(" ")).toContain("touches protected text");
    expect(outcome.record!.ops[0].seen).toBe("full");
  });

  it("a title-only entry with a protected span cannot be switched off, though the model never saw the span", async () => {
    const run = harness(entries(60, (entry) => (entry.uid === 7 ? { ...entry, content: "Hidden {{// so:protect}}never off{{// so:end}}." } : entry)));
    const outcome = await pass(run, "[disable] Place 7\n[disable] Place 9");
    expect(kinds(outcome.record)).toEqual(["disable:Place 9"]);
    expect(outcome.record!.dropped.join(" ")).toContain("touches protected text");
  });

  it("auto mode accepts a title-only flip only for an auto-tier entry that is not constant", async () => {
    const run = harness(entries(60, (entry) => {
      if (entry.uid === 7) return { ...entry, content: `{{// so:auto}}${entry.content}` };
      if (entry.uid === 8) return { ...entry, content: `{{// so:auto}}${entry.content}`, constant: true };
      return entry;
    }), { mode: "auto" });
    const outcome = await pass(run, "[disable] Place 7\n[disable] Place 8\n[disable] Place 9");
    expect(outcome.record!.ops.map((entry) => [(entry.op as { comment: string }).comment, entry.status])).toEqual([["Place 7", "accepted"], ["Place 8", "pending"], ["Place 9", "pending"]]);
    expect(await run.coordinator.applyAccepted()).toBe(1);
    expect(run.writes.map((write) => write.uid)).toEqual([7]);
  });

  it("a constant entry that is title-only still waits for review in auto mode", async () => {
    const run = harness(entries(60, (entry) => (entry.uid === 7 ? { ...entry, constant: true, content: `{{// so:auto}}${entry.content}` } : entry)), { mode: "auto" });
    const outcome = await pass(run, "[disable] Place 7");
    expect(outcome.record!.ops[0].status).toBe("pending");
    expect(await run.coordinator.applyAccepted()).toBe(0);
  });

  it("checkpoint-gated and author-excluded entries appear nowhere in the prompt and cannot be named", async () => {
    const gated = storyWith({ lorebooks: ["Story Lore"], exclude: [{ lorebook: "Story Lore", comments: ["Place 9"] }] }, {
      effects: { world_info: { enable: [{ lorebook: "Story Lore", comments: ["Place 7"] }] } },
    });
    const run = harness(entries(60), { story: gated });
    const outcome = await pass(run, "[disable] Place 7\n[disable] Place 9\n[disable] Place 11");
    expect(run.prompt()).not.toContain("Place 7\"");
    expect(run.prompt()).not.toContain("Place 9\"");
    expect(run.read().lastPass?.digest).toEqual({ full: 2, titleOnly: 56, unlisted: 0 });
    expect(kinds(outcome.record)).toEqual(["disable:Place 11"]);
    run.inject([{ op: { kind: "disable", lorebook: "Story Lore", comment: "Place 7", uid: 7 }, status: "accepted" }]);
    expect(await run.coordinator.applyAccepted()).toBe(0);
    expect(run.book.get(7)!.disable).toBe(false);
  });

  it("a stale pass is discarded when the chat changed while the model answered", async () => {
    const run = harness(entries(60), { onAsk: () => run.switchChat() });
    const outcome = await pass(run, "[disable] Place 7");
    expect(outcome).toEqual({ ran: true, record: null, discarded: "chat" });
    expect(run.read().proposals).toEqual([]);
    expect(run.read().lastPass).toBeNull();
  });

  it("falls back to the full digest when the judge filter fails, and to the plain prompt when it narrows below the threshold", async () => {
    const failing = harness(entries(60), { filterEntries: async () => { throw new Error("down"); } });
    await pass(failing, "NONE");
    expect(failing.read().lastPass?.digest).toEqual({ full: 2, titleOnly: 58, unlisted: 0 });
    const narrowing = harness(entries(60), { filterEntries: async (all) => all.slice(0, 30) });
    await pass(narrowing, "NONE");
    expect(narrowing.read().lastPass?.digest).toBeUndefined();
    expect(narrowing.prompt()).not.toContain("OTHER ENTRIES");
    expect(narrowing.read().lastPass?.focus).toEqual({ shown: 30, total: 60 });
  });

  it("a rollback that reopens an applied flip for review keeps the title-only mark", async () => {
    const run = harness(entries(60));
    const outcome = await pass(run, "[disable] Place 7");
    await run.coordinator.setOpDecision(outcome.record!.id, 0, "accepted");
    run.engine.lastMessageId = 25;
    expect(await run.coordinator.applyAccepted()).toBe(1);
    expect(await run.coordinator.revertAppliedSince(22)).toBe(1);
    const reopened = run.read().proposals[0].ops[0];
    expect(reopened).toMatchObject({ status: "pending", seen: "title" });
    expect(run.book.get(7)!.disable).toBe(false);
  });
});
