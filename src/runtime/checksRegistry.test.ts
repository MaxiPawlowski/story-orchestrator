import { CHECKS, isDismissed, runCheck, withDismissal, type Check } from "./checks";
import { beforeYouStart, installFindings, nextRepairStep, repairSteps, setupAlert, setupCounts, setupFindings, viewerRepairStep } from "./repair";
import { createSaveHealth } from "./saveHealth";
import { hudSetupText, hudSetupTitle } from "./pipeline";
import { FEATURES } from "@features/registry";
import { jargonIn } from "@features/jargon";
import type { RuntimeSnapshot } from "./types";

const quiet = (overrides: Record<string, unknown> = {}): RuntimeSnapshot => ({
  storyId: "s",
  extraction: { settings: { enabled: true, profileId: "p" } },
  requirements: { ready: true, missingPersonas: [], missingMembers: [], missingLorebooks: [] },
  saveHealth: createSaveHealth(),
  ui: { authorView: false },
  ...overrides,
}) as unknown as RuntimeSnapshot;

const everything = (overrides: Record<string, unknown> = {}): RuntimeSnapshot => quiet({
  extraction: { settings: { enabled: true, profileId: null } },
  roleRoutes: [{ role: "director", label: "director", profileId: "d", state: "failed", detail: "boom", effort: "default" }],
  noGroup: { notice: "Stories play in group chats.", storyId: "s", storyTitle: "The Ruins" },
  requirements: {
    ready: false,
    missingMembers: ["Ghost", "Belle"], absentMembers: ["Ghost"], mutedMembers: ["Vael"],
    missingLorebooks: ["Gone", "Unscanned"], absentLorebooks: ["Gone"],
    missingPersonas: ["Apprentice", "Traveller"], absentPersonas: ["Apprentice"], missingFixedName: "Mara",
    slotConflict: { book: "My Notes", kind: "user-book" },
  },
  loreEvidence: { last: null, hiddenBooks: ["Sun Ruins"] },
  memory: { wiBook: { name: "Story Orchestrator - S - c1", chatId: "c1" }, chapters: [{ status: "degraded", playerTitle: "The Gate" }] },
  saveHealth: { ...createSaveHealth(), pendingBoundary: 7 },
  secretLeaks: ["Summarize"],
  thinkingSilent: true,
  imageStory: { checkpoints: true, scenes: false },
  imageHealth: { enabled: true, backend: "comfy", automation: "story", service: "absent", detail: "ComfyUI did not answer.", source: null, missingModels: ["missing.safetensors"], broker: "none" },
  imageRetired: [{ where: "background", was: "flux1-dev-fp8.safetensors" }],
  spriteLookIssues: [{ name: "Arin", reason: "Choose a reference expression pack in Studio." }],
  wiGating: { mode: "scan", drift: [{ lorebook: "Ruins", comment: "CP2" }], missingKey: [] },
  globalStoryLore: ["Ruins Lore"],
  orphanedLorebooks: [{ name: "Story Orchestrator - Old - c0", detail: "4 memories", label: "the old chat" }],
  playerSetup: {
    storyId: "s", pending: false, needsPane: true, switched: true, record: { pending: false, avatarId: "mara.png", name: "Mara" }, lockedName: "Mara",
    current: { avatarId: "belle.png", name: "Belle" }, castClash: "Belle", descriptionEmpty: true, injectOff: true, beforeFirstMessage: true,
  },
  ...overrides,
});

const REPAIR_ORDER = [
  "memory-model", "model-role", "story-needs-group",
  "cast-absent", "cast-unbound", "cast-muted", "lore-absent", "lore-unscanned", "lore-hidden", "persona-absent", "persona-unselected", "memory-slot-taken", "save-unconfirmed", "persona-fit",
  "transcript-copiers", "model-not-thinking", "persona-switch", "persona-fit-cast", "chapter-unsummarized", "wi-gating-drift", "story-lore-global", "orphaned-lorebooks",
  "images-on-no-service", "image-model-missing", "image-model-retired",
];

describe("v2.7 plan 04: one check registry", () => {
  it("every check has a unique id and a known severity", () => {
    expect(new Set(CHECKS.map((check) => check.id)).size).toBe(CHECKS.length);
    for (const check of CHECKS) expect(["blocks", "degrades", "info"]).toContain(check.severity);
  });

  it("every check fires on the complete fixture and states its consequence before its detail", () => {
    const snapshot = everything();
    const fired = CHECKS.map((check) => [check.id, runCheck(check, snapshot)] as const);
    expect(fired.filter(([, result]) => !result).map(([id]) => id)).toEqual([]);
    for (const [, result] of fired) {
      expect(result?.consequence.trim().length).toBeGreaterThan(0);
      expect(result?.detail.trim().length).toBeGreaterThan(0);
    }
  });

  it("player copy uses no jargon word", () => {
    const snapshot = everything();
    const offenders = CHECKS.flatMap((check) => {
      const player = runCheck(check, snapshot)?.player;
      return player ? jargonIn(player).map((entry) => `${check.id}: ${entry.term}`) : [];
    });
    expect(offenders).toEqual([]);
  });

  it("names only features that exist", () => {
    const ids = new Set(FEATURES.map((feature) => feature.id));
    expect(CHECKS.filter((check) => check.feature && !ids.has(check.feature)).map((check) => check.id)).toEqual([]);
  });

  it("a blocks check has no dismiss path; every other severity has one", () => {
    const snapshot = everything();
    for (const check of CHECKS) expect(runCheck(check, snapshot)?.dismissable).toBe(check.severity !== "blocks");
  });

  it("control: a planted blocks check with a stored dismissal is still in Repair, and a planted duplicate id is caught", () => {
    const planted: Check = { id: "planted", area: "lore", scope: "install", audience: "author", severity: "blocks", detect: () => ({ consequence: "c", detail: "d" }) };
    expect(repairSteps(quiet({ dismissedChecks: ["planted"] }), [planted]).map((step) => step.check)).toEqual(["planted"]);
    expect(new Set([...CHECKS, CHECKS[0]].map((check) => check.id)).size).toBeLessThan(CHECKS.length + 1);
  });
});

describe("v2.7 plan 04 B: Repair is the registry's ordering (F33)", () => {
  it("lists every finding in the declared order: blocks first, then degrades, each in registry order", () => {
    const steps = repairSteps(everything({ ui: { authorView: true } }));
    expect(steps.map((step) => step.check)).toEqual(REPAIR_ORDER);
    const firstDegrade = steps.findIndex((step) => step.severity === "degrades");
    expect(steps.slice(firstDegrade).every((step) => step.severity === "degrades")).toBe(true);
  });

  it("keeps the shipped degrades rows (privacy, thinking) in Repair", () => {
    expect(nextRepairStep(quiet({ secretLeaks: ["Summarize"] }))?.check).toBe("transcript-copiers");
    expect(nextRepairStep(quiet({ thinkingSilent: true }))?.check).toBe("model-not-thinking");
  });

  it("with no story only install checks and the engine-free one run, and an ordinary chat is quiet", () => {
    expect(repairSteps(everything({ storyId: null })).map((step) => step.check))
      .toEqual(["story-needs-group", "wi-gating-drift", "story-lore-global", "orphaned-lorebooks", "images-on-no-service", "image-model-missing", "image-model-retired"]);
    expect(repairSteps(quiet({ storyId: null }))).toEqual([]);
  });

  it("info never enters Repair and never raises the HUD count; it shows in the Setup list", () => {
    const info: Check = { id: "whats-new", area: "lore", scope: "install", audience: "player", severity: "info", detect: () => ({ consequence: "Something new.", detail: "New." }) };
    const snapshot = quiet();
    expect(repairSteps(snapshot, [info])).toEqual([]);
    expect(setupCounts(snapshot, [info])).toEqual({ blocks: 0, degrades: 0 });
    expect(setupFindings(snapshot, [info]).info.map((step) => step.check)).toEqual(["whats-new"]);
  });
});

describe("v2.7 plan 04 C: dismissal (decision 4, F34)", () => {
  it("a dismissed degrades finding leaves Repair, the HUD and the live list, and is listed as dismissed", () => {
    const snapshot = quiet({ thinkingSilent: true, dismissedChecks: ["model-not-thinking"] });
    expect(repairSteps(snapshot)).toEqual([]);
    expect(setupAlert(snapshot)).toBeNull();
    expect(setupCounts(snapshot)).toEqual({ blocks: 0, degrades: 0 });
    expect(setupFindings(snapshot).dismissed.map((step) => step.check)).toEqual(["model-not-thinking"]);
  });

  it("a stored dismissal of a blocks finding is ignored", () => {
    const snapshot = quiet({ extraction: { settings: { enabled: true, profileId: null } }, dismissedChecks: ["memory-model"] });
    expect(nextRepairStep(snapshot)?.check).toBe("memory-model");
    expect(setupFindings(snapshot).blocks.map((step) => step.check)).toEqual(["memory-model"]);
    expect(setupFindings(snapshot).dismissed).toEqual([]);
    expect(isDismissed({ check: "memory-model", dismissable: false }, ["memory-model"])).toBe(false);
  });

  it("dismissing is per check and reversible", () => {
    expect(withDismissal([], "a", true)).toEqual(["a"]);
    expect(withDismissal(["a"], "a", true)).toEqual(["a"]);
    expect(withDismissal(["a", "b"], "a", false)).toEqual(["b"]);
  });
});

describe("v2.7 plan 04 C: one surface", () => {
  it("the HUD counts by severity, leaving the save row to its own line", () => {
    const counts = setupCounts(everything({ ui: { authorView: true } }));
    expect(counts).toEqual({ blocks: 13, degrades: 11 });
    expect(hudSetupText(counts)).toBe("fix setup (24)");
    expect(hudSetupText({ blocks: 0, degrades: 2 })).toBe("check setup (2)");
    expect(hudSetupTitle({ blocks: 1, degrades: 2 })).toBe("1 thing stops the story. 2 things weaken it.");
  });

  it("Before you start lists this story's blocks findings in player copy", () => {
    const steps = beforeYouStart(everything());
    expect(steps.every((step) => step.severity === "blocks" && step.player !== null)).toBe(true);
    expect(steps.map((step) => step.check)).toContain("memory-model");
    expect(steps.map((step) => step.check)).not.toContain("lore-hidden");
  });

  it("Getting started reads the install checks", () => {
    expect(installFindings(everything({ ui: { authorView: true } })).map((step) => step.check))
      .toEqual(["wi-gating-drift", "story-lore-global", "orphaned-lorebooks", "images-on-no-service", "image-model-missing", "image-model-retired", "gpu-broker-no-text-model"]);
    expect(installFindings(everything())).toEqual([]);
  });

  it("the story-needs-group finding carries the make-a-group fix", () => {
    expect(runCheck(CHECKS.find((check) => check.id === "story-needs-group") as Check, everything({ storyId: null }))?.action)
      .toEqual({ kind: "make-group", storyId: "s", label: "Make a group for this story" });
  });
});

describe("v2.7 plan 04 privacy leg (K1, F34): the copier finding a player sees does not depend on a held secret", () => {
  const player = (held: boolean) => quiet({ secretLeaks: ["Summarize"], secretsHeld: held });
  const author = (held: boolean) => quiet({ secretLeaks: ["Summarize"], secretsHeld: held, ui: { authorView: true } });
  const surfaces = (snapshot: RuntimeSnapshot) => JSON.stringify({
    repair: viewerRepairStep(snapshot), hud: setupAlert(snapshot), counts: setupCounts(snapshot), text: hudSetupText(setupCounts(snapshot)),
    title: hudSetupTitle(setupCounts(snapshot)), setup: setupFindings(snapshot), before: beforeYouStart(snapshot), install: installFindings(snapshot),
  });

  it("every player surface is byte-identical with and without a held secret", () => {
    expect(surfaces(player(true))).toBe(surfaces(player(false)));
    expect(surfaces(player(false))).not.toMatch(/held|hiding|unaware/i);
  });

  it("for each copier on its own", () => {
    for (const copier of ["Summarize", "Vector Storage"]) {
      const one = (held: boolean) => quiet({ secretLeaks: [copier], secretsHeld: held });
      expect(surfaces(one(true))).toBe(surfaces(one(false)));
    }
  });

  it("the author detail differs only in Author view", () => {
    expect(setupFindings(author(true)).degrades[0]?.detail).toMatch(/A secret is held right now/);
    expect(setupFindings(author(false)).degrades[0]?.detail).toMatch(/No secret is held yet/);
    expect(setupFindings(author(true)).degrades[0]?.consequence).toBe(setupFindings(author(false)).degrades[0]?.consequence);
  });
});
