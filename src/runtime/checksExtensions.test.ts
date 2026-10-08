import { CHECKS, runCheck, type Check } from "./checks";
import { extensionConflictsFor, readExtensionConflictsWith, extensionConflicts } from "./extensionConflicts";
import { repairSteps, setupFindings } from "./repair";
import { createSaveHealth } from "./saveHealth";
import { jargonIn } from "@features/jargon";
import type { NormalizedStoryV2 } from "@engine/index";
import type { RuntimeSnapshot } from "./types";

const quiet = (overrides: Record<string, unknown> = {}): RuntimeSnapshot => ({
  storyId: "s",
  extraction: { settings: { enabled: true, profileId: "p" } },
  requirements: { ready: true, missingPersonas: [], missingMembers: [], missingLorebooks: [] },
  saveHealth: createSaveHealth(),
  ui: { authorView: false },
  ...overrides,
}) as unknown as RuntimeSnapshot;

const check = (id: string) => CHECKS.find((entry) => entry.id === id) as Check;

const CASES = [
  { id: "stepped-thinking-separated", conflict: "stepped-thinking-separated", severity: "degrades" },
  { id: "presence-hides-chat", conflict: "presence", severity: "degrades" },
  { id: "prompt-inspector-on", conflict: "prompt-inspector", severity: "degrades" },
  { id: "vectors-world-info", conflict: "vectors-world-info", severity: "info" },
] as const;

const story = (exclusive: boolean, lorebooks = ["Ruins"]) => ({ lore_select: { lorebooks, exclusive } }) as unknown as NormalizedStoryV2;

describe("extension conflict checks", () => {
  it.each(CASES)("$id fires on its own conflict and stays quiet on the others", ({ id, conflict, severity }) => {
    const fired = runCheck(check(id), quiet({ extensionConflicts: [conflict] }));
    expect(fired).toMatchObject({ check: id, severity, area: "extension" });
    const others = CASES.filter((entry) => entry.conflict !== conflict).map((entry) => entry.conflict);
    expect(runCheck(check(id), quiet({ extensionConflicts: others }))).toBeNull();
    expect(runCheck(check(id), quiet())).toBeNull();
  });

  it("control: with no story none of them runs", () => {
    const all = CASES.map((entry) => entry.conflict);
    for (const { id } of CASES) expect(runCheck(check(id), quiet({ storyId: null, extensionConflicts: all }))).toBeNull();
  });

  it("the degrading ones list in Repair after the thinking row; the info one never does", () => {
    const steps = repairSteps(quiet({ thinkingSilent: true, extensionConflicts: CASES.map((entry) => entry.conflict) }));
    expect(steps.map((step) => step.check)).toEqual(["model-not-thinking", "stepped-thinking-separated", "presence-hides-chat", "prompt-inspector-on"]);
    expect(setupFindings(quiet({ extensionConflicts: ["vectors-world-info"], ui: { authorView: true } })).info.map((step) => step.check)).toEqual(["vectors-world-info"]);
  });

  it("player copy is plain, and the author-only info finding has none", () => {
    for (const { id, conflict } of CASES) {
      const player = runCheck(check(id), quiet({ extensionConflicts: [conflict] }))?.player;
      if (id === "vectors-world-info") expect(player).toBeNull();
      else expect(jargonIn(player ?? "")).toEqual([]);
    }
  });

  it("Show me opens the extension's own settings where one exists", () => {
    expect(runCheck(check("stepped-thinking-separated"), quiet({ extensionConflicts: ["stepped-thinking-separated"] }))?.target)
      .toEqual({ kind: "st-extensions", selector: "#stepthink_settings" });
    expect(runCheck(check("presence-hides-chat"), quiet({ extensionConflicts: ["presence"] }))?.target).toEqual({ kind: "st-extensions", selector: "#presence_settings" });
    expect(runCheck(check("vectors-world-info"), quiet({ extensionConflicts: ["vectors-world-info"] }))?.target).toEqual({ kind: "st-extensions", selector: ".vectors_settings" });
    expect(runCheck(check("prompt-inspector-on"), quiet({ extensionConflicts: ["prompt-inspector"] }))?.target).toBeNull();
  });
});

describe("extensionConflicts: the snapshot slice", () => {
  it("keeps the Vector Storage row only for a story that uses exclusive lore select", () => {
    const found = ["presence", "vectors-world-info"] as const;
    expect(extensionConflictsFor(story(true), found)).toEqual(["presence", "vectors-world-info"]);
    expect(extensionConflictsFor(story(false), found)).toEqual(["presence"]);
    expect(extensionConflictsFor(story(true, []), found)).toEqual(["presence"]);
    expect(extensionConflictsFor(null, found)).toEqual([]);
  });

  it("reads through the registered reader, and none once it is released", () => {
    const stop = readExtensionConflictsWith(() => ["prompt-inspector"]);
    expect(extensionConflicts(story(false))).toEqual(["prompt-inspector"]);
    stop();
    expect(extensionConflicts(story(false))).toEqual([]);
  });
});
