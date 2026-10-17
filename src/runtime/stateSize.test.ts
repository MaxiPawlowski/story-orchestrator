import { readFileSync } from "fs";
import { join } from "path";
import { CHECKS, runCheck, type Check } from "./checks";
import { listed, overLimit, sizeOfItems, STATE_SIZE_LIMITS } from "./stateSizeCore";
import { jargonIn } from "@features/jargon";
import type { RuntimeSnapshot } from "./types";

const MIB = 1024 * 1024;
const measured = JSON.parse(readFileSync(join(__dirname, "../../test/measurements/v2.8/69/k14-size-budget.json"), "utf8")) as { summary: { maxBlobBytes: number; maxLibraryBytes: number; maxWizardBytes: number } };
const check = CHECKS.find((entry) => entry.id === "state-size-large") as Check;
const snapshot = (stateSize: RuntimeSnapshot["stateSize"]) => ({ storyId: null, ui: { authorView: false }, stateSize }) as unknown as RuntimeSnapshot;

describe("plan 69 K14: size budget for the chat blob and the story library", () => {
  it("each limit is the smallest whole MiB at least twice the largest size measured on the lane copies", () => {
    const limit = (bytes: number) => Math.ceil((2 * bytes) / MIB) * MIB;
    expect(STATE_SIZE_LIMITS.blobChars).toBe(limit(measured.summary.maxBlobBytes));
    expect(STATE_SIZE_LIMITS.libraryChars).toBe(limit(measured.summary.maxLibraryBytes + measured.summary.maxWizardBytes));
  });

  it("fires above the blob limit and above the library limit, and not below either", () => {
    const above = runCheck(check, snapshot({ blobChars: STATE_SIZE_LIMITS.blobChars + 1, libraryChars: 0 }));
    expect(above).toMatchObject({ check: "state-size-large", severity: "degrades", area: "save" });
    expect(above?.detail).toContain("This chat keeps 8.0 MB");
    expect(runCheck(check, snapshot({ blobChars: 0, libraryChars: STATE_SIZE_LIMITS.libraryChars + 1 }))?.detail).toContain("The story library");
    expect(runCheck(check, snapshot({ blobChars: STATE_SIZE_LIMITS.blobChars, libraryChars: STATE_SIZE_LIMITS.libraryChars }))).toBeNull();
    expect(runCheck(check, snapshot({ blobChars: measured.summary.maxBlobBytes, libraryChars: measured.summary.maxLibraryBytes }))).toBeNull();
    expect(runCheck(check, snapshot(null))).toBeNull();
  });

  it("runs with no story loaded and speaks plainly to the player", () => {
    const fired = runCheck(check, snapshot({ blobChars: STATE_SIZE_LIMITS.blobChars + 1, libraryChars: STATE_SIZE_LIMITS.libraryChars + 1 }));
    expect(fired?.player).toBeTruthy();
    expect(jargonIn(fired?.player ?? "")).toEqual([]);
  });

  it("sizes items by their JSON length, from a record map or a list", () => {
    const stories = { a: { id: "a", text: "x".repeat(10) }, b: { id: "b" } };
    expect(sizeOfItems(listed(stories))).toBe(JSON.stringify(stories.a).length + JSON.stringify(stories.b).length);
    expect(sizeOfItems(listed([1, "two"]))).toBe(1 + 5);
    expect(listed(undefined)).toEqual([]);
    expect(overLimit({ blobChars: STATE_SIZE_LIMITS.blobChars + 1, libraryChars: STATE_SIZE_LIMITS.libraryChars + 1 })).toEqual(["blob", "library"]);
  });
});
