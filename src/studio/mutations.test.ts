import { newStoryDraft, type StoryDraft } from "./draft";
import {
  addCheckpoint,
  addQuality,
  addTransition,
  clearStartCheckpoint,
  nextId,
  removeCheckpoint,
  removeQuality,
  setStartCheckpoint,
  setStoryField,
  setTransitionGate,
  updateQuality,
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
