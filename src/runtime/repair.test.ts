import { nextRepairStep, REPAIR_TARGET_IDS, viewerRepairStep, WI_GATING_TARGET_ID } from "./repair";
import { createSaveHealth } from "./saveHealth";
import type { RuntimeSnapshot } from "./types";
import type { WiGatingStatus } from "./worldInfoMode";

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
    } as unknown as Partial<RuntimeSnapshot>));
    expect(step).toEqual({
      area: "memory-model",
      consequence: "The story will not advance on its own until this is set.",
      detail: "Automatic story advancement is off.",
      targetId: REPAIR_TARGET_IDS.memoryModel,
      provisionable: false,
      player: "The story will not advance on its own until it is set up in the extension settings.",
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
      player: null,
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
      player: "The story will not advance on its own until it is set up in the extension settings.",
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
    const orphan = { name: "Story Orchestrator - Crossing - chat-b", chatId: "chat-b", reason: "delete-failed" as const, detail: "the host refused", label: 'the "Crossing" chat started 2026-10-02 01:58' };

    it("is a lore row naming the chat first and the book last, and never offers the wizard", () => {
      const step = nextRepairStep(snapshotWith({ orphanedLorebooks: [orphan] } as Partial<RuntimeSnapshot>));
      expect(step).toEqual({
        area: "lore",
        consequence: "A deleted chat left its story memory behind in a lorebook.",
        detail: 'The "Crossing" chat started 2026-10-02 01:58: the host refused. Lorebook: Story Orchestrator - Crossing - chat-b',
        targetId: null,
        provisionable: false,
        player: null,
      });
    });

    it("reads a row recorded without a label as a deleted chat (T4-3)", () => {
      const step = nextRepairStep(snapshotWith({ orphanedLorebooks: [{ ...orphan, label: undefined }] } as Partial<RuntimeSnapshot>));
      expect(step?.detail).toBe("A deleted chat: the host refused. Lorebook: Story Orchestrator - Crossing - chat-b");
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

describe("v2.5 plan 01 B: a normalised entry switched on outside the story is a Repair row", () => {
  const status = (overrides: Partial<WiGatingStatus> = {}): WiGatingStatus => ({
    mode: "scan", active: true, capability: { state: "present", detail: "ok" }, ledger: { books: 1, entries: 3 }, drift: [], missingKey: [], missing: [], unreadable: [], busy: false, ...overrides,
  });

  it("names the drifted entry, says what it costs first, and points at the gating control", () => {
    const step = nextRepairStep(snapshotWith({ wiGating: status({ drift: [{ lorebook: "Ruins", comment: "CP2" }] }) } as Partial<RuntimeSnapshot>));
    expect(step).toEqual({
      area: "lore",
      consequence: "A story lorebook entry was switched on outside the story; it will show in chats without the story.",
      detail: "Switched on outside the story: 1 entry in Ruins",
      targetId: WI_GATING_TARGET_ID,
      provisionable: false,
      player: null,
    });
  });

  it("raises the same row for a gated entry the scan could not switch off (missingKey)", () => {
    const step = nextRepairStep(snapshotWith({ wiGating: status({ missingKey: [{ lorebook: "Ruins", comment: "CP3" }] }) } as Partial<RuntimeSnapshot>));
    expect(step?.consequence).toBe("A story lorebook entry was switched on outside the story; it will show in chats without the story.");
    expect(step?.detail).toBe("Cannot be switched off for this chat: 1 entry in Ruins");
  });

  it("names books and counts, never an entry's comment: checkpoint entry names are spoilers and Repair shows to the player", () => {
    const drift = [{ lorebook: "Ruins", comment: "CP4 - Sphinx" }, { lorebook: "Ruins", comment: "CP5 - Vault" }, { lorebook: "Archive", comment: "Ending" }];
    const step = nextRepairStep(snapshotWith({ wiGating: status({ drift }) } as Partial<RuntimeSnapshot>));
    expect(step?.detail).toBe("Switched on outside the story: 2 entries in Ruins, 1 entry in Archive");
    expect(step?.detail).not.toMatch(/Sphinx|Vault|Ending/);
  });

  it("shows in a chat with no story, because every chat without the story sees the entry", () => {
    expect(nextRepairStep(snapshotWith({ storyId: null, wiGating: status({ drift: [{ lorebook: "Ruins", comment: "CP2" }] }) } as Partial<RuntimeSnapshot>))?.targetId).toBe(WI_GATING_TARGET_ID);
  });

  it("control: nothing in file mode, and nothing when the ledger holds", () => {
    expect(nextRepairStep(snapshotWith({ wiGating: status({ mode: "file", drift: [{ lorebook: "Ruins", comment: "CP2" }] }) } as Partial<RuntimeSnapshot>))).toBeNull();
    expect(nextRepairStep(snapshotWith({ wiGating: status() } as Partial<RuntimeSnapshot>))).toBeNull();
  });

  it("comes after what the story in play is missing", () => {
    const health = { ...createSaveHealth(), pendingBoundary: 7 };
    expect(nextRepairStep(snapshotWith({ saveHealth: health, wiGating: status({ drift: [{ lorebook: "Ruins", comment: "CP2" }] }) } as Partial<RuntimeSnapshot>))?.area).toBe("save");
  });
});

describe("v2.4 plan 08 T18: a routed role that cannot answer is a Repair row", () => {
  const route = (role: string, state: string, detail = `${role} detail`) => ({ role, label: role, profileId: `${role}-profile`, state, detail, effort: "default" });

  it("names what stops, points at that role's own select, and comes after the memory model", () => {
    const routes = [route("read", "fallback"), route("director", "missing", "The profile chosen for speaker direction no longer exists (ID: gone)")];
    expect(nextRepairStep(snapshotWith({ roleRoutes: routes } as Partial<RuntimeSnapshot>))).toEqual({
      area: "model-role",
      consequence: "Speaker direction falls back to ST's own choice.",
      detail: "The profile chosen for speaker direction no longer exists (ID: gone)",
      targetId: "so-role-profile-director",
      provisionable: false,
      player: null,
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

  it.each(["missing", "not-configured", "not-answering", "failed", "reasoning-exhausted"])("%s is a row", (state) => {
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

describe("L2: a chat lorebook slot that displaces this chat's memory mirror (file mode)", () => {
  const conflicted = (wiBook: { name: string; chatId: string } | null) => snapshotWith({
    requirements: { ready: true, missingPersonas: [], missingMembers: [], missingLorebooks: [], slotConflict: { book: "My Notes", kind: "user-book" } },
    memory: { wiBook },
  } as unknown as Partial<RuntimeSnapshot>);

  it("is a lore step when this chat owns a mirror book the slot keeps out", () => {
    expect(nextRepairStep(conflicted({ name: "Story Orchestrator - S - c1", chatId: "c1" }))).toEqual({
      area: "lore",
      consequence: "This chat's story memory is not reaching the model, because the chat lorebook slot holds another book.",
      detail: "Chat lorebook: My Notes",
      targetId: null,
      provisionable: false,
      player: null,
    });
  });

  it("control: with no mirror book yet there is nothing displaced, so no step", () => {
    expect(nextRepairStep(conflicted(null))).toBeNull();
  });
});

describe("CR-U: Repair per viewer", () => {
  const muted = { ready: true, missingPersonas: [], missingMembers: [], missingLorebooks: [], mutedMembers: ["Belle"] };
  it("names a muted member for player and author alike", () => {
    const step = nextRepairStep(snapshotWith({ requirements: muted } as Partial<RuntimeSnapshot>));
    expect(step).toMatchObject({ area: "cast", consequence: "Belle is muted in this group, so the story cannot give them a turn.", provisionable: false });
    expect(viewerRepairStep(snapshotWith({ ui: { authorView: false }, requirements: muted } as unknown as Partial<RuntimeSnapshot>))?.consequence)
      .toBe("Belle is muted in this group, so the story cannot give them a turn.");
  });

  it("a player never sees an author-only step, and gets the next player step in player words", () => {
    const snapshot = snapshotWith({
      ui: { authorView: false },
      loreEvidence: { last: null, hiddenBooks: ["Sun Ruins"] },
      requirements: { ready: false, missingPersonas: ["Rhea"], missingMembers: [], missingLorebooks: [] },
    } as unknown as Partial<RuntimeSnapshot>);
    expect(nextRepairStep(snapshot)?.consequence).toBe("Another extension is hiding this story's lorebook from the model.");
    expect(viewerRepairStep(snapshot)).toMatchObject({ area: "persona", consequence: "This story is written for a different player character than the one selected." });
    expect(viewerRepairStep(snapshotWith({ ui: { authorView: false }, loreEvidence: { last: null, hiddenBooks: ["Sun Ruins"] } } as unknown as Partial<RuntimeSnapshot>))).toBeNull();
  });

  it("player copy never carries author vocabulary", () => {
    const author = /lorebook|curator|wizard|driver|extension'|World Info|profile|ST's/i;
    const roles = ["read", "synthesis", "authoring", "director", "curator", "inner"] as const;
    for (const role of roles) {
      const step = viewerRepairStep(snapshotWith({ ui: { authorView: false }, roleRoutes: [{ role, state: "failed", detail: "boom", label: role }] } as unknown as Partial<RuntimeSnapshot>));
      if (step) expect(step.consequence).not.toMatch(author);
    }
    const lore = viewerRepairStep(snapshotWith({ ui: { authorView: false }, requirements: { ready: false, missingPersonas: [], missingMembers: [], missingLorebooks: ["Wendhope"] } } as unknown as Partial<RuntimeSnapshot>));
    expect(lore?.consequence).not.toMatch(author);
    expect(lore?.consequence).not.toContain("Wendhope");
  });
});
