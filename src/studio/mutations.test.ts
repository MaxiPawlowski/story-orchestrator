import { isValidationErrorList, parseStoryV2, type Quality } from "@engine/index";
import { boundCardQualities, cardQualityEligible, declaredCardFields } from "@engine/cardFields";
import { newStoryDraft, type StoryDraft } from "./draft";
import {
  addCheckpoint,
  addQuality,
  addTransition,
  clearStartCheckpoint,
  nextId,
  removeCheckpoint,
  removeQuality,
  setMemberCard,
  setRequirements,
  setStagecraft,
  setStartCheckpoint,
  setStoryField,
  setTransitionGate,
  updateQuality,
  setLoreSelect,
  setSceneRead,
  setChapters,
} from "./mutations";

const base = (): StoryDraft => ({
  ...newStoryDraft(),
  checkpoints: [
    { id: "start", name: "Start", objective: "", type: "intermediate", start: true },
    { id: "cache", name: "Cache", objective: "", type: "anchor" },
  ],
  transitions: [{ from: "start", to: "cache", priority: 0, gate: { all: [] } }],
});

describe("nextId", () => {
  it("returns base when unused", () => {
    expect(nextId(["a", "b"], "quality")).toBe("quality");
  });
  it("suffixes on collision", () => {
    expect(nextId(["quality", "quality_2"], "quality")).toBe("quality_3");
  });
});

describe("quality mutations", () => {
  it("adds a default quality without mutating the input", () => {
    const draft = base();
    const next = addQuality(draft);
    expect(next.qualities).toHaveLength(1);
    expect(draft.qualities).toHaveLength(0);
    expect(next).not.toBe(draft);
  });
  it("updates by key", () => {
    const draft = addQuality(base(), { key: "trust", type: "int", source: "extractor", rubric: "r" });
    const next = updateQuality(draft, "trust", { rubric: "changed" });
    expect(next.qualities[0].rubric).toBe("changed");
  });
  it("removes by key", () => {
    const draft = addQuality(base(), { key: "trust", type: "int", source: "extractor", rubric: "r" });
    expect(removeQuality(draft, "trust").qualities).toHaveLength(0);
  });
});

describe("checkpoint mutations", () => {
  it("removing a checkpoint drops transitions that reference it", () => {
    const next = removeCheckpoint(base(), "cache");
    expect(next.checkpoints.map((entry) => entry.id)).toEqual(["start"]);
    expect(next.transitions).toHaveLength(0);
  });
  it("generates unique ids", () => {
    const next = addCheckpoint(addCheckpoint(base()));
    const ids = next.checkpoints.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("transition mutations", () => {
  it("sets a whole gate", () => {
    const draft = base();
    const gate = { all: [{ q: "trust", op: ">=" as const, v: 2 }] };
    const next = setTransitionGate(draft, 0, gate);
    expect(next.transitions[0].gate).toEqual(gate);
    expect(draft.transitions[0].gate).toEqual({ all: [] });
  });
  it("appends transitions", () => {
    const next = addTransition(base());
    expect(next.transitions).toHaveLength(2);
  });
});

describe("start checkpoint", () => {
  it("setStartCheckpoint makes exactly one checkpoint the start", () => {
    const next = setStartCheckpoint(base(), "cache");
    expect(next.checkpoints.filter((entry) => entry.start)).toHaveLength(1);
    expect(next.checkpoints.find((entry) => entry.id === "cache")?.start).toBe(true);
    expect(next.checkpoints.find((entry) => entry.id === "start")?.start).toBeUndefined();
  });
  it("clearStartCheckpoint removes the start flag", () => {
    const next = clearStartCheckpoint(base(), "start");
    expect(next.checkpoints.find((entry) => entry.id === "start")?.start).toBeUndefined();
  });
});

describe("setStoryField", () => {
  it("sets top-level fields immutably", () => {
    const draft = base();
    const next = setStoryField(draft, "title", "Renamed");
    expect(next.title).toBe("Renamed");
    expect(draft.title).toBe("Untitled Story");
  });
});

describe("setRequirements / setStagecraft keep entries as typed", () => {
  it("keeps a trailing space mid-word and a blank new row", () => {
    const draft = base();
    expect(setRequirements(draft, { personas: ["Max "] }).requirements).toEqual({ personas: ["Max "] });
    expect(setRequirements(draft, { personas: ["Max Power"], lorebooks: [""] }).requirements).toEqual({ personas: ["Max Power"], lorebooks: [""] });
    expect(setStagecraft(draft, { lorebooks: ["Xentar "] }).stagecraft).toEqual({ lorebooks: ["Xentar "] });
    expect(setStagecraft(draft, { lorebooks: [""] }).stagecraft).toEqual({ lorebooks: [""] });
  });
  it("drops an empty list, and the whole block when no list has an entry", () => {
    const draft: StoryDraft = { ...base(), requirements: { members: ["Arin"] }, stagecraft: { lorebooks: ["Lore"] } };
    expect(setRequirements(draft, { members: ["Arin"], personas: [] }).requirements).toEqual({ members: ["Arin"] });
    expect(setRequirements(draft, { members: [] })).not.toHaveProperty("requirements");
    expect(setStagecraft(draft, { lorebooks: [] })).not.toHaveProperty("stagecraft");
  });
  it("C10: a lorebook-only write keeps the author's exclusions, and an explicit list replaces them", () => {
    const exclude = [{ lorebook: "Lore", comments: ["House style"] }];
    const draft: StoryDraft = { ...base(), stagecraft: { lorebooks: ["Lore"], exclude } };
    expect(setStagecraft(draft, { lorebooks: ["Lore", "More"] }).stagecraft).toEqual({ lorebooks: ["Lore", "More"], exclude });
    expect(setStagecraft(draft, { lorebooks: ["Lore"], exclude: [] }).stagecraft).toEqual({ lorebooks: ["Lore"] });
    expect(setStagecraft(draft, { lorebooks: [] }).stagecraft).toEqual({ lorebooks: [], exclude });
  });
  it("leaves the trimming to parse", () => {
    const draft = setStagecraft(setRequirements(base(), { personas: ["Max Power ", ""], lorebooks: [" Xentar Checkpoints"] }), { lorebooks: ["", " "] });
    const parsed = parseStoryV2(draft);
    if (isValidationErrorList(parsed)) throw new Error(parsed[0]?.message);
    expect(parsed.requirements).toEqual({ personas: ["Max Power"], lorebooks: ["Xentar Checkpoints"] });
    expect(parsed.stagecraft).toBeUndefined();
  });
});

describe("setSceneRead (v2.2 plan 03)", () => {
  it("keeps entries as typed, drops empty lists and the default inject, and removes an empty block", () => {
    const draft = newStoryDraft();
    expect(setSceneRead(draft, { locations: ["guild ", ""], times: [], inject: true }).scene_read).toEqual({ locations: ["guild ", ""] });
    expect(setSceneRead(draft, { inject: false }).scene_read).toEqual({ inject: false });
    expect(setSceneRead({ ...draft, scene_read: { locations: ["hall"] } }, { locations: [] })).not.toHaveProperty("scene_read");
  });
});

describe("setLoreSelect (v2.2 plan 04)", () => {
  it("keeps books as typed, keeps set numbers, and drops the block with no book", () => {
    const draft = newStoryDraft();
    expect(setLoreSelect(draft, { lorebooks: ["Story ", ""], top_k: 6 }).lore_select).toEqual({ lorebooks: ["Story ", ""], top_k: 6 });
    expect(setLoreSelect(draft, { lorebooks: ["Story Lore"], top_k: undefined }).lore_select).toEqual({ lorebooks: ["Story Lore"] });
    expect(setLoreSelect({ ...draft, lore_select: { lorebooks: ["Story Lore"] } }, { lorebooks: [] })).not.toHaveProperty("lore_select");
  });

  it("L5: keeps the exclusive flag only when set, and keeps it with no book so the diagnostic can name it", () => {
    const draft = newStoryDraft();
    expect(setLoreSelect(draft, { lorebooks: ["Story Lore"], exclusive: true }).lore_select).toEqual({ lorebooks: ["Story Lore"], exclusive: true });
    expect(setLoreSelect(draft, { lorebooks: ["Story Lore"], exclusive: false }).lore_select).toEqual({ lorebooks: ["Story Lore"] });
    expect(setLoreSelect(draft, { lorebooks: [], exclusive: true }).lore_select).toEqual({ lorebooks: [], exclusive: true });
  });
});

describe("card fields (plan 24 C)", () => {
  const carded = (): StoryDraft => ({ ...base(), qualities: [{ key: "look", type: "string", source: "extractor", rubric: "how the look changes" }], roster: [{ id: "guide", name: "The Guide" }] });

  it("binds a quality to a member's card and drops an emptied card", () => {
    const bound = setMemberCard(carded(), "guide", { fields: { look: { quality: "look", visual: true } } });
    expect(bound.roster[0].card).toEqual({ fields: { look: { quality: "look", visual: true } } });
    expect(setMemberCard(bound, "guide", { fields: {} }).roster[0].card).toBeUndefined();
    expect(setMemberCard(bound, "guide", undefined).roster[0].card).toBeUndefined();
  });

  it("creates and clears the player card without disturbing other player fields", () => {
    const withPlayer: StoryDraft = { ...carded(), player: { name: "You" } };
    const bound = setMemberCard(withPlayer, "player", { fields: { look: { quality: "look" } } });
    expect(bound.player).toEqual({ name: "You", card: { fields: { look: { quality: "look" } } } });
    expect(setMemberCard(bound, "player", undefined).player).toEqual({ name: "You", card: undefined });
  });

  it("a bound card validates", () => {
    const bound = setMemberCard(carded(), "guide", { fields: { look: { quality: "look" } } });
    expect(isValidationErrorList(parseStoryV2(bound))).toBe(false);
  });

  it("only a non-latching extractor string or enum may bind", () => {
    const quality = (over: Partial<Quality>): Quality => ({ key: "q", type: "string", source: "extractor", rubric: "", ...over });
    expect(cardQualityEligible(quality({ type: "string" }))).toBe(true);
    expect(cardQualityEligible(quality({ type: "enum" }))).toBe(true);
    expect(cardQualityEligible(quality({ type: "int" }))).toBe(false);
    expect(cardQualityEligible(quality({ source: "code" }))).toBe(false);
    expect(cardQualityEligible(quality({ latching: true }))).toBe(false);
    expect(cardQualityEligible(quality({ monotonic: true }))).toBe(false);
  });

  it("collects bound qualities across the roster and the player, and lists declared fields", () => {
    const quality: Quality = { key: "look", type: "enum", values: ["one"], source: "extractor", rubric: "" };
    const roster = [{ id: "a", name: "A", card: { fields: { look: { quality: "look" }, ghost: { quality: "gone" } } } }];
    expect([...boundCardQualities(roster, { card: { fields: { mood: { quality: "mood" } } } })].sort()).toEqual(["gone", "look", "mood"]);
    expect(declaredCardFields(roster, undefined, [quality]).map((entry) => `${entry.owner}:${entry.field}:${entry.quality.key}`)).toEqual(["a:look:look"]);
  });
});

describe("setChapters (v2.6 plan 07 D13, the wizard's chapter op)", () => {
  const chaptered = (): StoryDraft => ({
    ...base(),
    chapters: [{ id: "one", title: "One", player_title: "Part I", seal: { keep_tail: 2 } }, { id: "two", title: "Two" }],
    checkpoints: base().checkpoints.map((checkpoint) => ({ ...checkpoint, chapter: checkpoint.id === "start" ? "one" : "two" })),
  });

  it("replaces the whole list in the given order, fields and policy included, and assigns checkpoints", () => {
    const next = setChapters(chaptered(), [{ id: "three", title: "Three", final: true }, { id: "one", title: "Opening", seal: { open_threads: "close" } }], { cache: "three" });
    expect(next.chapters).toEqual([{ id: "three", title: "Three", final: true }, { id: "one", title: "Opening", seal: { open_threads: "close" } }]);
    expect(Object.keys(next.chapters?.[1] ?? {})).toEqual(["id", "title", "seal"]);
    expect(next.checkpoints.map((checkpoint) => checkpoint.chapter)).toEqual(["one", "three"]);
    expect(isValidationErrorList(parseStoryV2(next))).toBe(false);
  });

  it("an empty list removes every chapter and every checkpoint's chapter", () => {
    const next = setChapters(chaptered(), []);
    expect(next.chapters).toBeUndefined();
    expect(next.checkpoints.every((checkpoint) => !("chapter" in checkpoint))).toBe(true);
  });

  it("an empty assignment clears one checkpoint's chapter", () => {
    expect(setChapters(chaptered(), chaptered().chapters ?? [], { start: "" }).checkpoints[0].chapter).toBeUndefined();
  });
});

