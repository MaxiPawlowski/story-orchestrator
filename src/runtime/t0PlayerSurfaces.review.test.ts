import { readFileSync } from "fs";
import { join } from "path";
import { parseStoryV2OrThrow, type NormalizedStoryV2 } from "@engine/index";
import { playerThreadTexts, type ArcEntry } from "@memory/index";
import { buildAwayRecap } from "./awayRecap";
import { buildNarrativeStatus, excerpt, playerLocation, rollbackNoticeText, transitionNoteText, type NarrativeInput } from "./narrative";
import { derivePipelineStatus } from "./pipeline";
import { sanitizeGlobalSettings } from "./settingsModel";
import type { ExtractionRuntimeState } from "./types";

const recordedT022 = () => JSON.parse(readFileSync(join(__dirname, "../../test/fixtures/t0-2-2-player-threads.json"), "utf8")) as
  { activeCheckpointId: string; extraction: ExtractionRuntimeState; memory: { arcs: ArcEntry[] } };

const ADOLION_LOCATIONS = ["aegis_guild_hall", "north_road", "wendhope_gate", "wendhope_wall", "wendhope", "needlehaven", "needlehaven_heart", "driftmere", "upper_mines", "deep_mines", "the_seals", "behind_the_seals", "eltaronal"];

const adolion = (labels?: Record<string, string>): NormalizedStoryV2 => parseStoryV2OrThrow({
  format: 2, id: "t0-adolion", title: "Adventurer's Road", description: "T0 fixture",
  qualities: [{ key: "location", type: "enum", values: ADOLION_LOCATIONS, source: "extractor", rubric: "Where is the party?", ...(labels ? { player_labels: labels } : {}) }],
  checkpoints: [{ id: "guild-hall", name: "The Guild Hall", player_name: "The Adventurer's Guild, Aegis City", objective: "Take a job.", type: "anchor", start: true }],
  transitions: [],
  roster: [],
});

const idle = derivePipelineStatus({ settings: { enabled: true, profileId: "p", cadence: 3, stabilityLag: 0 }, audits: [], reconciliationEvents: [], lastReadBoundary: 0, scheduler: { queueDepth: 0, inFlight: false, lastError: null } } as Partial<ExtractionRuntimeState> as ExtractionRuntimeState);

const narrative = (overrides: Partial<NarrativeInput>) => buildNarrativeStatus({
  storyTitle: "Adventurer's Road", checkpointName: "The Adventurer's Guild, Aegis City", objective: null, lastTransition: null, openThreads: [], canon: "",
  tensionLevel: null, pendingCount: 0, pipeline: idle, ...overrides,
});

const RAW_TOKEN = /\b[a-z0-9]+(?:_[a-z0-9]+)+\b/;

describe("T0 finding 1: Where you are never prints a raw location value", () => {
  it.each(ADOLION_LOCATIONS)("an undeclared label is left out (%s)", (value) => {
    const text = narrative({ sceneLocation: playerLocation(adolion(), value) }).text;
    expect(text).not.toContain(value);
    expect(text).not.toMatch(RAW_TOKEN);
  });

  it("a declared player label is shown instead of the value", () => {
    const story = adolion({ aegis_guild_hall: "the Adventurer's Guild", north_road: "the road north" });
    expect(narrative({ sceneLocation: playerLocation(story, "north_road") }).text).toContain("At the road north.");
    expect(playerLocation(story, "wendhope")).toBeNull();
  });

  it("a prose location the story did not enumerate is kept", () => {
    expect(playerLocation(adolion(), "The Red Fog Inn")).toBe("The Red Fog Inn");
    expect(playerLocation(null, "north_road")).toBeNull();
  });

  it("a label for a value the enum does not declare is refused at import", () => {
    expect(() => adolion({ nowhere: "Nowhere" })).toThrow(/player_labels/);
  });

  it("control: the raw value really is what the tracker hands the narrative", () => {
    expect(narrative({ sceneLocation: "aegis_guild_hall" }).text).toMatch(RAW_TOKEN);
  });
});

describe("T0 finding 2: open threads are deduped and scoped to the scene in play (recorded T0-2-2)", () => {
  const arcs = recordedT022().memory.arcs;

  it("drops near-duplicates and threads from earlier checkpoints, newest wording kept", () => {
    const threads = playerThreadTexts(arcs, 36);
    expect(threads.length).toBeLessThanOrEqual(5);
    expect(threads.filter((text) => /red fog and the Screechers/.test(text))).toHaveLength(1);
    expect(threads.every((text) => (arcs.find((arc) => arc.text === text)?.openedAt ?? -1) >= 36)).toBe(true);
    expect(threads.at(-1)).toMatch(/survives their first night/);
  });

  it("keeps a pinned thread from an earlier scene, and never a resolved one", () => {
    const pinned = arcs.map((arc) => (arc.text.startsWith("Tobias's warning that Wendhope") ? { ...arc, pinned: true } : arc));
    expect(playerThreadTexts(pinned, 36)[0]).toMatch(/^Tobias's warning that Wendhope/);
    expect(playerThreadTexts(arcs, 0).some((text) => arcs.find((arc) => arc.text === text)?.status !== "open")).toBe(false);
  });

  it("control: the recorded state really carried eight duplicated or stale threads", () => {
    expect(arcs.filter((arc) => arc.status === "open").length).toBeGreaterThan(30);
  });
});

describe("T0 finding 3: the story so far is cut at a sentence, and the recap is the short view", () => {
  const canon = "Max Nightriver signed the register three days earlier. Dalan joined the party. Belle carried an axe named Cleaver, and she intended to fight on the front line, since the Guild would not send a party of one into a village that had gone silent for a week.";

  it("an excerpt ends at a sentence boundary inside the budget", () => {
    expect(excerpt(canon, 120)).toBe("Max Nightriver signed the register three days earlier. Dalan joined the party.");
    expect(excerpt(canon, 1000)).toBe(canon);
  });

  it("falls back to a word boundary when no sentence fits", () => {
    const cut = excerpt("one two three four five six seven eight nine ten", 20);
    expect(cut).toBe("one two three four…");
  });

  it("the away recap leaves out the intro and the pending count", () => {
    const status = narrative({ publicIntro: "You have just signed on.", pendingCount: 3, canon, openThreads: ["Who watches from the window?"] });
    const recap = buildAwayRecap(status, 24 * 3600 * 1000);
    const labels = recap.lines.map((line) => line.split("\n")[0]);
    expect(labels).not.toContain("About this story");
    expect(labels).not.toContain("Noted");
    expect(labels).toContain("Open threads");
  });
});

describe("T0 finding 4: catching up does not outlive the stall it was about (recorded T0-2-2)", () => {
  const recorded = recordedT022();

  it("a stall left open at a checkpoint the story has left is not shown", () => {
    expect(recorded.extraction.reconciliationEvents.some((event) => event.resolvedAt === null && event.checkpointId !== recorded.activeCheckpointId)).toBe(true);
    expect(derivePipelineStatus(recorded.extraction, undefined, null, false, { id: recorded.activeCheckpointId }).state).toBe("idle");
  });

  it("control: an open stall at the active checkpoint still reads as catching up", () => {
    expect(derivePipelineStatus(recorded.extraction, undefined, null, false, { id: "road-to-wendhope" }).state).toBe("stalled-rechecking");
  });
});

describe("T0 finding 5: the step-back notice names the change that caused it", () => {
  it.each([
    ["edit", "to match your edit"],
    ["delete", "to match the deleted message"],
    ["swipe", "to match the swiped reply"],
  ] as const)("%s", (kind, words) => {
    expect(rollbackNoticeText({ playerName: "The Guild Hall", kind })).toBe(`The story stepped back to The Guild Hall ${words}.`);
  });

  it("an unknown change is not called an edit", () => {
    expect(rollbackNoticeText({ playerName: null })).not.toContain("edit");
  });
});

describe("T0 finding 6: a transition note prints each thing once, in player words", () => {
  it("a generated step whose name is its objective is printed once", () => {
    const objective = "Travel the north road and let the party notice the empty fields.";
    expect(transitionNoteText({ name: objective, objective })).toBe(`◈ ${objective}`);
  });

  it("uses the player name and player text, never the author objective", () => {
    expect(transitionNoteText({ name: "The Road North", objective: "Let the party notice the carriage.", player_name: "The Road North", player_text: "Wendhope lies two days north." }))
      .toBe("◈ The Road North — Wendhope lies two days north.");
    expect(transitionNoteText({ name: "CP2 - Author Name", objective: "secret author note" })).toBe("◈ CP2 - Author Name");
  });
});

describe("T0 finding 6: the chat note is opt-in (W11 decided by the T0 sessions)", () => {
  it("a fresh install does not post transition notes, and a stored choice is kept", () => {
    expect(sanitizeGlobalSettings({}).display.announceTransitions).toBe(false);
    expect(sanitizeGlobalSettings({ display: { announceTransitions: true } }).display.announceTransitions).toBe(true);
  });
});
