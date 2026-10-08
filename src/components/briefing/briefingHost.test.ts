import { composeBriefing } from "@engine/index";
import { setupFindings } from "@runtime/repair";
import { createSaveHealth } from "@runtime/saveHealth";
import type { RuntimeSnapshot } from "@runtime/types";
import { blockingLines, duePaneEmpty, paneDue } from "./BriefingHost";

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

describe("paneDue (F-B1b-3, B1 2026-10-08: the blocks-only pane reopened over the send box 45 messages in)", () => {
  const outage = (fallback?: string) => ({
    roleRoutes: [{ role: "read", label: "Story reads", profileId: "deepseek", state: "not-answering", detail: "Story reads: the profile is not answering (402 Insufficient Balance)", effort: "default", ...(fallback ? { fallback } : {}) }],
  });

  it("control: a fresh chat with a blocking finding opens the pane before the first reply", () => {
    expect(paneDue(snapshot({ ...unconfigured, boundary: 0 }))).toBe(true);
    expect(paneDue(snapshot({ ...unconfigured }))).toBe(true);
  });

  it("control: a fresh chat with only the identity step due opens the pane", () => {
    expect(paneDue(snapshot({ ...identity, boundary: 0 }))).toBe(true);
  });

  it("never opens on its own once the story has a committed reply, whatever blocks and however unseen the briefing is", () => {
    expect(paneDue(snapshot({ ...unconfigured, boundary: 23 }))).toBe(false);
    expect(paneDue(snapshot({ ...identity, boundary: 1 }))).toBe(false);
    expect(paneDue(snapshot({ ...unconfigured, ...identity, boundary: 1, briefing: { storyId: "road", view, pending: true, enabled: true } }))).toBe(false);
  });

  it("a provider outage is not a blocking finding, before the first reply or after", () => {
    for (const fallback of [undefined, "Story Orchestrator Memory RunPod"]) {
      expect(blockingLines(snapshot({ ...outage(fallback), boundary: 0 }))).toEqual([]);
      expect(paneDue(snapshot({ ...outage(fallback), boundary: 0 }))).toBe(false);
      expect(paneDue(snapshot({ ...outage(fallback), boundary: 23 }))).toBe(false);
    }
  });

  it("the outage is said in the non-modal surfaces: a degrades row naming the stand-in, or that the story is not advancing", () => {
    const standIn = setupFindings(snapshot({ ...outage("Story Orchestrator Memory RunPod"), boundary: 23, ui: { authorView: true } }));
    expect(standIn.blocks).toEqual([]);
    expect(standIn.degrades).toEqual([expect.objectContaining({ check: "model-role-outage", consequence: "Story reads is not answering, so Story Orchestrator Memory RunPod stands in until it answers again." })]);
    const down = setupFindings(snapshot({ ...outage(), boundary: 23, ui: { authorView: true } }));
    expect(down.blocks).toEqual([]);
    expect(down.degrades).toEqual([expect.objectContaining({ check: "model-role-outage", consequence: expect.stringContaining("not advancing on its own") })]);
    const player = setupFindings(snapshot({ ...outage(), boundary: 23 }));
    expect(player.degrades).toEqual([expect.objectContaining({ check: "model-role-outage", consequence: expect.stringContaining("not answering") })]);
  });
});
