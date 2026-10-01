import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ApplyQueueEntry, EngineState } from "@engine/index";
import { maxTokensForInput } from "@extraction/callBudget";
import { buildCanonSummaryPrompt, playerThreadSince, playerThreadTexts, type ArcEntry } from "@memory/index";
import { playerPendingCount } from "./pipeline";
import { buildPendingDeltas } from "./snapshot";

interface T1Session {
  engine: { boundary: number; checkpointStartedBoundary: number };
  transitions: Array<{ to: string; boundary: number }>;
  canonRequest: { promptChars: number; maxTokens: number; outputTokens: number };
  arcs: ArcEntry[];
}

const session = JSON.parse(readFileSync(join(__dirname, "../../test/fixtures/t1-1-session.json"), "utf8")) as T1Session;
const arcsAt = (boundary: number) => session.arcs
  .filter((arc) => arc.openedAt <= boundary)
  .map((arc) => (arc.resolvedAt !== undefined && arc.resolvedAt > boundary ? { ...arc, status: "open" as const } : arc));

describe("T1-1 finding 3: the story so far and the open threads keep up with play (recorded T1-1-1)", () => {
  it("the canon reply budget leaves room past the length the recorded request was cut at", () => {
    const { promptChars, maxTokens, outputTokens } = session.canonRequest;
    expect(outputTokens).toBe(maxTokens);
    expect(maxTokensForInput("canon", "x".repeat(promptChars))).toBeGreaterThanOrEqual(Math.ceil(outputTokens * 1.5));
  });

  it("the canon prompt bounds its own length", () => {
    expect(buildCanonSummaryPrompt("Adventurer's Road", ["They reached the walls."], ["The gate is shut."])).toMatch(/at most \d+ words/);
  });

  it("right after a transition the threads still live from the scene before stay listed", () => {
    const into = session.transitions.find((entry) => entry.to === "into-needlehaven")!.boundary;
    const arcs = arcsAt(into - 1);
    expect(playerThreadTexts(arcs, into)).toEqual([]);
    const threads = playerThreadTexts(arcs, playerThreadSince(into, into));
    expect(threads.length).toBeGreaterThanOrEqual(3);
    expect(threads.length).toBeLessThanOrEqual(5);
    expect(threads.some((text) => /mine|tunnel/i.test(text))).toBe(true);
  });

  it("control: a thread opened long before the scene and never resolved does not come back", () => {
    const into = session.transitions.find((entry) => entry.to === "into-needlehaven")!.boundary;
    const threads = playerThreadTexts(arcsAt(into), playerThreadSince(into, into));
    const opened = (text: string) => session.arcs.find((arc) => arc.text === text)!.openedAt;
    expect(threads.every((text) => opened(text) >= playerThreadSince(into, into))).toBe(true);
    expect(threads.some((text) => /posting and form a party/.test(text))).toBe(false);
  });

  it("deep inside a long scene the scene's own start is the floor", () => {
    expect(playerThreadSince(31, 49)).toBe(31);
    expect(playerThreadSince(49, 49)).toBeLessThan(49);
    expect(playerThreadSince(2, 3)).toBe(0);
  });
});

describe("T1-1 finding 4: readings of the opening are not shown to the player as updates", () => {
  const state = { blackboard: { values: {}, versions: {}, latched: {} } } as unknown as EngineState;
  const opening: ApplyQueueEntry = {
    source: "extractor", blackboardVersionSum: 0, turnRange: { from: 0, to: 0 },
    deltas: [{ q: "adv_looking_for_hands", v: false }, { q: "guild_reputation", v: 0 }, { q: "location", v: "aegis_guild_hall" }, { q: "party_injuries", v: 0 }, { q: "tension_current", v: 0.25 }],
  };

  it("before the player's first line the five greeting readings count zero for the player", () => {
    const pending = buildPendingDeltas([opening], state, []);
    expect(pending).toHaveLength(5);
    expect(playerPendingCount(pending)).toBe(0);
  });

  it("a reading over the player's own turn counts, and so does a later rewrite of an opening value", () => {
    const turn: ApplyQueueEntry = { source: "extractor", blackboardVersionSum: 0, turnRange: { from: 0, to: 2 }, deltas: [{ q: "location", v: "north_road" }, { q: "party_name", v: "Grey Pennants" }] };
    const pending = buildPendingDeltas([opening, turn], state, [1]);
    expect(pending).toHaveLength(6);
    expect(playerPendingCount(pending)).toBe(2);
  });
});
