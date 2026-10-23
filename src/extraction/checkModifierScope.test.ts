import { parseStoryOrThrow, type Story } from "@engine/index";
import { runDiagnostics } from "../studio/diagnostics";
import { deriveScopeExplained } from "./scope";

const raw = {
  id: "wall", title: "Wall", description: "Synthetic.", roster: [],
  qualities: [
    { key: "tried_climb", type: "bool", source: "extractor", rubric: "Has the party started climbing the wall?" },
    { key: "rope", type: "bool", source: "extractor", rubric: "Do they carry a rope?" },
    { key: "scouted", type: "bool", source: "extractor", rubric: "Have they looked over the wall?" },
    { key: "climbed", type: "bool", source: "code", rubric: "Did the climb succeed?" },
    { key: "tried_jump", type: "bool", source: "extractor", rubric: "Has the party tried to jump the gap?" },
    { key: "ladder", type: "bool", source: "extractor", rubric: "Do they have a ladder?" },
    { key: "jumped", type: "bool", source: "code", rubric: "Did the jump succeed?" },
  ],
  checkpoints: [
    {
      id: "base", name: "Base", type: "anchor", start: true, objective: "Climb.",
      checks: [{
        id: "climb", label: "Climb", quality: "climbed", roll: { sides: 20, target: 12 }, narrate: "public",
        when: { q: "tried_climb", op: "==", v: true }, hint_when: { q: "scouted", op: "==", v: true },
        modifiers: [{ q: "rope", v: true, add: 4, label: "Rope", hint: "a rope" }],
      }],
    },
    { id: "top", name: "Top", type: "anchor", objective: "Cross." },
    { id: "far", name: "Far", type: "anchor", objective: "Rest." },
  ],
  transitions: [
    { from: "base", to: "top", priority: 0, gate: { q: "climbed", op: "==", v: true } },
    {
      from: "top", to: "far", priority: 0, gate: { all: [{ q: "tried_jump", op: "==", v: true }, { q: "jumped", op: "==", v: true }] },
      check: { id: "jump", label: "Jump", quality: "jumped", roll: { sides: 20, target: 10 }, narrate: "hidden", modifiers: [{ q: "ladder", v: true, add: 5 }] },
    },
  ],
};

const story = parseStoryOrThrow(raw);
const scope = (checkpointId: string) => deriveScopeExplained(story, checkpointId, { values: {}, versions: {}, latched: {} });
const keys = (checkpointId: string) => scope(checkpointId).map((entry) => entry.key);

describe("a quality read only by a check's modifier or hint_when is read where the check is live", () => {
  test("checkpoint check: modifier and hint_when keys are in scope at its checkpoint, with their reason", () => {
    expect(keys("base")).toEqual(expect.arrayContaining(["rope", "scouted", "tried_climb"]));
    const pulls = Object.fromEntries(scope("base").map((entry) => [entry.key, entry.pulledBy.map((pull) => pull.detail)]));
    expect(pulls.rope).toEqual(["check climb modifier"]);
    expect(pulls.scouted).toEqual(["check climb hint_when"]);
  });

  test("not elsewhere: the checkpoint check's keys leave the read once the story moves on", () => {
    expect(keys("top")).not.toContain("rope");
    expect(keys("top")).not.toContain("scouted");
    expect(keys("far")).not.toContain("rope");
  });

  test("transition check: its modifier key is read only while its from checkpoint is active", () => {
    expect(keys("top")).toContain("ladder");
    expect(keys("base")).not.toContain("ladder");
    expect(keys("far")).not.toContain("ladder");
  });

  test("diagnostics: no quality-never-in-scope for modifier-only or hint_when-only qualities", () => {
    const hits = runDiagnostics(raw as unknown as Story).filter((entry) => entry.code === "quality-never-in-scope");
    expect(hits.map((entry) => entry.message)).toEqual([]);
  });
});
