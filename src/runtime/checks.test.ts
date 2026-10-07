import { CHECKS, runCheck, runChecks, type Check } from "./checks";
import { repairSteps, viewerRepairStep } from "./repair";
import { createSaveHealth } from "./saveHealth";
import type { RuntimeSnapshot } from "./types";

const snapshotWith = (overrides: Partial<RuntimeSnapshot> = {}): RuntimeSnapshot =>
  ({
    storyId: "s",
    extraction: { settings: { enabled: true, profileId: "p" } },
    requirements: { ready: true, missingPersonas: [], missingMembers: [], missingLorebooks: [] },
    saveHealth: createSaveHealth(),
    ui: { authorView: false },
    ...overrides,
  }) as unknown as RuntimeSnapshot;

const finding = { consequence: "author words", detail: "how", player: "player words" };
const check = (overrides: Partial<Check>): Check => ({ id: "t", area: "lore", scope: "story", audience: "player", severity: "degrades", detect: () => finding, ...overrides });

describe("v2.7 plan 04: the check registry", () => {
  it("a story- or chat-scoped check runs only while a story plays in this chat; an install check always", () => {
    for (const scope of ["story", "chat"] as const) {
      expect(runCheck(check({ scope }), snapshotWith({ storyId: null }))).toBeNull();
      expect(runCheck(check({ scope }), snapshotWith())).not.toBeNull();
    }
    expect(runCheck(check({ scope: "install" }), snapshotWith({ storyId: null }))).not.toBeNull();
  });

  it("applies() gates detect()", () => {
    const detect = jest.fn(() => finding);
    expect(runCheck(check({ applies: () => false, detect }), snapshotWith())).toBeNull();
    expect(detect).not.toHaveBeenCalled();
  });

  it("audience decides whether a player ever sees it", () => {
    expect(runCheck(check({ audience: "author" }), snapshotWith())?.player).toBeNull();
    expect(runCheck(check({ audience: "player" }), snapshotWith())?.player).toBe("player words");
    expect(runCheck(check({ detect: () => ({ consequence: "same words", detail: "d" }) }), snapshotWith())?.player).toBe("same words");
  });

  it("runChecks keeps one severity, in registry order", () => {
    const list = [check({ id: "a" }), check({ id: "b", severity: "blocks" }), check({ id: "c" })];
    expect(runChecks(snapshotWith(), "degrades", list).map((result) => result.check)).toEqual(["a", "c"]);
    expect(runChecks(snapshotWith(), "blocks", list).map((result) => result.check)).toEqual(["b"]);
  });

  it("registered checks reach Repair through the one channel, named by id", () => {
    const steps = repairSteps(snapshotWith({ secretLeaks: ["Summarize"], thinkingSilent: true }));
    expect(steps.map((step) => step.check).filter(Boolean)).toEqual(["transcript-copiers", "model-not-thinking"]);
    expect(viewerRepairStep(snapshotWith({ thinkingSilent: true }))?.check).toBe("model-not-thinking");
  });
});
