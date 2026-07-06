import type { StoryDraft } from "./draft";
import { findQualityUsages, reservedQualityKeys } from "./qualityUsage";

const draft = (): StoryDraft => ({
  format: 2,
  title: "T",
  description: "",
  qualities: [
    { key: "trust", type: "int", source: "extractor", rubric: "r" },
    { key: "route", type: "enum", values: ["stealth", "force"], source: "extractor", rubric: "r" },
    { key: "unused", type: "bool", source: "extractor", rubric: "r" },
  ],
  checkpoints: [
    { id: "start", name: "Start", objective: "", type: "intermediate", start: true, state_snapshot: { route: "stealth" } },
    { id: "cache", name: "Cache", objective: "", type: "anchor" },
  ],
  transitions: [
    { from: "start", to: "cache", priority: 0, gate: { all: [{ q: "trust", op: ">=", v: 2 }, { not: { q: "route", op: "==", v: "force" } }] } },
  ],
  roster: [],
});

describe("reservedQualityKeys", () => {
  it("includes tension_current and one progress key per anchor", () => {
    const keys = reservedQualityKeys(draft());
    expect(keys.has("tension_current")).toBe(true);
    expect(keys.has("progress_toward_cache")).toBe(true);
    expect(keys.has("progress_toward_start")).toBe(false);
  });
});

describe("findQualityUsages", () => {
  it("reports gate usages", () => {
    const usages = findQualityUsages(draft(), "trust");
    expect(usages).toHaveLength(1);
    expect(usages[0].kind).toBe("gate");
  });
  it("reports nested-gate and snapshot usages", () => {
    const usages = findQualityUsages(draft(), "route");
    expect(usages.map((entry) => entry.kind).sort()).toEqual(["gate", "snapshot"]);
  });
  it("returns empty for unused qualities", () => {
    expect(findQualityUsages(draft(), "unused")).toHaveLength(0);
  });
});
