import { nextRepairStep, secretLeakStep } from "./repair";
import { createSaveHealth } from "./saveHealth";
import { secretLeaks } from "./transcriptCopiers";
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
    expect(step).toMatchObject({ area: "privacy", targetId: null, provisionable: false, player: null });
    expect(step?.consequence).toMatch(/learn what was kept from them/);
    expect(step?.detail).toContain("Summarize");
  });

  it("control: no step when nothing leaks", () => {
    expect(secretLeakStep(snapshotWith())).toBeNull();
    expect(nextRepairStep(snapshotWith({ secretLeaks: [] }))).toBeNull();
  });
});
