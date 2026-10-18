import { recordingModel } from "../../../test/support/modelCall";
import { testOwnership } from "../../../test/findings/testOwnership";
import { parseStoryOrThrow, type EngineState } from "@engine/index";
import { CURATOR_DIGEST_INDEX_LIMIT, TITLE_ONLY_REFUSAL, type CuratorProposalRecord } from "@stagecraft/index";
import { StagecraftCoordinator, type StagecraftCoordinatorDeps } from "./stagecraftCoordinator";
import { createStagecraft } from "../extras";
import type { StagecraftRuntimeState } from "../types";

interface Entry { uid: number; comment: string; key: string[]; content: string; disable: boolean }

type Books = Record<string, Entry[]>;

const CANON = "The flood took the bridge.";

const series = (prefix: string, uids: number[], tweak: (entry: Entry) => Entry = (entry) => entry): Entry[] =>
  uids.map((uid) => tweak({ uid, comment: `${prefix} ${uid}`, key: [`zk-${prefix.toLowerCase()}-${uid}`], content: `${prefix} body ${uid} ${"x".repeat(40)}`, disable: false }));

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, at) => from + at);

const bridge = (entry: Entry): Entry => ({ ...entry, comment: "Bridge", key: ["bridge"], content: "The bridge stands, its ropes new and taut." });

function harness(books: Books, lorebooks: string[] = Object.keys(books), mode: "auto" | "review" = "review") {
  const store = new Map(Object.entries(books).map(([name, entries]) => [name, new Map(entries.map((entry) => [entry.uid, { ...entry }]))]));
  const writes: Array<{ book: string; uid: number; content?: string; disabled?: boolean }> = [];
  let state: StagecraftRuntimeState = { ...createStagecraft(), settings: { ...createStagecraft().settings, curatorEnabled: true, acceptMode: mode } };
  const replies: string[] = [];
  const model = recordingModel(() => replies.shift() ?? "NONE");
  const view = (entry: Entry) => ({ comment: entry.comment, content: entry.content, keys: entry.key, constant: false, disabled: entry.disable, uid: entry.uid });
  const at = (target: { lorebookFileId: string; uid: number }) => store.get(target.lorebookFileId)?.get(target.uid);
  const host = {
    loadLorebook: async (name: string) => (store.has(name) ? { entries: Object.fromEntries([...store.get(name)!].map(([uid, entry]) => [uid, { ...entry }])) } : null),
    readWIEntry: async (name: string, comment: string) => { const entry = [...(store.get(name)?.values() ?? [])].find((candidate) => candidate.comment === comment); return entry ? view(entry) : null; },
    readWIEntryAt: async (target: { lorebookFileId: string; uid: number }) => { const entry = at(target); return entry ? view(entry) : null; },
    updateWIEntryByUid: async (target: { lorebookFileId: string; uid: number }, patch: { content?: string; disabled?: boolean }) => {
      const entry = at(target);
      if (!entry) return { ok: false, reason: "gone" };
      writes.push({ book: target.lorebookFileId, uid: target.uid, ...patch });
      if (patch.content !== undefined) entry.content = patch.content;
      if (patch.disabled !== undefined) entry.disable = patch.disabled;
      return { ok: true, confirmed: true };
    },
    restoreWIEntryAt: async (target: { lorebookFileId: string; uid: number }, image: { content: string; disabled: boolean }) => {
      const entry = at(target);
      if (!entry) return { ok: false, reason: "gone" };
      entry.content = image.content;
      entry.disable = image.disabled;
      return { ok: true, confirmed: true };
    },
    setStoryExtensionPrompt: () => undefined,
    clearStoryExtensionPrompt: () => undefined,
  };
  const story = parseStoryOrThrow({
    id: "digest-books", title: "Crossing", description: "Curator.", qualities: [],
    checkpoints: [{ id: "cp1", name: "The bank", objective: "Cross", type: "anchor", start: true }], transitions: [], roster: [],
    stagecraft: { lorebooks },
  });
  const coordinator = new StagecraftCoordinator({
    hosts: { prompt: host, chat: { chatRows: () => [] }, player: { getPlayerName: () => "Max" }, curator: host } as never,
    getStory: () => story,
    getState: () => ({ activeCheckpointId: "cp1", boundary: 10, lastMessageId: 20, blackboard: { values: {}, versions: {}, latched: {} }, visitedAnchors: ["cp1"] }) as unknown as EngineState,
    getStagecraft: () => state, setStagecraft: (next) => { state = next; },
    model, getCanon: () => CANON, getOpenArcs: () => [], journal: () => undefined,
    persist: async () => undefined, notify: () => undefined, ownership: testOwnership(),
  } as StagecraftCoordinatorDeps);
  return {
    coordinator, writes, store,
    read: () => state,
    prompt: () => model.calls.at(-1)?.prompt ?? "",
    pass: async (reply: string) => { replies.push(reply); return coordinator.runCuratorPass("test"); },
    entry: (book: string, uid: number) => store.get(book)!.get(uid)!,
    inject: (ops: CuratorProposalRecord["ops"]) => { state = { ...state, proposals: [...state.proposals, { id: "inject", curator: "wi", at: "", boundary: 10, messageId: 20, checkpointId: "cp1", reason: "replay", summary: "", mode: "review", ops, dropped: [] }] }; },
  };
}

type Run = ReturnType<typeof harness>;

const targets = (record: CuratorProposalRecord | null) =>
  (record?.ops ?? []).map((entry) => { const op = entry.op as { kind: string; lorebook: string; uid?: number }; return `${op.kind}@${op.lorebook}#${String(op.uid)}`; });

const acceptAll = async (run: Run, record: CuratorProposalRecord) => {
  for (let index = 0; index < record.ops.length; index += 1) await run.coordinator.setOpDecision(record.id, index, "accepted");
  return run.coordinator.applyAccepted();
};

describe("C13-b digest references: the prompt, the parse and the plan share one vocabulary", () => {
  it("two books with the same uids: a relevant entry in the later book and title-only entries in the earlier one resolve to what was displayed", async () => {
    const run = harness({ "Book A": series("Alpha", range(1, 30)), "Book B": series("Beta", range(1, 30), (entry) => (entry.uid === 12 ? bridge(entry) : entry)) });
    const outcome = await run.pass("[disable] #1.7\n[patch] #2.12 || The bridge stands || new and taut || The bridge is gone.\n[rewrite] #1.9 || New text.\n[disable] #7\n[disable] #2.7");
    const prompt = run.prompt();
    expect(prompt).toContain('- #2.12 "Bridge" (Book B)');
    expect(prompt).toContain('#1.7 "Alpha 7" [currently on]');
    expect(prompt).toContain('#2.7 "Beta 7" [currently on]');
    expect(run.read().lastPass?.digest).toMatchObject({ full: 1, titleOnly: 59, unlisted: 0 });
    expect(targets(outcome.record)).toEqual(["patch@Book B#12", "disable@Book A#7", "disable@Book B#7"]);
    expect(outcome.record!.dropped.join(" ")).toContain(TITLE_ONLY_REFUSAL);
    expect(outcome.record!.dropped.join(" ")).toContain("#7 is not an entry this story owns");
    expect(await acceptAll(run, outcome.record!)).toBe(3);
    expect(run.entry("Book B", 12).content).toBe("The bridge is gone.");
    expect(run.entry("Book A", 12).content).toContain("Alpha body 12");
    expect(run.entry("Book A", 7).disable).toBe(true);
    expect(run.entry("Book B", 7).disable).toBe(true);
    expect(run.entry("Book A", 9).content).toContain("Alpha body 9");
    expect(run.writes.map((write) => `${write.book}#${write.uid}`).sort()).toEqual(["Book A#7", "Book B#12", "Book B#7"]);
  });

  it("when every later-book entry is unlisted the earlier book's references lose their ordinals, and unlisted targets are refused", async () => {
    const run = harness({ "Book A": series("Alpha", range(1, 320)), "Book B": series("Beta", range(1, 30)) });
    const outcome = await run.pass("[disable] #7\n[disable] Beta 7\n[disable] #301\n[disable] #1.7\n[disable] #2.7");
    const prompt = run.prompt();
    expect(run.read().lastPass?.digest).toEqual({ full: 0, titleOnly: CURATOR_DIGEST_INDEX_LIMIT, unlisted: 50 });
    expect(prompt).toContain('#7 "Alpha 7" [currently on]');
    expect(prompt).not.toContain("#1.7");
    expect(prompt).not.toContain("Beta 7");
    expect(prompt).toContain("(50 more entries are not listed, so you may not touch them)");
    expect(targets(outcome.record)).toEqual(["disable@Book A#7"]);
    expect(outcome.record!.dropped).toHaveLength(4);
    expect(await acceptAll(run, outcome.record!)).toBe(1);
    expect(run.writes.map((write) => `${write.book}#${write.uid}:${String(write.disabled)}`)).toEqual(["Book A#7:true"]);
    expect(run.entry("Book B", 7).disable).toBe(false);
  });

  it("a partly unlisted later book keeps ordinals only for the uids still listed on both sides", async () => {
    const run = harness({ "Book A": series("Alpha", range(1, 160)), "Book B": series("Beta", range(1, 160)) });
    const outcome = await run.pass("[disable] #141\n[disable] #2.100\n[disable] #2.150\n[disable] #1.141");
    const prompt = run.prompt();
    expect(run.read().lastPass?.digest).toEqual({ full: 0, titleOnly: CURATOR_DIGEST_INDEX_LIMIT, unlisted: 20 });
    expect(prompt).toContain('#1.100 "Alpha 100"');
    expect(prompt).toContain('#2.100 "Beta 100"');
    expect(prompt).toContain('#141 "Alpha 141"');
    expect(prompt).not.toContain("Beta 150");
    expect(targets(outcome.record)).toEqual(["disable@Book A#141", "disable@Book B#100"]);
    expect(await acceptAll(run, outcome.record!)).toBe(2);
    expect(run.writes.map((write) => `${write.book}#${write.uid}`).sort()).toEqual(["Book A#141", "Book B#100"]);
  });

  it("a bare number never reaches an entry whose displayed reference carries a book ordinal", async () => {
    const run = harness({
      "Book A": [...series("Alpha", [1, 2]), ...series("Alpha", range(101, 130))],
      "Book B": [...series("Beta", [2, 12]), ...series("Beta", range(201, 230))],
    });
    const outcome = await run.pass("[disable] #2\n[disable] #1\n[disable] #12\n[disable] #1.2\n[disable] #2.2");
    const prompt = run.prompt();
    expect(prompt).toContain('#1 "Alpha 1"');
    expect(prompt).toContain('#1.2 "Alpha 2"');
    expect(prompt).toContain('#2.2 "Beta 2"');
    expect(prompt).toContain('#12 "Beta 12"');
    expect(targets(outcome.record)).toEqual(["disable@Book A#1", "disable@Book B#12", "disable@Book A#2", "disable@Book B#2"]);
    expect(outcome.record!.dropped.join(" ")).toContain("#2 is not an entry this story owns");
  });

  it("the same title in two books lists its book, and a bare title naming both is refused", async () => {
    const shared = (entry: Entry): Entry => ({ ...entry, comment: "Shared", key: [`zk-shared-${entry.uid}`] });
    const run = harness({ "Book A": series("Alpha", range(1, 30), (entry) => (entry.uid === 3 ? shared(entry) : entry)), "Book B": series("Beta", range(1, 30), (entry) => (entry.uid === 3 ? shared(entry) : entry)) });
    const outcome = await run.pass('[disable] "Shared" (Book B)\n[disable] Shared');
    expect(run.prompt()).toContain('#1.3 "Shared" (Book A) [currently on]');
    expect(run.prompt()).toContain('#2.3 "Shared" (Book B) [currently on]');
    expect(run.prompt()).toContain('#1.4 "Alpha 4" [currently on]');
    expect(targets(outcome.record)).toEqual(["disable@Book B#3"]);
    expect(outcome.record!.dropped.join(" ")).toContain("ambiguous");
  });

  it("blank, missing and empty books count for nothing: ordinals follow the books that hold entries", async () => {
    const run = harness({ "Book A": series("Alpha", range(1, 30)), "Empty Book": [], "Book B": series("Beta", range(1, 30)) }, ["Book A", "Missing Book", "Empty Book", "Book B"]);
    const outcome = await run.pass("[disable] #2.5\n[disable] #3.5");
    expect(run.prompt()).toContain('#2.5 "Beta 5"');
    expect(run.prompt()).not.toContain("#3.5");
    expect(targets(outcome.record)).toEqual(["disable@Book B#5"]);
  });

  it("an entry with a blank title is not in the scope at all", async () => {
    const run = harness({ "Book A": series("Alpha", range(1, 45), (entry) => (entry.uid === 4 ? { ...entry, comment: "  " } : entry)) });
    await run.pass("NONE");
    expect(run.read().lastPass?.digest).toEqual({ full: 0, titleOnly: 44, unlisted: 0 });
    expect(run.prompt()).not.toContain("#4 ");
  });

  it("without a digest the references are unchanged: below the threshold two books keep their ordinals", async () => {
    const run = harness({ "Book A": series("Alpha", range(1, 5)), "Book B": series("Beta", range(1, 5)) });
    const outcome = await run.pass("[disable] #2.3");
    expect(run.prompt()).toContain('- #2.3 "Beta 3" (Book B)');
    expect(targets(outcome.record)).toEqual(["disable@Book B#3"]);
  });
});
