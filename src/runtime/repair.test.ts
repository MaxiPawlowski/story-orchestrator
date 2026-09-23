import { nextRepairStep, REPAIR_TARGET_IDS } from "./repair";
import { createSaveHealth } from "./saveHealth";
import type { RuntimeSnapshot } from "./types";

const snapshotWith = (overrides: Partial<RuntimeSnapshot> = {}): RuntimeSnapshot =>
  ({
    storyId: "sun-ruins",
    extraction: { settings: { enabled: true, profileId: "artemis" } },
    requirements: { ready: true, missingPersonas: [], missingMembers: [], missingLorebooks: [] },
    saveHealth: createSaveHealth(),
    ...overrides,
  }) as unknown as RuntimeSnapshot;

describe("nextRepairStep", () => {
  it("says nothing when there is nothing missing", () => {
    expect(nextRepairStep(snapshotWith())).toBeNull();
  });

  it("says nothing in a chat with no story — Start is not a Repair", () => {
    expect(nextRepairStep(snapshotWith({ storyId: null } as Partial<RuntimeSnapshot>))).toBeNull();
  });

  it("puts the memory model first: nothing advances without it", () => {
    const step = nextRepairStep(snapshotWith({
      extraction: { settings: { enabled: false, profileId: null } },
      requirements: { ready: false, missingPersonas: [], missingMembers: ["Belle"], missingLorebooks: [] },
    } as Partial<RuntimeSnapshot>));
    expect(step).toEqual({
      area: "memory-model",
      consequence: "The story will not advance on its own until this is set.",
      detail: "Automatic story advancement is off.",
      targetId: REPAIR_TARGET_IDS.memoryModel,
      provisionable: false,
    });
  });

  it("names the enabled-but-unprofiled case differently from the switched-off one", () => {
    const step = nextRepairStep(snapshotWith({ extraction: { settings: { enabled: true, profileId: null } } } as Partial<RuntimeSnapshot>));
    expect(step?.detail).toBe("No memory model profile is selected.");
  });

  it("reports a missing cast before missing lore, and both are provisionable", () => {
    const step = nextRepairStep(snapshotWith({
      requirements: { ready: false, missingPersonas: [], missingMembers: ["Belle"], missingLorebooks: ["Wendhope"] },
    } as Partial<RuntimeSnapshot>));
    expect(step?.area).toBe("cast");
    expect(step?.detail).toContain("Belle");
    expect(step?.provisionable).toBe(true);
    const lore = nextRepairStep(snapshotWith({ requirements: { ready: false, missingPersonas: [], missingMembers: [], missingLorebooks: ["Wendhope"] } } as Partial<RuntimeSnapshot>));
    expect(lore?.area).toBe("lore");
    expect(lore?.provisionable).toBe(true);
  });

  it("never offers to provision a persona", () => {
    const step = nextRepairStep(snapshotWith({ requirements: { ready: false, missingPersonas: ["Rhea"], missingMembers: [], missingLorebooks: [] } } as Partial<RuntimeSnapshot>));
    expect(step?.area).toBe("persona");
    expect(step?.provisionable).toBe(false);
  });

  it("reports an unlanded save last, and only while it is unlanded", () => {
    const health = { ...createSaveHealth(), pendingBoundary: 7 };
    expect(nextRepairStep(snapshotWith({ saveHealth: health } as Partial<RuntimeSnapshot>))?.area).toBe("save");
    expect(nextRepairStep(snapshotWith({ saveHealth: { ...health, pendingBoundary: null, lastAppliedBoundary: 7 } } as Partial<RuntimeSnapshot>))).toBeNull();
  });
});
