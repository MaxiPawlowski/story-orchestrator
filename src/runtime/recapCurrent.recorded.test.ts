import * as recorded from "../../test/fixtures/t2-4-recap.recorded.json";
import { playerThreadSince, playerThreadTexts, type ArcEntry, type MemoryEntry } from "@memory/index";
import { AwayRecapController } from "./awayRecap";
import { buildNarrativeStatus, type NarrativeStatus } from "./narrative";
import { currentThreads, latestScene } from "./recapCurrent";
import { derivePipelineStatus } from "./pipeline";
import type { ExtractionRuntimeState } from "./types";

const arcs = recorded.arcs as unknown as ArcEntry[];
const scenes = recorded.scenes as unknown as MemoryEntry[];
const { boundary, lastMessageId, checkpointStartedBoundary } = recorded.state;
const popupThreads = () => recorded.popup.split("\nOpen threads\n")[1].split("\nThe story so far\n")[0].split("\n");

const pipeline = derivePipelineStatus({
  settings: { enabled: true, profileId: "p1", cadence: 3, reconciliationMultiplier: 1.5, stabilityLag: 0 },
  audits: [], reconciliationEvents: [], lastReadBoundary: 0, scheduler: { queueDepth: 0, inFlight: false, lastError: null },
} as Partial<ExtractionRuntimeState> as ExtractionRuntimeState);

const compose = (canon = "Max registered a new party at the Guild.") => buildNarrativeStatus({
  storyTitle: "Adolion: The Adventurer's Road",
  checkpointName: recorded.checkpoint.player_name,
  objective: recorded.checkpoint.player_text,
  lastTransition: recorded.lastTransition,
  latestScene: latestScene(scenes, lastMessageId, checkpointStartedBoundary),
  openThreads: currentThreads(arcs, checkpointStartedBoundary, boundary),
  canon,
  tensionLevel: "critical",
  pendingCount: 0,
  pipeline,
});
const section = (status: NarrativeStatus, id: string) => status.sections.find((entry) => entry.id === id)?.lines ?? [];

describe("T2-4: the away recap describes where the player is now (recap-popup.json)", () => {
  it("control: the recorded state reproduces the popup's five threads under the old window", () => {
    expect(playerThreadTexts(arcs, playerThreadSince(checkpointStartedBoundary, boundary))).toEqual(popupThreads());
  });

  it("'Recently' carries the last scene the player played, after the move", () => {
    const recently = section(compose(), "recently");
    expect(recently[0]).toBe("You left What Wendhope Knows behind and moved into Into Needlehaven.");
    expect(recently[1]).toMatch(/dragged Duggy from the tunnel/);
    expect(recently[1]).toMatch(/first wave of Screechers/);
  });

  it("'Where you are' drops the checkpoint's arrival text once a later scene describes the place", () => {
    const now = section(compose(), "now");
    expect(now).toContain("Into Needlehaven");
    expect(now.join(" ")).not.toMatch(/daylight is the only cover/);
    expect(latestScene(scenes, lastMessageId, checkpointStartedBoundary)?.sinceEntry).toBe(true);
  });

  it("control: arrival text stays while no scene was summarised since the checkpoint began", () => {
    const status = buildNarrativeStatus({ ...{ storyTitle: null, lastTransition: null, openThreads: [], canon: "", tensionLevel: null, pendingCount: 0, pipeline },
      checkpointName: "Into Needlehaven", objective: recorded.checkpoint.player_text, latestScene: latestScene(scenes, lastMessageId, 60) });
    expect(section(status, "now")).toContain(recorded.checkpoint.player_text);
  });

  it("open threads are this checkpoint's: the tunnel the party left is no longer one", () => {
    const threads = currentThreads(arcs, checkpointStartedBoundary, boundary);
    expect(threads.join("\n")).not.toMatch(/scraping on the stone ahead/);
    expect(threads.join("\n")).not.toMatch(/intends to enter Needlehaven/);
    expect(threads).toContain("The party is now inside Needlehaven forest at dusk, facing the first wave of Screechers among the roots.");
  });

  it("control: a checkpoint with no thread of its own keeps the window", () => {
    expect(currentThreads(arcs, 60, 61)).toEqual(playerThreadTexts(arcs, playerThreadSince(60, 61)));
  });
});

describe("T2-4: the recap waits for the summary to catch up, bounded", () => {
  const stale = { title: "S", sections: [{ id: "story" as const, label: "The story so far", lines: ["guild hall"] }], text: "" };
  const fresh = { ...stale, sections: [{ id: "story" as const, label: "The story so far", lines: ["Wendhope and the forest"] }] };
  const setup = () => {
    const controller = new AwayRecapController(() => ({ close: () => undefined }));
    controller.detect(new Date(Date.now() - 48 * 3600 * 1000).toISOString(), stale, "chat-a");
    return { controller };
  };

  it("shows the composition as it stands after the refresh", async () => {
    const { controller } = setup();
    let current: NarrativeStatus = stale;
    const shown = await controller.showAfter(async () => { current = fresh; }, () => current);
    expect(shown).toBe(true);
    expect(controller.get()).toBeNull();
  });

  it("rebuilds the recap from the fresh narrative", async () => {
    const { controller } = setup();
    let current: NarrativeStatus = stale;
    const seen: string[][] = [];
    const spy = jest.spyOn(controller, "show").mockImplementation(() => { seen.push(controller.get()?.lines ?? []); return true; });
    await controller.showAfter(async () => { current = fresh; }, () => current);
    expect(seen[0].join("\n")).toMatch(/Wendhope and the forest/);
    spy.mockRestore();
  });

  it("does not wait past the cap for a slow refresh", async () => {
    const { controller } = setup();
    const started = Date.now();
    await controller.showAfter(() => new Promise(() => undefined), () => stale, 30);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("shows nothing when the chat changed while it waited", async () => {
    const { controller } = setup();
    const shown = await controller.showAfter(async () => { controller.dismissUnless("chat-b"); }, () => fresh);
    expect(shown).toBe(false);
  });

  it("control: no pending recap means no refresh is asked for", async () => {
    const controller = new AwayRecapController(() => ({ close: () => undefined }));
    const prepare = jest.fn(async () => undefined);
    expect(await controller.showAfter(prepare, () => stale)).toBe(false);
    expect(prepare).not.toHaveBeenCalled();
  });
});
