import type { NormalizedStory } from "@engine/index";
import { jargonIn } from "@features/jargon";
import { CHECKS, runCheck, type Check } from "./checks";
import { readTavernOsWith, tavernOs, tavernOsFor } from "./tavernOs";
import { setupFindings } from "./repair";
import { createSaveHealth } from "./saveHealth";
import type { RuntimeSnapshot } from "./types";

const story = { requirements: { lorebooks: [] } } as unknown as NormalizedStory;
const check = CHECKS.find((entry) => entry.id === "tavernos-rewrites-requests") as Check;
const snapshot = (overrides: Record<string, unknown> = {}) => ({
  storyId: "story", extraction: { settings: { enabled: true, profileId: "p" } }, requirements: { ready: true, missingPersonas: [], missingMembers: [], missingLorebooks: [] },
  saveHealth: createSaveHealth(), ui: { authorView: false }, tavernOsRewrites: true, ...overrides,
}) as unknown as RuntimeSnapshot;

describe("TavernOS HUD rewrites generation requests", () => {
  it("holds only while a story plays", () => {
    expect(tavernOsFor(story, true)).toBe(true);
    expect(tavernOsFor(story, false)).toBe(false);
    expect(tavernOsFor(null, true)).toBe(false);
  });

  it("reads current state per snapshot and releases the registered reader", () => {
    let on = true;
    const stop = readTavernOsWith(() => on);
    expect(tavernOs(story)).toBe(true);
    on = false;
    expect(tavernOs(story)).toBe(false);
    on = true;
    stop();
    expect(tavernOs(story)).toBe(false);
  });

  it("is an info finding with a declared consequence and plain player copy", () => {
    expect(check).toMatchObject({ severity: "info", audience: "player", area: "extension", feature: "memory" });
    const result = runCheck(check, snapshot());
    expect(result?.consequence).toMatch(/TavernOS HUD changes every request/);
    expect(result?.player).toMatch(/^TavernOS HUD changes every message sent to the model/);
    expect(jargonIn(result?.player ?? "")).toEqual([]);
    expect(setupFindings(snapshot()).info.map((step) => step.check)).toContain("tavernos-rewrites-requests");
  });

  it("control: silent when off or with no story", () => {
    expect(runCheck(check, snapshot({ tavernOsRewrites: false }))).toBeNull();
    expect(runCheck(check, snapshot({ tavernOsRewrites: undefined }))).toBeNull();
    expect(runCheck(check, snapshot({ storyId: null }))).toBeNull();
  });
});
