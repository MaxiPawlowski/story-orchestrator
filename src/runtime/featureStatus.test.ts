import { STORY_FEATURE_IDS } from "@engine/featurePolicy";
import { FEATURE_STATE, UNMAPPED_CONTROLS, UNMAPPED_STORY_FEATURES, rowFeatures } from "@features/featureState";
import { FEATURES, visibleFeatures, type Feature } from "@features/registry";
import { defaultsWhere, helpWhere } from "@features/where";
import { FEATURE_CONTROLS } from "./featureControls";
import { readSettingPath, resolveFeatures } from "./featureResolve";
import { FEATURE_STATE_CASES, type FeatureStateCase } from "./featureStatus.cases";
import { FEATURE_WORDS, featureStateWord, featureStatus, waitingCount } from "./featureStatus";
import { findingsByFeature, helpFeatureState, type HelpRowState } from "./helpFeatureState";
import { createSaveHealth } from "./saveHealth";
import { defaultGlobalSettings, type GlobalSettings } from "./settingsModel";
import type { RuntimeSnapshot } from "./types";

const featureOf = (id: string): Feature => {
  const feature = FEATURES.find((entry) => entry.id === id);
  if (!feature) throw new Error(`no registry feature ${id}`);
  return feature;
};

const build = (entry: FeatureStateCase, authorView = false): { snapshot: RuntimeSnapshot; global: GlobalSettings } => {
  const global = structuredClone(defaultGlobalSettings());
  entry.install?.(global);
  const ready = entry.context === "story";
  const features = resolveFeatures(global, ready ? { features: entry.story } : null, entry.chat ?? {});
  const snapshot = {
    ready, storyId: ready ? "s" : null, features, featureOverrides: entry.chat ?? {},
    roleRoutes: entry.route ? [{ role: entry.route.role, label: entry.route.role === "read" ? "Story reads" : "Inner voice", profileId: "p", state: entry.route.state, detail: "seeded", effort: "default" }] : [],
    extraction: { settings: { enabled: true, profileId: "p" }, scheduler: { inFlight: false } },
    stagecraftScope: ["Book"], stagecraft: { settings: global.stagecraft, proposals: [] },
    storyDeclares: { commitments: entry.commitments === true },
    requirements: { ready: true, missingPersonas: [], missingMembers: [], missingLorebooks: [] },
    saveHealth: createSaveHealth(), ui: { authorView },
  } as unknown as RuntimeSnapshot;
  return { snapshot, global };
};

const setupLines = (state: HelpRowState | null) => state?.parts.flatMap((part) => (part.setup ? [part.label ? `${part.label}: ${part.setup}` : part.setup] : [])) ?? [];

const agrees = (entry: FeatureStateCase): string[] => {
  const { snapshot, global } = build(entry);
  const state = helpFeatureState(featureOf(entry.feature), snapshot, global);
  const row = FEATURE_STATE[entry.feature];
  const features = snapshot.features;
  if (!state || !features) return ["no state"];
  const problems: string[] = [];
  if (row.kind === "authored") {
    if (state.parts[0].on !== (snapshot.ready && entry.commitments === true)) problems.push("authored presence");
    return problems;
  }
  const targets = row.kind === "parts" ? row.parts.map((part) => part.feature) : [row.feature];
  targets.forEach((id, index) => {
    const part = state.parts[index];
    const resolved = features[id];
    const detail = featureStatus(resolved, snapshot, id, false, waitingCount(snapshot, id));
    if (!resolved.enabled && part.word !== featureStateWord(resolved)) problems.push(`${id}: index word`);
    if (row.kind === "master" || row.kind === "parts") {
      if (part.on !== resolved.enabled) problems.push(`${id}: on`);
      if (snapshot.ready && part.word !== featureStateWord(resolved)) problems.push(`${id}: index word`);
      if (snapshot.ready && (part.setup ?? null) !== (detail.setup === "ready" ? null : detail.word)) problems.push(`${id}: detail word`);
      return;
    }
    const value = resolved.controls[row.control].value;
    if (part.on !== (resolved.enabled && value !== false && value !== "off")) problems.push(`${id}.${row.control}: control`);
  });
  return problems;
};

describe("v2.9 plan 09: one feature status vocabulary", () => {
  it("the detail word and the index word come from one table", () => {
    const resolved = resolveFeatures(defaultGlobalSettings(), { features: { pacing: "off" } });
    const snapshot = build(FEATURE_STATE_CASES[0]).snapshot;
    expect(featureStateWord(resolved.pacing)).toBe(FEATURE_WORDS.storyOff);
    expect(featureStatus(resolved.pacing, snapshot, "pacing", false, 0)).toEqual({ word: FEATURE_WORDS.storyOff, short: FEATURE_WORDS.storyOff, source: "story", setup: "ready" });
    expect(featureStatus(resolveFeatures(defaultGlobalSettings(), {}).curator, snapshot, "curator", false, 2)).toMatchObject({ word: "Waiting for review: 2 changes", setup: "waiting" });
    expect(featureStatus(resolveFeatures(defaultGlobalSettings(), {}).pacing, { ...snapshot, ready: false }, "pacing", false, 0).setup).toBe("no-story");
    expect(featureStateWord(undefined)).toBe(FEATURE_WORDS.chatOff);
  });
});

describe("v2.9 plan 09: Help shows this chat's effective state (24 frozen cases)", () => {
  it("the case table is the frozen 24", () => {
    expect(FEATURE_STATE_CASES.map((entry) => entry.n)).toEqual(Array.from({ length: 24 }, (_, index) => index + 1));
  });

  it.each(FEATURE_STATE_CASES.map((entry) => [entry.n, entry.feature, entry.seeded, entry] as const))("case %i %s (%s)", (_n, _feature, _seeded, entry) => {
    const { snapshot, global } = build(entry);
    const state = helpFeatureState(featureOf(entry.feature), snapshot, global);
    expect(state?.parts.map((part) => part.word)).toEqual(entry.words);
    expect(setupLines(state)).toEqual(entry.setup ?? []);
    expect(state?.defaults).toBe(entry.context === "no-story");
    expect(agrees(entry)).toEqual([]);
  });

  it("Help, the Features index and detail and the controls agree on 24 of 24", () => {
    const agreeing = FEATURE_STATE_CASES.filter((entry) => agrees(entry).length === 0);
    expect(agreeing.length).toBe(24);
  });

  it("no story never reads Off in this chat", () => {
    const words = FEATURE_STATE_CASES.filter((entry) => entry.context === "no-story").flatMap((entry) => entry.words);
    expect(words).not.toContain(FEATURE_WORDS.chatOff);
  });

  it("a chat re-enable and the source label follow the resolver", () => {
    const { snapshot, global } = build(FEATURE_STATE_CASES[5]);
    expect(snapshot.features?.pacing.reenabled).toBe(true);
    expect(helpFeatureState(featureOf("pacing"), snapshot, global)?.parts[0].source).toBe("chat");
    const review = build(FEATURE_STATE_CASES[8]);
    expect(helpFeatureState(featureOf("meanwhile-proposals"), review.snapshot, review.global)?.parts[0].source).toBe("chat");
  });

  it("install-only features keep their install switch, labelled Install", () => {
    const { snapshot, global } = build(FEATURE_STATE_CASES[0]);
    expect(helpFeatureState(featureOf("hud"), snapshot, global)).toEqual({ parts: [{ word: "On", source: "install", on: true }], defaults: false });
    expect(helpFeatureState(featureOf("stories"), snapshot, global)).toBeNull();
  });
});

describe("v2.9 plan 09: player Help discloses nothing author-only", () => {
  it("zero author-only rows or findings in player mode across the 24 cases", () => {
    const leaks = FEATURE_STATE_CASES.flatMap((entry) => {
      const { snapshot } = build(entry);
      return [...findingsByFeature(snapshot).values()].flat().filter((step) => step.player === null || step.consequence !== step.player)
        .map((step) => `${entry.n}: ${step.check}`);
    });
    expect(leaks).toEqual([]);
    expect(visibleFeatures(false).some((feature) => feature.audience === "author")).toBe(false);
  });

  it("an outage with no player copy shows to the author only", () => {
    const entry = FEATURE_STATE_CASES[16];
    expect(findingsByFeature(build(entry).snapshot).get("models-per-task")).toBeUndefined();
    expect(findingsByFeature(build(entry, true).snapshot).get("models-per-task")?.map((step) => step.check)).toEqual(["model-role-outage"]);
    expect(findingsByFeature(build(FEATURE_STATE_CASES[19]).snapshot).get("models-per-task")?.map((step) => step.check)).toEqual(["model-role-outage"]);
  });
});

describe("v2.9 plan 09: every story feature and control has a Help row or a reason", () => {
  const covered = new Set(Object.values(FEATURE_STATE).flatMap(rowFeatures).map(({ feature, control }) => `${feature}.${control}`));

  it("every StoryFeatureId", () => {
    const missing = STORY_FEATURE_IDS.filter((id) => !covered.has(`${id}.enabled`) && !UNMAPPED_STORY_FEATURES[id]);
    expect(missing).toEqual([]);
    expect(Object.keys(UNMAPPED_STORY_FEATURES).filter((id) => covered.has(`${id}.enabled`))).toEqual([]);
  });

  it("every FEATURE_CONTROLS control", () => {
    const controls = STORY_FEATURE_IDS.flatMap((id) => FEATURE_CONTROLS[id].controls.map((control) => `${id}.${control.field}`));
    expect(controls.filter((key) => !covered.has(key) && !UNMAPPED_CONTROLS[key])).toEqual([]);
    expect(Object.keys(UNMAPPED_CONTROLS).filter((key) => covered.has(key) || !controls.includes(key))).toEqual([]);
  });

  it("every row names a registry feature, and a mapped feature reads no install switch", () => {
    const ids = new Set(FEATURES.map((feature) => feature.id));
    expect(Object.keys(FEATURE_STATE).filter((id) => !ids.has(id))).toEqual([]);
    expect(FEATURES.filter((feature) => FEATURE_STATE[feature.id] && feature.isOn).map((feature) => feature.id)).toEqual([]);
  });

  it("player promises and NPC commitments are separate rows", () => {
    expect(FEATURE_STATE["promises-remembered"]).toEqual({ kind: "master", feature: "promises" });
    expect(FEATURE_STATE["npc-commitments"]).toEqual({ kind: "authored", declares: "commitments" });
  });

  it("without a story, Show me for a story feature lands on Orchestrator → Defaults on a rendered control", () => {
    const routed = FEATURES.filter((feature) => feature.where.workspace?.page === "features");
    expect(routed.length).toBeGreaterThan(15);
    const broken = routed.map((feature) => ({ feature, where: defaultsWhere(feature.where) })).filter(({ where }) => {
      const workspace = where.workspace;
      const control = FEATURE_CONTROLS[workspace?.feature ?? "pacing"].controls.some((entry) => `so-feature-${workspace?.feature}-${entry.field}` === workspace?.control);
      return workspace?.context !== "orchestrator" || workspace.page !== "defaults" || !control || !where.label.startsWith("Orchestrator › Defaults");
    }).map(({ feature }) => feature.id);
    expect(broken).toEqual([]);
    expect(defaultsWhere(featureOf("hud").where)).toEqual(featureOf("hud").where);
  });

  it("without a story, Help offers no Show me into a story page that cannot render", () => {
    expect(helpWhere(featureOf("story-drawer").where, false)).toBeNull();
    expect(helpWhere(featureOf("story-drawer").where, true)).toEqual(featureOf("story-drawer").where);
    expect(helpWhere(featureOf("pacing").where, false)?.workspace).toMatchObject({ context: "orchestrator", page: "defaults" });
    expect(helpWhere(featureOf("hud").where, false)).toEqual(featureOf("hud").where);
    expect(featureOf("promises-remembered").where.workspace).toMatchObject({ context: "story", page: "play" });
  });
});

describe("v2.9 plan 09 S3: accept-mode copy names the default mode", () => {
  const PHRASES: Record<string, RegExp> = { auto: /applies on its own by default/, review: /waits? for your review by default/ };
  const modeRows = Object.entries(FEATURE_STATE).flatMap(([id, row]) => (row.kind === "mode" ? [{ id, feature: row.feature, control: row.control }] : []));

  it.each(modeRows.map((row) => [row.id, row] as const))("%s", (_id, row) => {
    const path = FEATURE_CONTROLS[row.feature].controls.find((control) => control.field === row.control)?.path ?? "";
    const mode = String(readSettingPath(defaultGlobalSettings(), path));
    const feature = featureOf(row.id);
    expect(feature.what).toMatch(PHRASES[mode]);
    for (const [other, phrase] of Object.entries(PHRASES)) if (other !== mode) expect(feature.what).not.toMatch(phrase);
  });

  it("covers meanwhile, curator and continuity; agency has no Help row", () => {
    expect(modeRows.map((row) => row.feature).sort()).toEqual(["continuity", "curator", "meanwhile"]);
    expect(UNMAPPED_STORY_FEATURES.agency).toBeTruthy();
    expect(featureOf("meanwhile-proposals").oneLine).toMatch(/on its own by default/);
  });
});
