import { advanceEnvironment, describeProvisioningOp, emptyEnvironment, isProvisioningKind, planProvisioning, provisioningRequirements, validateProvisioningOp } from "./provisioning";
import { provisioningSeed, renderAnswers, wizardSessionKey, YOU_DECIDE } from "./interview";
import type { ProvisioningEnvironment, ProvisioningOp } from "./types";

const environment = (patch: Partial<ProvisioningEnvironment> = {}): ProvisioningEnvironment => ({ ...emptyEnvironment(), ...patch });

const card = (name: string): ProvisioningOp => ({ kind: "createCharacterCard", name, description: "A guide who knows the ruins." });

describe("provisioning validation (create-only)", () => {
  it("accepts a new character card", () => {
    expect(validateProvisioningOp(card("Arin"), environment())).toEqual({ ok: true, message: "" });
  });

  it("refuses to touch a character that already exists, case-insensitively", () => {
    const result = validateProvisioningOp(card("arin"), environment({ characterNames: ["Arin"] }));
    expect(result.ok).toBe(false);
    expect(result.message).toContain("never edits yours");
  });

  it("requires a description on a new card", () => {
    const result = validateProvisioningOp({ kind: "createCharacterCard", name: "Arin", description: "  " }, environment());
    expect(result.ok).toBe(false);
    expect(result.message).toContain("needs a description");
  });

  it("refuses to create a lorebook that exists", () => {
    const result = validateProvisioningOp({ kind: "createStoryLorebook", name: "Xentar Checkpoints" }, environment({ lorebookNames: ["Xentar Checkpoints"] }));
    expect(result.ok).toBe(false);
  });

  it("only writes entries into this story's own lorebook", () => {
    const op: ProvisioningOp = { kind: "upsertLorebookEntry", lorebook: "My Personal Notes", comment: "Ruins", keys: ["ruins"], content: "Sunken halls." };
    expect(validateProvisioningOp(op, environment({ lorebookNames: ["My Personal Notes"] })).ok).toBe(false);
    expect(validateProvisioningOp(op, environment({ lorebookNames: ["My Personal Notes"], storyLorebooks: ["My Personal Notes"] })).ok).toBe(true);
  });

  it("refuses a group whose members do not exist yet", () => {
    const result = validateProvisioningOp({ kind: "createGroup", name: "Sun Ruins", members: ["Arin", "Ponticius"] }, environment({ characterNames: ["Arin"] }));
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Ponticius");
  });

  it("refuses a group name already in use", () => {
    const result = validateProvisioningOp({ kind: "createGroup", name: "Sun Ruins", members: ["Arin"] }, environment({ characterNames: ["Arin"], groupNames: ["Sun Ruins"] }));
    expect(result.ok).toBe(false);
    expect(result.message).toContain("select it instead");
  });
});

describe("provisioning plan", () => {
  it("folds the environment forward so later ops see earlier creations", () => {
    const ops: ProvisioningOp[] = [
      card("Arin"),
      { kind: "createStoryLorebook", name: "Sun Ruins Lore" },
      { kind: "upsertLorebookEntry", lorebook: "Sun Ruins Lore", comment: "The ruins", keys: ["ruins"], content: "Sunken halls." },
      { kind: "createGroup", name: "Sun Ruins Party", members: ["Arin"] },
    ];
    const plan = planProvisioning(ops, environment());
    expect(plan.items.map((item) => item.validation.ok)).toEqual([true, true, true, true]);
    expect(plan.environment.storyLorebooks).toEqual(["Sun Ruins Lore"]);
  });

  it("keeps a rejected op from advancing the environment", () => {
    const ops: ProvisioningOp[] = [
      { kind: "createCharacterCard", name: "Arin", description: "" },
      { kind: "createGroup", name: "Party", members: ["Arin"] },
    ];
    const plan = planProvisioning(ops, environment());
    expect(plan.items.map((item) => item.validation.ok)).toEqual([false, false]);
  });

  it("advances only the kinds that create something", () => {
    const base = environment();
    expect(advanceEnvironment(base, { kind: "upsertLorebookEntry", lorebook: "a", comment: "b", keys: [], content: "c" })).toBe(base);
  });
});

describe("provisioning bookkeeping", () => {
  it("turns created assets into story requirements", () => {
    expect(provisioningRequirements(card("Arin"))).toEqual({ members: ["Arin"], lorebooks: [] });
    expect(provisioningRequirements({ kind: "createStoryLorebook", name: "Lore" })).toEqual({ members: [], lorebooks: ["Lore"] });
    expect(provisioningRequirements({ kind: "createGroup", name: "Party", members: ["Arin"] })).toEqual({ members: [], lorebooks: [] });
  });

  it("recognizes provisioning kinds", () => {
    expect(isProvisioningKind("createGroup")).toBe(true);
    expect(isProvisioningKind("addQuality")).toBe(false);
  });

  it("describes every kind for the review card", () => {
    expect(describeProvisioningOp(card("Arin")).label).toContain("Arin");
    expect(describeProvisioningOp({ kind: "upsertLorebookEntry", lorebook: "Lore", comment: "Ruins", keys: [], content: "x" }).target).toBe("Lore/Ruins");
  });
});

describe("interview helpers", () => {
  it("keys a session by id, falling back to the title", () => {
    expect(wizardSessionKey({ id: "sun-ruins" })).toBe("sun-ruins");
    expect(wizardSessionKey({ title: "Quest for the Sun Ruins" })).toBe("quest-for-the-sun-ruins");
    expect(wizardSessionKey({})).toBe("untitled");
  });

  it("renders unanswered questions as 'you decide' so the wizard always proceeds", () => {
    const rendered = renderAnswers(
      [{ id: "q1", text: "Who is the antagonist?" }, { id: "q2", text: "How does it end?" }],
      [{ id: "q1", text: "A rival archaeologist." }, { id: "q2", text: "  " }],
    );
    expect(rendered).toContain("A rival archaeologist.");
    expect(rendered).toContain(YOU_DECIDE);
  });

  it("seeds the provisioning stage from the unmet requirements only", () => {
    const seed = provisioningSeed({ members: ["Arin"], lorebooks: ["Sun Ruins Lore"], personas: ["Traveller"] });
    expect(seed).toContain("Arin");
    expect(seed).toContain("Sun Ruins Lore");
    expect(seed).toContain("never touches personas");
    expect(provisioningSeed({})).toBe("");
  });
});
