import { parseStoryV2OrThrow } from "@engine/index";
import { buildNarrativeStatus, type NarrativeInput } from "./narrative";
import type { PipelineStatus } from "./pipeline";
import { playedProjection, projectionText, startProjection, transcriptWindow, type ProjectionInput } from "./playerProjection";
import { buildSuggestionPrompt } from "./suggestions";

const story = parseStoryV2OrThrow({
  format: 2, id: "gated", title: "The Ferry", description: "A crossing at night.", player_intro: "You need to cross the river before dawn.",
  qualities: [
    { key: "ferry_paid", type: "bool", source: "extractor", rubric: "Has the player paid the ferryman?" },
    { key: "traitor_known", type: "bool", source: "extractor", rubric: "Does the player know Corvin is the traitor?" },
  ],
  checkpoints: [
    { id: "dock", name: "dock-internal", player_name: "The Dock", player_text: "Fog lies on the water.", objective: "Pay the ferryman.", type: "anchor", start: true },
    { id: "crossing", name: "crossing-internal", player_name: "The Crossing", objective: "Cross the river.", type: "anchor" },
    { id: "vault", name: "vault-internal", player_name: "The Vault of Corvin", objective: "Unmask Corvin the traitor.", type: "anchor" },
  ],
  transitions: [
    { from: "dock", to: "crossing", priority: 0, gate: { q: "ferry_paid", op: "==", v: true } },
    { from: "crossing", to: "vault", priority: 0, gate: { q: "traitor_known", op: "==", v: true } },
  ],
  roster: [],
});

const pipeline = { state: "idle", text: "", needsSetup: false, nextAction: "none" } as unknown as PipelineStatus;

const narrativeAt = (overrides: Partial<NarrativeInput> = {}) => buildNarrativeStatus({
  storyTitle: "The Ferry", publicIntro: story.player_intro ?? null, checkpointName: "The Crossing", objective: null, lastTransition: { fromName: "The Dock", toName: "The Crossing" },
  openThreads: ["The ferryman wants double."], canon: "You paid the ferryman at the dock.", tensionLevel: "tense", pendingCount: 2, pipeline: { ...pipeline, text: "Reading the last reply…" }, ...overrides,
});

const chat = [
  { name: "Ferryman", is_user: false, mes: "Two coins, or swim." },
  { name: "Max", is_user: true, mes: "I pay him." },
  { name: "System", is_system: true, mes: "[a note only the machine sees]" },
  { name: "Ferryman", is_user: false, mes: "The boat pushes off into the fog." },
];

const input = (overrides: Partial<ProjectionInput> = {}): ProjectionInput => ({
  story, narrative: narrativeAt(), visitedPath: ["dock"], activeCheckpointId: "crossing", cast: ["Ferryman", " Ferryman ", "Narrator"], chat, playerName: "Max", ...overrides,
});

const UNREACHED = ["The Vault of Corvin", "vault-internal", "Unmask Corvin", "Corvin"];
const MACHINERY = ["ferry_paid", "traitor_known", "dock-internal", "crossing-internal", "Reading the last reply", "take effect on the next turn", "gate", "priority"];

describe("v2.7 33 W4: the player projection", () => {
  it("names the reached scenes by their player names, the current scene's player copy, the cast once each, and the player", () => {
    const projection = playedProjection(input());
    expect(projection.visited).toEqual(["The Dock", "The Crossing"]);
    expect(projection.current).toEqual({ name: "The Crossing", text: null });
    expect(projection.cast).toEqual(["Ferryman", "Narrator"]);
    expect(projection.player).toBe("Max");
    expect(projection.intro).toBe("You need to cross the river before dawn.");
    expect(projection.sections.map((section) => section.id)).toEqual(["now", "about", "recently", "threads", "story"]);
  });

  it("spoiler property: nothing about an unreached scene, no quality key, no internal name, no machine status reaches it or the request", () => {
    const projection = playedProjection(input());
    const text = `${JSON.stringify(projection)}\n${buildSuggestionPrompt(projection)}`;
    expect(UNREACHED.filter((needle) => text.includes(needle))).toEqual([]);
    expect(MACHINERY.filter((needle) => text.includes(needle))).toEqual([]);
  });

  it("control: the same check finds an unreached name once that scene is reached", () => {
    const reached = playedProjection(input({ visitedPath: ["dock", "crossing"], activeCheckpointId: "vault" }));
    expect(JSON.stringify(reached)).toContain("The Vault of Corvin");
  });

  it("the transcript window keeps the last visible messages, never system notes, clipped", () => {
    expect(transcriptWindow(chat)).toEqual([
      { speaker: "Ferryman", text: "Two coins, or swim." },
      { speaker: "Max", text: "I pay him." },
      { speaker: "Ferryman", text: "The boat pushes off into the fog." },
    ]);
    expect(transcriptWindow(chat, 1)).toEqual([{ speaker: "Ferryman", text: "The boat pushes off into the fog." }]);
    expect(transcriptWindow([{ name: "A", mes: "x".repeat(700) }])[0].text).toHaveLength(601);
  });

  it("reads only its declared inputs: none of them can carry a memory row, a held secret or lore text", () => {
    expect(Object.keys(input()).sort()).toEqual(["activeCheckpointId", "cast", "chat", "narrative", "playerName", "story", "visitedPath"]);
    expect(projectionText(playedProjection(input()))).not.toMatch(/hiding|unaware|concealing|You know:/);
  });

  it("control: a change in what the player sees does change it", () => {
    expect(playedProjection(input({ narrative: narrativeAt({ openThreads: ["A new thread."] }) }))).not.toEqual(playedProjection(input()));
  });

  it("the start projection holds the title, intro, start scene and cast, nothing else", () => {
    expect(startProjection(story, "Max", ["Ferryman"])).toEqual({
      title: "The Ferry", intro: "You need to cross the river before dawn.", player: "Max", start: { name: "The Dock", text: "Fog lies on the water." }, cast: ["Ferryman"],
    });
  });
});
