import { parseStoryV2OrThrow } from "@engine/index";
import type { RunContext } from "./runToken";
import { constantMisses, forcedOutcome, HIDDEN_GENERATIONS_FOR_REPAIR, LORE_EVIDENCE_LIMIT, LoreEvidence, type ScanInput } from "./worldInfoEvidence";

const story = parseStoryV2OrThrow({
  format: 2,
  title: "Evidence",
  description: "World info evidence fixture.",
  qualities: [],
  checkpoints: [
    { id: "one", name: "One", objective: "One.", type: "anchor", start: true, effects: { world_info: { enable: [{ lorebook: "Ruins", comments: ["CP1 Road", "CP1 Keyword"] }] } } },
    { id: "two", name: "Two", objective: "Two.", type: "anchor", effects: { world_info: { enable: [{ lorebook: "Ruins", comments: ["CP2 Gate"] }], disable: [{ lorebook: "Ruins", comments: ["CP1 Road"] }] } } },
  ],
  transitions: [],
  roster: [],
});

const entry = (uid: number, comment: string, extra: Partial<ScanInput> = {}, world = "Ruins"): ScanInput => ({ world, uid, comment, ...extra });

const harness = () => {
  const world = { chatId: "chat-1", epoch: 1, revision: 0, mutations: [] as Array<{ revision: number; messageId: number }> };
  const context = (): RunContext => ({
    chatId: world.chatId,
    storyId: "evidence",
    playedVersion: 1,
    sessionEpoch: world.epoch,
    windowRevision: world.revision,
    lowestMutatedSince: (revision) => {
      const since = world.mutations.filter((mutation) => mutation.revision > revision).map((mutation) => mutation.messageId);
      return since.length ? Math.min(...since) : null;
    },
  });
  const evidence = new LoreEvidence();
  evidence.attach({ chatId: () => world.chatId, context, now: () => "2026-09-24T00:00:00.000Z" });
  const mutate = (messageId: number) => {
    world.revision += 1;
    world.mutations.push({ revision: world.revision, messageId });
  };
  const turn = (lastMessageId: number, scans: Array<{ entries: ScanInput[]; loud?: boolean; tag?: string }>, extra: { forced?: Array<{ world: string; uid: number; comment: string }>; loaded?: ScanInput[]; path?: string[] } = {}) => {
    evidence.opened({ type: "normal" });
    if (extra.forced) evidence.forced(extra.forced);
    if (extra.loaded) evidence.loadedView(extra.loaded);
    for (const scan of scans) evidence.scanned(scan.entries, scan.tag ?? "normal", scan.loud ?? true);
    return evidence.settled({ rendered: true, lastMessageId, story, path: extra.path ?? ["one"], mirrorBook: "Story Orchestrator - Evidence - chat-1" });
  };
  return { world, evidence, mutate, turn };
};

describe("forcedOutcome (LoreSelection landed / lost)", () => {
  it("a pick lands only when a scan activated that very entry, by world and uid", () => {
    const outcome = forcedOutcome(
      [{ world: "Lore", uid: 1, comment: "A" }, { world: "Lore", uid: 2, comment: "B" }],
      [{ world: "lore", uid: 1, comment: "A", constant: false, key0: null }, { world: "Other", uid: 2, comment: "B", constant: false, key0: null }],
    );
    expect(outcome.landed.map((pick) => pick.comment)).toEqual(["A"]);
    expect(outcome.lost.map((pick) => pick.comment)).toEqual(["B"]);
  });
});

describe("constantMisses", () => {
  const fired = [{ world: "Ruins", uid: 9, comment: "unrelated", constant: false, key0: null }];

  it("flags a constant entry the path switches on, that the view held enabled, and that did not fire", () => {
    const loaded = [entry(1, "CP1 Road", { constant: true }), entry(2, "CP1 Keyword"), entry(3, "CP2 Gate", { constant: true })].map((input) => ({ world: "Ruins", uid: input.uid as number, comment: String(input.comment), constant: input.constant === true, disable: false }));
    expect(constantMisses(story, ["one"], loaded, fired)).toEqual([{ lorebook: "Ruins", comment: "CP1 Road" }]);
  });

  it("never flags a keyword entry, a disabled copy, an entry the path switched off, or one that fired", () => {
    const loaded = [
      { world: "Ruins", uid: 1, comment: "CP1 Road", constant: true, disable: false },
      { world: "Ruins", uid: 3, comment: "CP2 Gate", constant: true, disable: true },
    ];
    expect(constantMisses(story, ["one", "two"], loaded, fired)).toEqual([]);
    expect(constantMisses(story, ["one"], loaded, [{ world: "Ruins", uid: 1, comment: "CP1 Road", constant: true, key0: null }])).toEqual([]);
  });

  it("matches the file path's first entry only, as the file path does with a duplicated comment", () => {
    const loaded = [
      { world: "Ruins", uid: 1, comment: "CP1 Road", constant: true, disable: false },
      { world: "Ruins", uid: 5, comment: "CP1 Road", constant: true, disable: false },
    ];
    expect(constantMisses(story, ["one"], loaded, [{ world: "Ruins", uid: 5, comment: "CP1 Road", constant: true, key0: null }])).toEqual([{ lorebook: "Ruins", comment: "CP1 Road" }]);
  });
});

describe("LoreEvidence ring", () => {
  it("records what a loud generation's scans activated, per slot", () => {
    const { evidence, turn } = harness();
    turn(3, [{ entries: [entry(1, "CP1 Road", { constant: true, key: ["road"] })] }]);
    const last = evidence.view(story, null).last;
    expect(last?.lastMessageId).toBe(3);
    expect(last?.fired).toEqual([{ world: "Ruins", uid: 1, comment: "CP1 Road", constant: true, key0: "road", origin: "gated" }]);
  });

  it("a generation whose scans fired nothing records an empty slot, never the previous turn's list", () => {
    const { evidence, turn } = harness();
    turn(3, [{ entries: [entry(1, "CP1 Road")] }]);
    turn(5, []);
    const last = evidence.view(story, null).last;
    expect(last?.lastMessageId).toBe(5);
    expect(last?.fired).toEqual([]);
    expect(last?.scanCount).toBe(0);
  });

  it("an edit at or before a slot's reply drops it; one after it keeps it (inv 11)", () => {
    const { evidence, mutate, turn } = harness();
    turn(3, [{ entries: [entry(1, "CP1 Road")] }]);
    turn(5, [{ entries: [entry(2, "CP1 Keyword")] }]);
    mutate(7);
    expect(evidence.slotsForChat().map((slot) => slot.lastMessageId)).toEqual([3, 5]);
    mutate(5);
    expect(evidence.slotsForChat().map((slot) => slot.lastMessageId)).toEqual([3]);
    mutate(0);
    expect(evidence.slotsForChat()).toEqual([]);
  });

  it("a new world drops every slot, and another chat's slots are never shown", () => {
    const { world, evidence, turn } = harness();
    turn(3, [{ entries: [entry(1, "CP1 Road")] }]);
    world.chatId = "chat-2";
    expect(evidence.view(story, null).last).toBeNull();
    world.chatId = "chat-1";
    expect(evidence.view(story, null).last?.lastMessageId).toBe(3);
    world.epoch += 1;
    expect(evidence.view(story, null).last).toBeNull();
  });

  it("keeps at most the declared number of slots", () => {
    const { evidence, turn } = harness();
    for (let index = 0; index < LORE_EVIDENCE_LIMIT + 5; index += 1) turn(index, []);
    expect(evidence.slotsForChat()).toHaveLength(LORE_EVIDENCE_LIMIT);
  });

  it("tags several scans of one generation instead of merging them, and a quiet scan never counts as the reply", () => {
    const { evidence, turn } = harness();
    const forced = [{ world: "Lore", uid: 4, comment: "NPC - Ellie" }];
    const flags = turn(6, [
      { entries: [entry(1, "CP1 Road", { constant: true })] },
      { entries: [entry(4, "NPC - Ellie", {}, "Lore")], loud: false, tag: "quiet" },
      { entries: [entry(2, "CP1 Keyword")] },
    ], { forced });
    const last = evidence.view(story, null).last;
    expect(last?.scanCount).toBe(3);
    expect(last?.nestedScans).toBe(1);
    expect(last?.fired.map((row) => row.comment)).toEqual(["CP1 Road", "NPC - Ellie", "CP1 Keyword"]);
    expect(last?.lost).toEqual(forced);
    expect(flags.map((flag) => flag.kind)).toEqual(["lore-force-lost"]);
  });

  it("a forced pick a loud scan activated lands and raises nothing", () => {
    const { evidence, turn } = harness();
    const forced = [{ world: "Lore", uid: 4, comment: "NPC - Ellie" }];
    const flags = turn(6, [{ entries: [entry(4, "NPC - Ellie", {}, "Lore")] }], { forced });
    expect(flags).toEqual([]);
    expect(evidence.view(story, null).last?.landed).toEqual(forced);
    expect(evidence.view(story, null).last?.fired[0].origin).toBe("pick");
  });

  it("raises the constant miss from the view the scan loaded, never from a keyword entry", () => {
    const { turn } = harness();
    const flags = turn(6, [{ entries: [entry(9, "Weather", {}, "Lore")] }], { loaded: [entry(1, "CP1 Road", { constant: true }), entry(2, "CP1 Keyword")] });
    expect(flags).toEqual([expect.objectContaining({ kind: "lore-constant-missed", missed: [{ lorebook: "Ruins", comment: "CP1 Road" }] })]);
  });

  it("never flags a constant entry the author filtered to certain characters: its absence on another member's turn is authored (live 2026-09-25, CP1 - Mission is DM Narrator only)", () => {
    const { evidence, turn } = harness();
    const narratorOnly = { names: ["DM Narrator"], tags: [], isExclude: false };
    expect(turn(6, [{ entries: [entry(9, "Weather", {}, "Lore")] }], { loaded: [entry(1, "CP1 Road", { constant: true, characterFilter: narratorOnly })] })).toEqual([]);
    expect(turn(7, [{ entries: [entry(9, "Weather", {}, "Lore")] }], { loaded: [entry(1, "CP1 Road", { constant: true, characterFilter: { names: [], tags: ["guild"], isExclude: true } })] })).toEqual([]);
    expect(evidence.view(story, null).last?.constantMissed).toEqual([]);
  });

  it("control: an empty character filter is no filter, so the miss is still flagged", () => {
    const { turn } = harness();
    const flags = turn(6, [{ entries: [entry(9, "Weather", {}, "Lore")] }], { loaded: [entry(1, "CP1 Road", { constant: true, characterFilter: { names: [], tags: [], isExclude: false } })] });
    expect(flags).toEqual([expect.objectContaining({ kind: "lore-constant-missed", missed: [{ lorebook: "Ruins", comment: "CP1 Road" }] })]);
  });

  it("with no loud scan observed there is nothing to judge, so a slot raises no flag", () => {
    const { turn } = harness();
    expect(turn(6, [], { forced: [{ world: "Lore", uid: 4, comment: "NPC - Ellie" }], loaded: [entry(1, "CP1 Road", { constant: true })] })).toEqual([]);
  });

  it("marks the chat's mirror rows and measures how often each fires when the view holds it enabled", () => {
    const { evidence, turn } = harness();
    const mirror = "Story Orchestrator - Evidence - chat-1";
    const loaded = [entry(1, "so_rel-1", {}, mirror), entry(2, "so_rel-2", {}, mirror), entry(3, "so_rel-3", { disable: true }, mirror)];
    turn(3, [{ entries: [entry(1, "so_rel-1", {}, mirror)] }], { loaded });
    turn(5, [{ entries: [entry(1, "so_rel-1", {}, mirror), entry(2, "so_rel-2", {}, mirror)] }], { loaded });
    expect(evidence.view(story, mirror).last?.fired.map((row) => row.origin)).toEqual(["mirror", "mirror"]);
    expect(evidence.mirrorRates()).toEqual([
      { comment: "so_rel-1", eligible: 2, fired: 2, rate: 1 },
      { comment: "so_rel-2", eligible: 2, fired: 1, rate: 0.5 },
    ]);
  });

  it("a story book another listener removed from the view, two loud generations running, is reported hidden", () => {
    const { evidence } = harness();
    const books = ["Ruins", "Lore"];
    const first = [entry(1, "CP1 Road"), entry(4, "NPC", {}, "Lore")];
    const last = [entry(4, "NPC", {}, "Lore")];
    const generation = (after: ScanInput[]) => {
      evidence.opened({ type: "normal" });
      evidence.filtered(books, first, after);
      evidence.filtered(books, first, after);
      evidence.settled({ rendered: true, lastMessageId: 1, story, path: ["one"], mirrorBook: null });
    };
    generation(last);
    expect(evidence.hiddenBooks()).toEqual([]);
    for (let index = 1; index < HIDDEN_GENERATIONS_FOR_REPAIR; index += 1) generation(last);
    expect(evidence.hiddenBooks()).toEqual(["Ruins"]);
    generation(first);
    expect(evidence.hiddenBooks()).toEqual([]);
  });

  it("C3: a hidden count does not carry into another chat that shares the book", () => {
    const { evidence, world } = harness();
    const first = [entry(1, "CP1 Road")];
    const hiddenGeneration = () => {
      evidence.opened({ type: "normal" });
      evidence.filtered(["Ruins"], first, []);
      evidence.settled({ rendered: true, lastMessageId: 1, story, path: ["one"], mirrorBook: null });
    };
    for (let index = 1; index < HIDDEN_GENERATIONS_FOR_REPAIR; index += 1) hiddenGeneration();
    world.chatId = "chat-2";
    hiddenGeneration();
    expect(evidence.hiddenBooks()).toEqual([]);
    world.chatId = "chat-1";
    expect(evidence.hiddenBooks()).toEqual([]);
    hiddenGeneration();
    expect(evidence.hiddenBooks()).toEqual(["Ruins"]);
  });

  it("C3 control: the same hidden generations in one chat still raise the book", () => {
    const { evidence } = harness();
    for (let index = 0; index < HIDDEN_GENERATIONS_FOR_REPAIR; index += 1) {
      evidence.opened({ type: "normal" });
      evidence.filtered(["Ruins"], [entry(1, "CP1 Road")], []);
      evidence.settled({ rendered: true, lastMessageId: 1, story, path: ["one"], mirrorBook: null });
    }
    expect(evidence.hiddenBooks()).toEqual(["Ruins"]);
  });

  it("a book that never reached the view is not hidden: absent first is not a filter", () => {
    const { evidence } = harness();
    for (let index = 0; index < 3; index += 1) {
      evidence.opened({ type: "normal" });
      evidence.filtered(["Ruins"], [], []);
      evidence.settled({ rendered: true, lastMessageId: index, story, path: ["one"], mirrorBook: null });
    }
    expect(evidence.hiddenBooks()).toEqual([]);
  });

  it("drops an activated entry that names no book or no uid instead of recording a guess", () => {
    const { evidence, turn } = harness();
    turn(2, [{ entries: [{ comment: "no world", uid: 3 }, { world: "Ruins", comment: "no uid" }, { world: "Ruins", uid: Number.NaN }, entry(1, "CP1 Road")] }]);
    expect(evidence.view(story, null).last?.fired.map((row) => row.uid)).toEqual([1]);
  });

  it("the same entry activated by two scans of one generation is one fired row", () => {
    const { evidence, turn } = harness();
    turn(2, [{ entries: [entry(1, "CP1 Road")] }, { entries: [entry(1, "CP1 Road"), { ...entry(1, "CP1 Road"), world: "ruins" }] }]);
    expect(evidence.view(story, null).last?.fired).toHaveLength(1);
  });

  it("records nothing outside an open slot", () => {
    const { evidence } = harness();
    evidence.scanned([entry(1, "CP1 Road")], "normal", true);
    expect(evidence.settled({ rendered: true, lastMessageId: 1, story, path: ["one"], mirrorBook: null })).toEqual([]);
    expect(evidence.slotsForChat()).toEqual([]);
  });
});

describe("warden-lore content capture (v2.5 plan 08 L7)", () => {
  const MIRROR = "Story Orchestrator - Evidence - chat-1";
  const generate = (evidence: LoreEvidence, lastMessageId: number, scans: Array<{ entries: ScanInput[]; loud?: boolean }>, books: string[], rendered = true) => {
    evidence.opened({ type: "normal" });
    for (const scan of scans) evidence.scanned(scan.entries, "normal", scan.loud ?? true, books);
    evidence.settled({ rendered, lastMessageId, story, path: ["one"], mirrorBook: MIRROR });
  };

  it("keeps the text of story-book entries that fired on a loud scan of this reply, and nothing from mirror or foreign books", () => {
    const { evidence } = harness();
    generate(evidence, 3, [
      { entries: [entry(1, "CP1 Road", { content: "The road runs east." }), entry(7, "so_arin", { content: "Arin owes Mira." }, MIRROR), entry(9, "Tavern", { content: "Ale is cheap." }, "Town")] },
      { entries: [entry(2, "CP1 Keyword", { content: "A quiet whisper." })], loud: false },
    ], ["Ruins"]);
    expect(evidence.firedLore(3)).toEqual([{ comment: "CP1 Road", text: "The road runs east." }]);
  });

  it("answers only for the rendered reply at that message, and forgets a reply that was swiped or deleted", () => {
    const { evidence, mutate } = harness();
    generate(evidence, 3, [{ entries: [entry(1, "CP1 Road", { content: "The road runs east." })] }], ["Ruins"]);
    generate(evidence, 5, [{ entries: [entry(1, "CP1 Road", { content: "Stopped." })] }], ["Ruins"], false);
    expect(evidence.firedLore(4)).toEqual([]);
    expect(evidence.firedLore(5)).toEqual([]);
    expect(evidence.firedLore(3)).toHaveLength(1);
    mutate(3);
    expect(evidence.firedLore(3)).toEqual([]);
  });

  it("never lets the text leave memory: the view and the persisted fired record carry no content", () => {
    const { evidence } = harness();
    generate(evidence, 3, [{ entries: [entry(1, "CP1 Road", { content: "The road runs east." })] }], ["Ruins"]);
    expect(JSON.stringify(evidence.view(story, MIRROR))).not.toContain("The road runs east.");
    expect(JSON.stringify(evidence.slotsForChat())).not.toContain("The road runs east.");
  });
});
