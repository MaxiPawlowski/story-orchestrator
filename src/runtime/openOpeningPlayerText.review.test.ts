import { parseStoryV2OrThrow, type BoundaryLogEntry, type EngineState, type NormalizedStoryV2 } from "@engine/index";
import { composeInlineTimeline, type InlineSources } from "./inlineTimeline";
import { buildNarrativeStatus, transitionNoteText } from "./narrative";
import { playedProjection, startProjection } from "./playerProjection";
import { defaultInlineSettings } from "./settingsModel";
import { playerTurnsInCheckpoint, shownPlayerText } from "./stretchTurns";

const OBJECTIVE = "Persuade the harbour master to open the gate.";
const PUBLIC = "Gulls wheel over a long queue at the customs shed.";

const story = (opening: boolean): NormalizedStoryV2 => parseStoryV2OrThrow({
  format: 2, id: "opening-text", title: "Opening text", description: "", roster: [],
  qualities: [{ key: "arrived", type: "bool", source: "extractor", rubric: "Has the party reached the harbour?" }, { key: "gate_open", type: "bool", source: "extractor", rubric: "Is the gate open?" }],
  checkpoints: [
    { id: "dock", name: "The dock", objective: "Land.", type: "anchor", start: true },
    { id: "harbour", name: "harbour-internal", player_name: "The Harbour", player_text: PUBLIC, objective: OBJECTIVE, type: "anchor", ...(opening ? { stretch: { mode: "open", pace: "brief" } } : {}) },
    { id: "town", name: "The town", objective: "Find a bed.", type: "anchor" },
  ],
  transitions: [
    { from: "dock", to: "harbour", priority: 1, gate: { q: "arrived", op: "==", v: true } },
    { from: "harbour", to: "town", priority: 1, gate: { q: "gate_open", op: "==", v: true } },
  ],
});

const OPENING = story(true);
const PLAIN = story(false);
const harbour = OPENING.checkpointById.harbour;

const chatOf = (turns: number): Array<{ is_user: boolean; mes: string }> =>
  Array.from({ length: turns }, (_, index) => [{ is_user: true, mes: `Line ${index}.` }, { is_user: false, mes: "A reply." }, { is_user: false, mes: "Another." }]).flat();

const stateAt = (chat: unknown[]): EngineState => ({
  blackboard: { values: {}, versions: {}, latched: {} }, activeCheckpointId: "harbour", visitedAnchors: ["dock", "harbour"], visitedPath: ["dock", "harbour"],
  boundary: chat.length, checkpointStartedBoundary: 0, checkpointStartedAt: 0, checkpointStartedMessageId: -1, lastMessageId: chat.length - 1, chatLength: chat.length,
}) as unknown as EngineState;

describe("v2.8 19 correction: an anchor's authored player_text is hidden while its opening lasts, and returns", () => {
  it("shownPlayerText hides it for turns 0 to 2 of a three-turn opening and shows it from turn 3, counting rounds as one turn", () => {
    const shown = (turns: number) => shownPlayerText(harbour, stateAt(chatOf(turns)), chatOf(turns));
    expect([0, 1, 2].map(shown)).toEqual([null, null, null]);
    expect(shown(3)).toBe(PUBLIC);
    expect(shown(8)).toBe(PUBLIC);
    expect(playerTurnsInCheckpoint(stateAt(chatOf(2)), chatOf(2))).toBe(2);
  });

  it("control: an anchor without an opening shows it from the first turn, and a missing text stays null", () => {
    expect(shownPlayerText(PLAIN.checkpointById.harbour, stateAt(chatOf(0)), chatOf(0))).toBe(PUBLIC);
    expect(shownPlayerText(PLAIN.checkpointById.dock, stateAt(chatOf(1)), chatOf(1))).toBeNull();
    expect(shownPlayerText(undefined, null, [])).toBeNull();
  });

  it("the player's Where-you-are note carries the public text only once the opening is over", () => {
    const now = (turns: number) => buildNarrativeStatus({
      storyTitle: "T", checkpointName: "The Harbour", objective: shownPlayerText(harbour, stateAt(chatOf(turns)), chatOf(turns)), lastTransition: null, openThreads: [], canon: "", tensionLevel: null, pendingCount: 0,
      pipeline: { state: "idle", text: "", needsSetup: false, nextAction: "none" } as never,
    }).text;
    expect(now(1)).not.toContain(PUBLIC);
    expect(now(2)).not.toContain(PUBLIC);
    expect(now(3)).toContain(PUBLIC);
  });

  it("the player projection that Ask and suggestions read hides it for the opening and shows it after, and the start projection hides it at turn 0", () => {
    const projection = (turns: number) => playedProjection({
      story: OPENING, narrative: { title: "T", sections: [], text: "" }, visitedPath: ["dock"], activeCheckpointId: "harbour", cast: [], chat: [], playerName: "Max", playerTurns: turns,
    });
    expect(projection(1).current).toEqual({ name: "The Harbour", text: null });
    expect(projection(2).current).toEqual({ name: "The Harbour", text: null });
    expect(projection(3).current).toEqual({ name: "The Harbour", text: PUBLIC });
    expect(JSON.stringify(projection(1))).not.toContain(OBJECTIVE);
    const started = parseStoryV2OrThrow({ ...JSON.parse(JSON.stringify({ format: 2, id: "s", title: "S", description: "", roster: [], qualities: [], transitions: [] })),
      checkpoints: [{ id: "harbour", name: "x", player_name: "The Harbour", player_text: PUBLIC, objective: OBJECTIVE, type: "anchor", start: true, stretch: { mode: "open", pace: "brief" } }] });
    expect(startProjection(started, "Max", []).start).toEqual({ name: "The Harbour", text: null });
    expect(startProjection(PLAIN, "Max", []).start).toEqual({ name: "Current scene", text: null });
  });

  it("the entry note and the inline progress chip name the place but hold the opening's public text back; a plain anchor keeps it", () => {
    expect(transitionNoteText(harbour)).toBe("◈ The Harbour");
    expect(transitionNoteText(PLAIN.checkpointById.harbour)).toBe(`◈ The Harbour — ${PUBLIC}`);
    const entry = (loaded: NormalizedStoryV2): BoundaryLogEntry => ({
      at: 0, boundary: 1, before: stateAt([]), after: stateAt(chatOf(1)), fired: loaded.outgoingByCheckpoint.dock[0], source: "gate",
      context: { lastMessageId: 2, chatLength: 3 }, queue: { applied: [], discarded: [] }, evaluated: null,
    }) as unknown as BoundaryLogEntry;
    const chip = (loaded: NormalizedStoryV2) => {
      const view = composeInlineTimeline({
        story: loaded, settings: { ...defaultInlineSettings(), level: 1 }, authorView: false, chatLength: 3, boundaryLog: [entry(loaded)], audits: [], pending: [], reconciliation: [],
        memory: { entries: [], arcs: [], derived: [], conflicts: [], verifyDrops: [] }, loreFired: [], talkDecisions: [], judgeCalls: [], proposals: [], curatorPass: null, effects: [],
        tensionHistory: [], tension: { expected: null, hint: null }, payloadCaptures: [], pipeline: { state: "idle", text: "", needsSetup: false, nextAction: null } as never,
        agencyRecovery: false, lastRollback: null, saveNotice: null, firstLines: {},
      } as unknown as InlineSources);
      return Object.values(view.byMessage).flat().map((item) => item.text).join("\n");
    };
    expect(chip(OPENING)).toContain("The Harbour");
    expect(chip(OPENING)).not.toContain(PUBLIC);
    expect(chip(PLAIN)).toContain(PUBLIC);
  });
});
