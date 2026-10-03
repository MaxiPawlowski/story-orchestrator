import { nextRepairStep, secretLeakStep, setupAlert, viewerRepairStep } from "./repair";
import { createSaveHealth } from "./saveHealth";
import { readCopiersWith, secretLeaks, switchedOnCopiers } from "./transcriptCopiers";
import type { RuntimeSnapshot } from "./types";

const snapshotWith = (overrides: Partial<RuntimeSnapshot> = {}): RuntimeSnapshot =>
  ({
    storyId: "adolion-academy",
    extraction: { settings: { enabled: true, profileId: "deepseek" } },
    requirements: { ready: true, missingPersonas: [], missingMembers: [], missingLorebooks: [] },
    saveHealth: createSaveHealth(),
    ...overrides,
  }) as unknown as RuntimeSnapshot;

const SUMMARY = { key: "1_memory", value: "[Summary: Max and Shiya privately discuss the seals beneath the estate failing]" };
const VECTORS = { key: "3_vectors", value: "Past events: ..." };
const OTHER = { key: "2_floating_prompt", value: "note" };

describe("T6-4: ST Summarize and Vector Storage copy the whole transcript, secrets included, into every member's prompt (payloads.jsonl:65, :143)", () => {
  it("names each transcript copier ST holds a block for while a secret is held", () => {
    expect(secretLeaks(true, [SUMMARY, OTHER])).toEqual(["Summarize"]);
    expect(secretLeaks(true, [SUMMARY, VECTORS, SUMMARY])).toEqual(["Summarize", "Vector Storage"]);
  });

  it("control: nothing to name without a held secret, or without a copier's block", () => {
    expect(secretLeaks(false, [SUMMARY, VECTORS])).toEqual([]);
    expect(secretLeaks(true, [OTHER])).toEqual([]);
  });

  it("raises an author Repair step that names the extension and the leak", () => {
    const step = nextRepairStep(snapshotWith({ secretLeaks: ["Summarize"] }));
    expect(step).toMatchObject({ area: "privacy", targetId: null, provisionable: false });
    expect(step?.consequence).toMatch(/learn what was kept from them/);
    expect(step?.detail).toContain("Summarize");
  });

  it("control: no step when nothing leaks", () => {
    expect(secretLeakStep(snapshotWith())).toBeNull();
    expect(nextRepairStep(snapshotWith({ secretLeaks: [] }))).toBeNull();
  });
});

describe("v2.7 plan 02 C2: the copiers are named from their settings too, before their first block lands", () => {
  it("a switched-on copier counts while a secret is held, with no block yet", () => {
    expect(secretLeaks(true, [], ["1_memory"])).toEqual(["Summarize"]);
    expect(secretLeaks(true, [SUMMARY], ["1_memory", "3_vectors"])).toEqual(["Summarize", "Vector Storage"]);
  });

  it("the host reader is installed by the wiring and released by its disposer", () => {
    expect(switchedOnCopiers()).toEqual([]);
    const release = readCopiersWith(() => ["3_vectors"]);
    expect(switchedOnCopiers()).toEqual(["3_vectors"]);
    release();
    expect(switchedOnCopiers()).toEqual([]);
  });

  it("control: switched on without a held secret names nothing", () => {
    expect(secretLeaks(false, [], ["1_memory", "3_vectors"])).toEqual([]);
  });

  it("the author detail says how to switch each one off", () => {
    const step = secretLeakStep(snapshotWith({ secretLeaks: ["Summarize", "Vector Storage"] }));
    expect(step?.detail).toContain("update interval to 0");
    expect(step?.detail).toContain("Enabled for chat messages");
  });

  it("a player is told too, in player words, and the HUD raises it", () => {
    const player = snapshotWith({ secretLeaks: ["Vector Storage"], ui: { authorView: false } as RuntimeSnapshot["ui"] });
    const step = viewerRepairStep(player);
    expect(step?.area).toBe("privacy");
    expect(step?.consequence).toBe("Vector Storage shares the whole chat with every character, so a character can learn what was kept from them. "
      + "Switch it off in SillyTavern's extensions to keep secrets.");
    expect(step?.consequence).not.toMatch(/hiding|unaware|Story Orchestrator keeps/);
    expect(setupAlert(player)?.area).toBe("privacy");
  });
});
