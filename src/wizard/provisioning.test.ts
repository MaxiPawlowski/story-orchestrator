import { advanceEnvironment, describeProvisioningOp, emptyEnvironment, grantCandidates, isProvisioningKind, planProvisioning, provisioningRequirements, revokeCandidates, validateProvisioningOp } from "./provisioning";
import { provisioningSeed, recordGrant, renderAnswers, wizardSessionKey, YOU_DECIDE } from "./interview";
import type { ProvisioningEnvironment, ProvisioningOp, WizardSessionState } from "./types";

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
    expect(validateProvisioningOp(op, environment({ lorebookNames: ["My Personal Notes"], storyLorebooks: ["My Personal Notes"] })).ok).toBe(false);
    expect(validateProvisioningOp(op, environment({ lorebookNames: ["My Personal Notes"], ownedLorebooks: ["My Personal Notes"] })).ok).toBe(true);
  });

  it("never writes an entry into a story lorebook that does not exist yet: creating it is its own step", () => {
    const op: ProvisioningOp = { kind: "upsertLorebookEntry", lorebook: "Sun Ruins Lore", comment: "Ruins", keys: ["ruins"], content: "Sunken halls." };
    const result = validateProvisioningOp(op, environment({ storyLorebooks: ["Sun Ruins Lore"], ownedLorebooks: ["Sun Ruins Lore"] }));
    expect(result.ok).toBe(false);
    expect(result.message).toContain("does not exist yet");
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

describe("lorebook grants (R8)", () => {
  it("validates a grant against an existing book, and a revoke against the same", () => {
    const books = environment({ lorebookNames: ["Adolion World"] });
    expect(validateProvisioningOp({ kind: "grantLorebook", lorebook: "Adolion World" }, books).ok).toBe(true);
    expect(validateProvisioningOp({ kind: "grantLorebook", lorebook: "Adolion World", revoke: true }, books).ok).toBe(true);
    expect(validateProvisioningOp({ kind: "grantLorebook", lorebook: "No Such Book" }, books).ok).toBe(false);
  });

  it("treats a requirement as a dependency, never as write authority", () => {
    const books = environment({ lorebookNames: ["Adolion World"], storyLorebooks: ["Adolion World"] });
    expect(validateProvisioningOp({ kind: "upsertLorebookEntry", lorebook: "Adolion World", comment: "x", keys: [], content: "y" }, books).ok).toBe(false);
  });

  it("records a durable grant keyed by story and file id, and revokes it", () => {
    const session = { key: "s", stage: "provisioning", history: [], questions: [], applied: [], seed: "", updatedAt: "" } as WizardSessionState;
    const granted = recordGrant(session, "adolion", "Adolion World", true, "2026-09-21T00:00:00.000Z");
    expect(granted.grants).toEqual([{ storyId: "adolion", lorebookFileId: "Adolion World", at: "2026-09-21T00:00:00.000Z", confirmed: true }]);
    expect(recordGrant(granted, "adolion", "Adolion World", false).grants).toEqual([]);
  });

  it("sanitises the file id a grant addresses", () => {
    const session = { key: "s", stage: "provisioning", history: [], questions: [], applied: [], seed: "", updatedAt: "" } as WizardSessionState;
    const granted = recordGrant(session, "adolion", "Adolion: House Nightriver", true, "2026-09-21T00:00:00.000Z");
    expect(granted.grants?.[0].lorebookFileId).toBe("Adolion House Nightriver");
  });

  it("offers a grant only for a required book that exists and is not already owned", () => {
    const required = environment({ storyLorebooks: ["World", "Own Book", "Missing"], lorebookNames: ["World", "Own Book"], ownedLorebooks: ["Own Book"] });
    expect(grantCandidates(required)).toEqual(["World"]);
    // Nothing to decide when the story owns what it requires, or requires nothing.
    expect(grantCandidates(environment({ lorebookNames: ["World"], ownedLorebooks: ["World"], storyLorebooks: ["World"] }))).toEqual([]);
    expect(grantCandidates(environment())).toEqual([]);
  });

  it("stops offering the grant once it is owned", () => {
    const base = environment({ storyLorebooks: ["World"], lorebookNames: ["World"] });
    expect(grantCandidates(base)).toEqual(["World"]);
    expect(grantCandidates(advanceEnvironment(base, { kind: "grantLorebook", lorebook: "World" }))).toEqual([]);
  });

  it("offers the revoke back for a granted book, and never for one the wizard created", () => {
    const base = environment({ storyLorebooks: ["World"], lorebookNames: ["World"] });
    const granted = advanceEnvironment(base, { kind: "grantLorebook", lorebook: "World" });
    expect(granted.grantedLorebooks).toEqual(["World"]);
    expect(revokeCandidates(granted)).toEqual(["World"]);
    // A book this story created is its own; there is nothing to take back.
    const created = advanceEnvironment(base, { kind: "createStoryLorebook", name: "World" });
    expect(revokeCandidates(created)).toEqual([]);
  });

  it("a revoke returns the book to unowned, so the grant is offered again", () => {
    const base = environment({ storyLorebooks: ["World"], lorebookNames: ["World"] });
    const granted = advanceEnvironment(base, { kind: "grantLorebook", lorebook: "World" });
    const revoked = advanceEnvironment(granted, { kind: "grantLorebook", lorebook: "World", revoke: true });
    expect(revoked.ownedLorebooks).toEqual([]);
    expect(revoked.grantedLorebooks).toEqual([]);
    expect(grantCandidates(revoked)).toEqual(["World"]);
    expect(validateProvisioningOp({ kind: "upsertLorebookEntry", lorebook: "World", comment: "x", keys: [], content: "y" }, revoked).ok).toBe(false);
  });

  it("sanitises the file id a grant and a revoke are recorded under", () => {
    const base = environment({ storyLorebooks: ["World: Codex"], lorebookNames: ["World: Codex"] });
    const granted = advanceEnvironment(base, { kind: "grantLorebook", lorebook: "World: Codex" });
    expect(granted.ownedLorebooks).toEqual(["World Codex"]);
    expect(revokeCandidates(granted)).toEqual(["World Codex"]);
    expect(advanceEnvironment(granted, { kind: "grantLorebook", lorebook: "World Codex", revoke: true }).ownedLorebooks).toEqual([]);
  });
});
