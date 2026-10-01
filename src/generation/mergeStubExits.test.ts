import { StoryEngine, type GateNode } from "@engine/index";
import { mergeExpansions, shortCheckpointName } from "./merge";
import { parseGeneratedBeats } from "./parse";
import { parseStoryV2OrThrow } from "@engine/index";
import type { ExpansionCacheEntry, GeneratedBeat } from "./types";

const ROAD_OBJECTIVE = "Travel the north road toward Wendhope and let the party notice what the road is missing: no ore wagons, no peddlers, no patrols, no smoke on the horizon.";
const WALLS_OBJECTIVE = "Reach the walls of Wendhope before sundown and find the gate shut, barred, and guarded by frightened villagers who refuse entry to strangers as night falls.";

const raw = () => ({
  format: 2,
  id: "road",
  title: "Road",
  description: "",
  qualities: [
    { key: "first_camp", type: "bool", source: "extractor", rubric: "Camped?" },
    { key: "reached_walls", type: "bool", source: "extractor", rubric: "At the walls?" },
    { key: "road_noticed", type: "bool", source: "extractor", rubric: "Noticed the empty road?" },
    { key: "gate_seen", type: "bool", source: "extractor", rubric: "Saw the gate?" },
  ],
  checkpoints: [
    { id: "road-to-wendhope", name: "The Road North", objective: "Travel to Wendhope.", type: "anchor", start: true },
    { id: "on-the-road", name: "On the Road", objective: "Two days north.", type: "intermediate" },
    { id: "at-the-walls", name: "Hold, Wendhope Is Closed", objective: "Get inside Wendhope before sundown.", type: "anchor" },
  ],
  transitions: [
    { from: "road-to-wendhope", to: "at-the-walls", priority: 2, gate: { q: "reached_walls", op: "==", v: true } },
    { from: "road-to-wendhope", to: "on-the-road", priority: 1, gate: { q: "first_camp", op: "==", v: true } },
    { from: "on-the-road", to: "at-the-walls", priority: 2, gate: { q: "progress_toward_at-the-walls", op: ">=", v: 1 } },
    { from: "on-the-road", to: "at-the-walls", priority: 1, gate: { q: "reached_walls", op: "==", v: true } },
  ],
  roster: [],
});

const outcome = (label: string, gate: GateNode, progress?: number) => ({ id: `${label}:0`, label, gate, ...(progress ? { progress: { anchor: "at-the-walls", amount: progress } } : {}) });

const beats = (titles: Array<string | undefined> = [undefined, undefined]): GeneratedBeat[] => [
  { id: "0", objective: ROAD_OBJECTIVE, guidance: "Quiet road.", tension_target: "stirring", outcomes: [outcome("noticed", { q: "road_noticed", op: "==", v: true }, 1)], ...(titles[0] ? { title: titles[0] } : {}) },
  { id: "1", objective: WALLS_OBJECTIVE, guidance: "The gate is shut.", tension_target: "tense", outcomes: [outcome("gate", { q: "gate_seen", op: "==", v: true })], ...(titles[1] ? { title: titles[1] } : {}) },
];

const entry = (chain: GeneratedBeat[]) => ({
  "road-to-wendhope->on-the-road->at-the-walls": {
    status: "inserted", sourceCheckpointId: "road-to-wendhope", stubId: "on-the-road", targetAnchorId: "at-the-walls", beats: chain,
  } as Partial<ExpansionCacheEntry> as ExpansionCacheEntry,
});

const write = (engine: StoryEngine, q: string, v: boolean) => {
  engine.enqueue({ source: "extractor", blackboardVersionSum: 0, turnRange: { from: 1, to: 1 }, deltas: [{ q, v, source: "extractor" }] });
  return engine.commitBoundary();
};

describe("T0-1: a generated chain keeps the stub's authored exits (v2.6 plan 14)", () => {
  it("every generated beat carries the stub's own exit to the anchor, ahead of its outcomes", () => {
    const merged = mergeExpansions(raw(), entry(beats()));
    ["gen_on-the-road_1", "gen_on-the-road_2"].forEach((id) => {
      const [first] = merged.outgoingByCheckpoint[id] ?? [];
      expect(first?.to).toBe("at-the-walls");
      expect(first?.gate).toEqual({ q: "reached_walls", op: "==", v: true });
    });
  });

  it("the stub's progress exit is not copied: the chain's own final beat already carries it", () => {
    const merged = mergeExpansions(raw(), entry(beats()));
    const fromBeats = ["gen_on-the-road_1", "gen_on-the-road_2"].flatMap((id) => merged.outgoingByCheckpoint[id] ?? []);
    const progressOnly = fromBeats.filter((transition) => JSON.stringify(transition.gate) === JSON.stringify({ q: "progress_toward_at-the-walls", op: ">=", v: 1 }));
    expect(progressOnly).toEqual([]);
  });

  it("a chat already at the walls inside the chain reaches the anchor at the next boundary, not one beat per boundary", () => {
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(mergeExpansions(raw(), entry(beats())));
    write(engine, "first_camp", true);
    expect(engine.serialize().activeCheckpointId).toBe("gen_on-the-road_1");
    write(engine, "reached_walls", true);
    expect(engine.serialize().activeCheckpointId).toBe("at-the-walls");
  });

  it("the chain still plays beat by beat when the exit does not hold", () => {
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(mergeExpansions(raw(), entry(beats())));
    write(engine, "first_camp", true);
    write(engine, "road_noticed", true);
    expect(engine.serialize().activeCheckpointId).toBe("gen_on-the-road_2");
    write(engine, "gate_seen", true);
    expect(engine.serialize().activeCheckpointId).toBe("at-the-walls");
  });
});

describe("T0-1: a generated checkpoint is named, not titled with its whole objective (v2.6 plan 14)", () => {
  it("takes the generator's title when it gave one", () => {
    const merged = mergeExpansions(raw(), entry(beats(["The Empty Road", "Shut Gate"])));
    expect(merged.checkpointById["gen_on-the-road_1"].name).toBe("The Empty Road");
    expect(merged.checkpointById["gen_on-the-road_2"].name).toBe("Shut Gate");
    expect(merged.checkpointById["gen_on-the-road_1"].objective).toBe(ROAD_OBJECTIVE);
    expect(merged.checkpointById["gen_on-the-road_1"].player_name).toBe("The Empty Road");
    expect(mergeExpansions(raw(), entry(beats())).checkpointById["gen_on-the-road_1"].player_name).toBeUndefined();
  });

  it("derives a short name from the objective when it did not", () => {
    const merged = mergeExpansions(raw(), entry(beats()));
    const names = ["gen_on-the-road_1", "gen_on-the-road_2"].map((id) => merged.checkpointById[id].name);
    names.forEach((name, index) => {
      expect(name).not.toBe(index ? WALLS_OBJECTIVE : ROAD_OBJECTIVE);
      expect(name.split(/\s+/).length).toBeLessThanOrEqual(8);
    });
    expect(names[0]).toBe("Travel the north road toward Wendhope");
  });

  it("shortCheckpointName keeps a short objective whole and cuts a long one at its first clause", () => {
    expect(shortCheckpointName("Hold the wall until dawn.")).toBe("Hold the wall until dawn");
    expect(shortCheckpointName(WALLS_OBJECTIVE)).toBe("Reach the walls of Wendhope before sundown");
    expect(shortCheckpointName("Search every cellar, attic, barn, shed, well, chapel, mill and stable in the whole village")).toBe("Search every cellar");
    expect(shortCheckpointName("One two three four five six seven eight nine ten eleven")).toBe("One two three four five six seven eight…");
  });

  it("parses an optional beat title and ignores a non-text one", () => {
    const story = parseStoryV2OrThrow(raw());
    const reply = (title: unknown) => JSON.stringify({ beats: [{ title, objective: "Reach the gate.", guidance: "Shut.", tension_target: "tense", outcomes: [{ label: "gate", gate: { q: "gate_seen", op: "==", v: true } }] }] });
    expect(parseGeneratedBeats(reply("  The Gate  "), story).beats[0].title).toBe("The Gate");
    expect(parseGeneratedBeats(reply(7), story).beats[0].title).toBeUndefined();
    expect(parseGeneratedBeats(reply(""), story).beats[0].title).toBeUndefined();
  });
});
