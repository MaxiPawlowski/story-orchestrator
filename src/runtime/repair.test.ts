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

  it("v2.4 plan 05: a story book another extension hides from the model is a lore step, worded without naming anyone", () => {
    const step = nextRepairStep(snapshotWith({ loreEvidence: { last: null, hiddenBooks: ["Sun Ruins"] } } as Partial<RuntimeSnapshot>));
    expect(step).toEqual({
      area: "lore",
      consequence: "Another extension is hiding this story's lorebook from the model.",
      detail: "Hidden from the model: Sun Ruins",
      targetId: null,
      provisionable: false,
    });
  });

  it("a missing lorebook still comes before a hidden one, and a hidden one before the persona", () => {
    const hidden = { loreEvidence: { last: null, hiddenBooks: ["Sun Ruins"] } };
    expect(nextRepairStep(snapshotWith({ ...hidden, requirements: { ready: false, missingPersonas: [], missingMembers: [], missingLorebooks: ["Adolion"] } } as Partial<RuntimeSnapshot>))?.detail).toBe("Not selected: Adolion");
    expect(nextRepairStep(snapshotWith({ ...hidden, requirements: { ready: false, missingPersonas: ["Tarn"], missingMembers: [], missingLorebooks: [] } } as Partial<RuntimeSnapshot>))?.detail).toBe("Hidden from the model: Sun Ruins");
  });

  it("a deleted profile is a memory-model step", () => {
    const step = nextRepairStep(snapshotWith({ extractionHealth: { kind: "config", detail: "The selected memory model profile no longer exists" } } as Partial<RuntimeSnapshot>));
    expect(step).toEqual({
      area: "memory-model",
      consequence: "The story will not advance on its own until this is set.",
      detail: "The selected memory model profile no longer exists",
      targetId: REPAIR_TARGET_IDS.memoryModel,
      provisionable: false,
    });
  });

  it("control: a memory model that is only not answering is not a repair step", () => {
    const step = nextRepairStep(snapshotWith({ extractionHealth: { kind: "transport", detail: "API request failed", since: 1, nextProbeAt: 2, probing: false } } as Partial<RuntimeSnapshot>));
    expect(step).toBeNull();
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

  describe("v2.4 T14: an orphaned story-memory lorebook", () => {
    const orphan = { name: "Story Orchestrator - Crossing - chat-b", chatId: "chat-b", reason: "declined" as const, detail: "you chose to keep it" };

    it("is a lore row naming the book, and never offers the wizard", () => {
      const step = nextRepairStep(snapshotWith({ orphanedLorebooks: [orphan] } as Partial<RuntimeSnapshot>));
      expect(step).toEqual({
        area: "lore",
        consequence: "A deleted chat left its story memory behind in a lorebook.",
        detail: "Orphaned story-memory lorebook: Story Orchestrator - Crossing - chat-b (you chose to keep it)",
        targetId: null,
        provisionable: false,
      });
    });

    it("comes last, after anything the story in play is missing", () => {
      const health = { ...createSaveHealth(), pendingBoundary: 7 };
      expect(nextRepairStep(snapshotWith({ orphanedLorebooks: [orphan], saveHealth: health } as Partial<RuntimeSnapshot>))?.area).toBe("save");
    });

    it("shows in a chat with no story, because the chat it belonged to is gone", () => {
      expect(nextRepairStep(snapshotWith({ storyId: null, orphanedLorebooks: [orphan] } as Partial<RuntimeSnapshot>))?.area).toBe("lore");
    });
  });
});

describe("v2.4 plan 08 T18: a routed role that cannot answer is a Repair row", () => {
  const route = (role: string, state: string, detail = `${role} detail`) => ({ role, label: role, profileId: `${role}-profile`, state, detail });

  it("names what stops, points at that role's own select, and comes after the memory model", () => {
    const routes = [route("read", "fallback"), route("director", "missing", "The profile chosen for speaker direction no longer exists (ID: gone)")];
    expect(nextRepairStep(snapshotWith({ roleRoutes: routes } as Partial<RuntimeSnapshot>))).toEqual({
      area: "model-role",
      consequence: "Speaker direction falls back to ST's own choice.",
      detail: "The profile chosen for speaker direction no longer exists (ID: gone)",
      targetId: "so-role-profile-director",
      provisionable: false,
    });
    expect(nextRepairStep(snapshotWith({ extraction: { settings: { enabled: true, profileId: null } }, roleRoutes: routes } as Partial<RuntimeSnapshot>))?.area).toBe("memory-model");
  });

  it("comes before the cast: a dead routed model stops work the story has already reached", () => {
    const step = nextRepairStep(snapshotWith({
      roleRoutes: [route("curator", "failed")],
      requirements: { ready: false, missingPersonas: [], missingMembers: ["Belle"], missingLorebooks: [] },
    } as Partial<RuntimeSnapshot>));
    expect(step?.area).toBe("model-role");
  });

  it.each(["missing", "not-configured", "not-answering", "failed"])("%s is a row", (state) => {
    expect(nextRepairStep(snapshotWith({ roleRoutes: [route("curator", state)] } as Partial<RuntimeSnapshot>))?.area).toBe("model-role");
  });

  it.each(["fallback", "untested", "ok"])("%s is not a row", (state) => {
    expect(nextRepairStep(snapshotWith({ roleRoutes: [route("curator", state)] } as Partial<RuntimeSnapshot>))).toBeNull();
  });

  it("every role states its own consequence", () => {
    const consequences = ["read", "synthesis", "authoring", "director", "curator"].map((role) => nextRepairStep(snapshotWith({ roleRoutes: [route(role, "failed")] } as Partial<RuntimeSnapshot>))?.consequence);
    expect(new Set(consequences).size).toBe(5);
    expect(consequences.every((text) => typeof text === "string" && text.length > 0)).toBe(true);
  });
});
