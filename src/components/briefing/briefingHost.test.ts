import { composeBriefing } from "@engine/index";
import { createSaveHealth } from "@runtime/saveHealth";
import type { RuntimeSnapshot } from "@runtime/types";
import { blockingLines, duePaneEmpty } from "./BriefingHost";

const view = composeBriefing({ title: "The Road", player_intro: "You carry a sealed letter over the pass." });

const snapshot = (overrides: Record<string, unknown> = {}): RuntimeSnapshot => ({
  storyId: "road",
  extraction: { settings: { enabled: true, profileId: "p" } },
  requirements: { ready: true, missingPersonas: [], missingMembers: [], missingLorebooks: [] },
  saveHealth: createSaveHealth(),
  ui: { authorView: false },
  briefing: { storyId: "road", view, pending: true, enabled: false },
  ...overrides,
}) as unknown as RuntimeSnapshot;

const unconfigured = { extraction: { settings: { enabled: true, profileId: null } } };
const identity = { playerSetup: { storyId: "road", pending: true, needsPane: true, record: { pending: true, storyId: "road", choice: "skip" } } };

describe("duePaneEmpty (B0-live 2026-10-07: an empty 'Before you start' dialog stayed open after its blocks cleared)", () => {
  it("is empty when the briefing is off, nothing blocks and no identity step is due", () => {
    expect(blockingLines(snapshot())).toEqual([]);
    expect(duePaneEmpty(snapshot(), true)).toBe(true);
  });

  it("is not empty while something blocks the story (planted control)", () => {
    expect(blockingLines(snapshot(unconfigured)).length).toBeGreaterThan(0);
    expect(duePaneEmpty(snapshot(unconfigured), true)).toBe(false);
  });

  it("is not empty while the briefing is on and has a view", () => {
    expect(duePaneEmpty(snapshot({ briefing: { storyId: "road", view, pending: true, enabled: true } }), true)).toBe(false);
  });

  it("is not empty while the identity step is due and the host can answer it", () => {
    expect(duePaneEmpty(snapshot(identity), true)).toBe(false);
    expect(duePaneEmpty(snapshot(identity), false)).toBe(true);
  });

  it("counts a failed lock as an identity step to show", () => {
    expect(duePaneEmpty(snapshot({ playerSetup: { storyId: "road", pending: true, needsPane: false, record: { pending: true, storyId: "road", choice: "pick", lockFailed: "refused" } } }), true)).toBe(false);
  });
});
