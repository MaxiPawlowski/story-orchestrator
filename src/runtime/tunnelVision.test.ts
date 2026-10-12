import type { NormalizedStoryV2 } from "@engine/index";
import { CHECKS, runCheck, type Check } from "./checks";
import { readTunnelVisionWith, tunnelVision, tunnelVisionFor } from "./tunnelVision";
import type { RuntimeSnapshot } from "./types";
import { setupFindings } from "./repair";

const story = {
  requirements: { lorebooks: ["Required"] },
  stagecraft: { lorebooks: ["Curated"] },
  lore_select: { lorebooks: ["Selected"] },
} as unknown as NormalizedStoryV2;
const books = ["Required", "Curated", "Selected", "Other"].map((name) => ({ name, suppressesScan: true, canWrite: true }));
const check = CHECKS.find((entry) => entry.id === "tunnelvision-story-lore") as Check;
const snapshot = (overrides: Record<string, unknown> = {}) => ({ storyId: "story", ui: { authorView: true }, tunnelVisionBooks: books.slice(0, 3), ...overrides }) as unknown as RuntimeSnapshot;

describe("TunnelVision coexistence", () => {
  it("intersects every authored lore scope with managed books and clears on story switch", () => {
    expect(tunnelVisionFor(story, books).map((book) => book.name)).toEqual(["Required", "Curated", "Selected"]);
    expect(tunnelVisionFor({ requirements: { lorebooks: ["Elsewhere"] } } as unknown as NormalizedStoryV2, books)).toEqual([]);
    expect(tunnelVisionFor(null, books)).toEqual([]);
  });

  it("reads current settings per snapshot and releases the registered reader", () => {
    let current = books;
    const stop = readTunnelVisionWith(() => current);
    expect(tunnelVision(story)).toHaveLength(3);
    current = [];
    expect(tunnelVision(story)).toEqual([]);
    stop();
    expect(tunnelVision(story)).toEqual([]);
  });

  it("is a dismissable author-only degradation, never a blocker", () => {
    expect(check.audience).toBe("author");
    expect(runCheck(check, snapshot())).toMatchObject({ severity: "degrades", player: null, dismissable: true });
    expect(check.detect(snapshot())?.detail).toContain("Required, Curated, Selected");
    expect(setupFindings(snapshot({ ui: { authorView: false } }), [check]).degrades).toEqual([]);
    expect(runCheck(check, snapshot({ storyId: null }))).toBeNull();
    expect(runCheck(check, snapshot({ tunnelVisionBooks: [] }))).toBeNull();
  });

  it("does not claim scan suppression for native books or writes for read-only books", () => {
    const native = check.detect(snapshot({ tunnelVisionBooks: [{ name: "Required", suppressesScan: false, canWrite: true }] }));
    expect(native?.detail).toContain("Shared write access");
    expect(native?.detail).not.toContain("scanning suppressed");
    const readonly = check.detect(snapshot({ tunnelVisionBooks: [{ name: "Required", suppressesScan: true, canWrite: false }] }));
    expect(readonly?.detail).toContain("scanning suppressed");
    expect(readonly?.detail).not.toContain("Shared write access");
  });
});
