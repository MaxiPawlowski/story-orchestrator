import { StoryEngine, parseStoryOrThrow, type PrimitiveValue } from "@engine/index";
import { simulateQuest } from "@engine/questSimulation";
import { composeGame } from "./widgets";
import { unreachedQuestLabels, withheldNames } from "./playerProjection";
import { deriveRefs, neutralText } from "./consequences";
import { simulateQuestText } from "@copilot/agent/readTools";
import { questMatrix, resolutionReaders } from "../studio/questMatrix";
import { runDiagnostics } from "../studio/diagnostics";
import type { Story } from "@engine/schema";

const bool = (key: string) => ({ key, type: "bool", source: "extractor", rubric: `Whether ${key} is true.` });
const is = (key: string) => ({ q: key, op: "==", v: true });

const RAW = {
  title: "Surface lab", description: "Synthetic.",
  roster: [{ id: "miller", name: "Miller" }],
  qualities: [...["asked", "taken", "freed", "fled", "violent", "back"].map(bool), { key: "coins", type: "int", source: "code", rubric: "Coins." }],
  checkpoints: [{ id: "start", name: "Start", type: "anchor", start: true, objective: "Begin." }],
  transitions: [],
  quests: [{
    id: "rescue", title: "The miller's son", kind: "side", offered_when: is("asked"), visible_when: is("taken"), steps: [{ text: "Find the boy", done_when: is("freed") }],
    resolutions: [
      { id: "freed", label: "Brought the boy home", when: is("freed"), consequences: [
        { id: "thanks", set: { coins: { add: 5 } }, label: "The miller paid in silver" },
        { id: "blood", when: is("violent"), label: "Whispers about the bloodshed", visible_when: is("back") },
      ] },
      { id: "abandoned", label: "Abandoned to the river", when: is("fled"), consequences: [{ id: "shame", label: "The village turned cold" }] },
    ],
    precedence: ["abandoned", "freed"],
  }],
  echoes: [{ id: "silver", after: { quest: "rescue", to: "freed" }, delay: { boundaries: [1, 2] }, to: "miller", cue: "The miller remembers the silver." }],
};

const story = parseStoryOrThrow(RAW);

const play = (turns: Array<Record<string, PrimitiveValue>>) => {
  const engine = new StoryEngine({ now: () => 0 });
  engine.loadStory(story);
  turns.forEach((turn, index) => {
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: Object.entries(turn).map(([q, v]) => ({ q, v, source: "extractor" as const })) });
    engine.commitBoundary({ lastMessageId: (index + 1) * 2, chatLength: (index + 1) * 2 + 1 });
  });
  return engine;
};

const playerView = (engine: StoryEngine) => JSON.stringify(composeGame({
  story, state: engine.serialize(), boundaryLog: engine.stateLog, checks: [], threads: { open: [], resolved: [] }, chat: [], castNames: { miller: "Miller" },
}).player);

const UNREACHED = ["Abandoned to the river", "The village turned cold", "abandoned"];

describe("48 player-clean: no unreached resolution reaches a player surface", () => {
  test("an open quest shows neither its endings nor a count of them", () => {
    const view = playerView(play([{ asked: true, taken: true }]));
    expect(view).toContain("The miller's son");
    [...UNREACHED, "Brought the boy home", "The miller paid in silver", "Whispers about the bloodshed"].forEach((text) => expect(view).not.toContain(text));
    expect(view).not.toMatch(/\b2 (endings|resolutions)\b/);
  });

  test("a closed quest shows its reached label and applied, visible consequences only", () => {
    const engine = play([{ asked: true, taken: true, violent: true }, { freed: true }]);
    const view = playerView(engine);
    expect(view).toContain("Brought the boy home");
    expect(view).toContain("The miller paid in silver");
    expect(view).not.toContain("Whispers about the bloodshed");
    UNREACHED.slice(0, 2).forEach((text) => expect(view).not.toContain(text));
    const after = play([{ asked: true, taken: true, violent: true }, { freed: true }, { back: true }]);
    expect(playerView(after)).toContain("Whispers about the bloodshed");
  });

  test("unreached labels are withheld from recap and Ask; the reached one is not", () => {
    const values = play([{ asked: true, taken: true }, { freed: true }]).serialize().blackboard.values;
    expect(unreachedQuestLabels(story, values)).toEqual(["Whispers about the bloodshed", "Abandoned to the river", "The village turned cold"]);
    const withheld = withheldNames(story, ["start"], "start", values);
    expect(withheld).toContain("Abandoned to the river");
    expect(withheld).not.toContain("Brought the boy home");
  });

  test("the recap line for a close uses the resolution label", () => {
    const engine = play([{ asked: true, taken: true }, { freed: true }]);
    const ref = engine.stateLog.flatMap((entry) => deriveRefs(story, entry)).find((item) => item.kind === "quest" && item.to === "freed");
    expect(ref && neutralText(story, ref)).toBe("Brought the boy home: The miller's son");
  });
});

describe("48 simulator, matrix and diagnostics", () => {
  test("simulateQuest reports the winner, the applied consequences, the writes and the player's view", () => {
    const outcome = simulateQuest(story, "rescue", { taken: true, freed: true, violent: true });
    expect(outcome).toMatchObject({ resolution: "freed", lifecycle: "active", held: false });
    expect(outcome?.consequences.map((item) => [item.id, item.applied, item.shown])).toEqual([["thanks", true, true], ["blood", true, false]]);
    expect(outcome?.writes.find((write) => write.key === "coins")).toEqual({ key: "coins", before: null, after: 5 });
    expect(outcome?.player).toEqual({ status: "Brought the boy home", outcomes: ["The miller paid in silver"] });
    expect(simulateQuest(story, "rescue", { taken: true }, true, "abandoned")?.resolution).toBe("abandoned");
    expect(simulateQuest(story, "rescue", { taken: true, freed: true, fled: true })?.resolution).toBe("abandoned");
  });

  test("the wizard's simulateQuest tool renders the same answer", () => {
    const text = simulateQuestText(RAW as unknown as Story, "rescue", { taken: true, freed: true }, undefined);
    expect(text).toContain("closes on freed");
    expect(text).toContain("consequence blood: does not apply");
    expect(simulateQuestText(RAW as unknown as Story, "ghost", {}, undefined)).toContain('No quest "ghost"');
  });

  test("the matrix lists each ending, its consequences and who reads it", () => {
    const rows = questMatrix(RAW as unknown as Story, RAW.quests[0] as never);
    expect(rows.map((row) => [row.id, row.consequences.map((item) => item.id)])).toEqual([["freed", ["thanks", "blood"]], ["abandoned", ["shame"]]]);
    expect(resolutionReaders(RAW as unknown as Story, "rescue", "freed")).toEqual(["echoes silver"]);
    expect(rows[1].readers).toEqual([]);
  });

  test("Studio warns on two quests writing one key and on a long label", () => {
    const draft = JSON.parse(JSON.stringify(RAW)) as Story & { quests: Array<Record<string, unknown>> };
    draft.qualities.push({ key: "mood", type: "enum", values: ["calm", "angry"], source: "code", rubric: "Mood." } as never);
    draft.quests.push({ id: "other", title: "Other", kind: "side", steps: [], done_when: is("back"), reward: { set: { mood: "calm" } } });
    (draft.quests[0].resolutions as unknown as Array<Record<string, unknown>>)[1].consequences = [{ id: "shame", set: { mood: "angry" }, label: "The whole village turned its back on the player" }];
    const codes = runDiagnostics(draft as Story).map((row) => row.code);
    expect(codes).toContain("consequence-write-conflict");
    expect(codes).toContain("quest-label-long");
  });
});
