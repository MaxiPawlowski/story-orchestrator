import { readFileSync } from "fs";
import { join } from "path";
import { gatedWorldInfo, parseStoryV2OrThrow, type BoundaryLogEntry, type EngineState, type NormalizedStoryV2, type PrimitiveValue } from "@engine/index";
import type { SharedReadAudit } from "@extraction/index";
import { provenance, type MemoryEntry } from "@memory/index";
import { composeInlineTimeline, inlineMessageIds, visibleInlineItems, type InlineSources, type InlineView } from "./inlineTimeline";
import { inspectMessage } from "./messageInspector";
import { defaultInlineSettings, effectiveInlineLevel, INLINE_WINDOW_MAX, sanitizeGlobalSettings, sanitizeInlineSettings, type InlineLevel } from "./settingsModel";

const ROOT = join(__dirname, "../..");
const load = (path: string, names: Record<string, string>): NormalizedStoryV2 => {
  const raw = JSON.parse(readFileSync(join(ROOT, path), "utf8")) as { checkpoints: Array<Record<string, unknown>> };
  raw.checkpoints = raw.checkpoints.map((checkpoint) => (names[checkpoint.id as string] ? { ...checkpoint, player_name: names[checkpoint.id as string] } : checkpoint));
  return parseStoryV2OrThrow(raw);
};
const SUN = load("examples/sun-ruins/quest-for-the-sun-ruins.json", { cp2: "The Mission" });
const ADV = load("test/fixtures/scan-gate/adolion-adventurer.story.json", { "road-to-wendhope": "Wendhope Road" });

const state = (story: NormalizedStoryV2, active: string, values: Record<string, PrimitiveValue>, messageId: number): EngineState => ({
  blackboard: { values, versions: {}, latched: {} } as unknown as EngineState["blackboard"],
  activeCheckpointId: active, visitedAnchors: [story.startCheckpointId, active], visitedPath: [story.startCheckpointId, active],
  boundary: 1, checkpointStartedBoundary: 1, checkpointStartedAt: 0, checkpointStartedMessageId: messageId, lastMessageId: messageId, chatLength: messageId + 1,
});

const transitionOf = (story: NormalizedStoryV2) => {
  const transition = story.outgoingByCheckpoint[story.startCheckpointId][0];
  const key = Object.keys(story.qualityByKey)[0];
  return { transition, key };
};

const unnamedTransition = (story: NormalizedStoryV2) => Object.values(story.outgoingByCheckpoint).flat().find((candidate) => !story.checkpointById[candidate.to]?.player_name);

const boundary = (story: NormalizedStoryV2, messageId: number, applied: Array<{ origin: string; q: string; v: PrimitiveValue }>, fired = transitionOf(story).transition): BoundaryLogEntry => {
  const { key } = transitionOf(story);
  const transition = fired;
  return {
    at: 1, boundary: 1,
    before: state(story, story.startCheckpointId, {}, messageId - 2),
    after: state(story, transition.to, { [key]: true }, messageId),
    fired: transition, source: "gate",
    context: { lastMessageId: messageId, chatLength: messageId + 1 },
    queue: { applied: applied.map((entry) => ({ source: "extractor", origin: entry.origin, blackboardVersionSum: 0, turnRange: { from: 1, to: 2 }, deltas: [{ q: entry.q, v: entry.v, source: "extracted" }], outcomes: [] })) as never, discarded: [] },
    evaluated: { [key]: true },
  };
};

const audit = (id: string, q: string, messageId: number): SharedReadAudit => ({
  id, createdAt: "2026-09-30T10:00:00.000Z", priority: 1, reason: "cadence", contractHash: "h", scope: [q], window: { from: 1, to: messageId },
  prompt: "PROMPT", rawResponse: `DELTA ${q}=true`, acceptedDeltas: [{ delta: { q, v: true, source: "extracted" } as never, evidence: "I take the paper.", messageId: 2 }],
  rejected: [{ line: `DELTA ${q}=maybe`, reason: "not a boolean" }],
});

const fact = (id: string, text: string, messageId: number, extra: Partial<MemoryEntry> = {}): MemoryEntry => ({
  id, tier: "facts", text, type: "fact", importance: 2, expiration: "permanent", entities: [], confidence: 1, activationTriggers: [], evidence: "quoted line",
  createdAt: 1, recallCount: 0, provenance: provenance({ source: "extractor", messageId, boundary: 1, pass: "shared-read" }), ...extra,
});

const sources = (story: NormalizedStoryV2, overrides: Partial<InlineSources> = {}): InlineSources => {
  const gated = [...gatedWorldInfo([story])].flatMap(([book, comments]) => [...comments].map((comment, uid) => ({ book, uid, comment, via: "constant" as const, gated: true })));
  const key = Object.keys(story.qualityByKey)[0];
  return {
    story: { ...story, display: { lore_names_public: true } },
    settings: { ...defaultInlineSettings(), level: 4 },
    authorView: true,
    chatLength: 8,
    boundaryLog: [boundary(story, 3, [{ origin: "a1", q: key, v: true }]), boundary(story, 6, [], unnamedTransition(story))],
    audits: [audit("a1", key, 2), audit("a2", key, 5)],
    pending: [{ source: "extractor", origin: "a2", blackboardVersionSum: 0, deltas: [{ q: key, v: true, source: "extracted" }] } as never],
    reconciliation: [{ id: "r1", boundary: 1, checkpointId: story.startCheckpointId, targetedKeys: [key], scheduledAt: "x", resolvedAt: null, evidence: [], messageId: 5 }],
    memory: {
      entries: [fact("f1", "The old map shows a road to the east.", 2), fact("f2", "A folded claim.", 2, { foldedInto: "f1" }), fact("f3", "Mira keeps a secret.", 2, { characterId: "mira" })],
      arcs: [{ id: "arc1", text: "Who burned the archive?", status: "resolved", entities: [], openedAt: 1, openedMessageId: 1, resolvedAt: 2, resolvedMessageId: 5 }],
      derived: [{ id: "d1", kind: "scene_summary", boundary: 1, messageId: 5, inputs: ["f1"], range: { from: 1, to: 4 } }],
      conflicts: [], verifyDrops: [],
    },
    loreFired: [{ messageId: 3, entries: [...gated, { book: "Town", uid: 99, comment: "The Tavern", via: "key" }] }],
    talkDecisions: [{ at: "t", messageId: 2, checkpointId: story.startCheckpointId, chosenRosterId: "arin", chosenName: "Arin", source: "rules", latencyMs: 3 }],
    judgeCalls: [{ at: "j", boundary: 1, messageId: 3, use: "scene", model: "jev", latencyMs: 200, stateChars: 10, questionCount: 2 }],
    proposals: [], curatorPass: null,
    effects: [{ id: "e1", effect: "cast", target: { kind: "cast", group: "g", member: "Mira.png" }, before: { disabled: true }, after: { disabled: false }, checkpointId: null, boundary: 1, messageId: 3, at: "x", status: "applied" }],
    tensionHistory: [{ messageId: 3, level: "tense", smoothed: 0.5 }],
    tension: { expected: 0.4, hint: "raise the stakes" },
    payloadCaptures: [{ at: "p", boundary: 1, messageId: 4, reason: "generation", blocks: [] }],
    pipeline: { state: "reading", text: "Reading the last few messages…", detail: "cadence read", needsSetup: false, nextAction: null },
    agencyRecovery: false, lastRollback: null, saveNotice: null,
    ...overrides,
  };
};

const texts = (view: InlineView, maxLevel: number) => Object.values(view.byMessage).flat().filter((item) => item.level <= maxLevel).map((item) => item.text);
const ids = (view: InlineView, messageId: number) => (view.byMessage[messageId] ?? []).map((item) => item.id.split(":").slice(0, 2).join(":"));

describe("inline timeline composer (v2.6 plan 08 D3/D4)", () => {
  it("anchors each event under the message it is about", () => {
    const view = composeInlineTimeline(sources(SUN));
    expect(ids(view, 1)).toEqual(expect.arrayContaining(["threads:open"]));
    expect(ids(view, 2)).toEqual(expect.arrayContaining(["memory:fact", "memory:delta", "calls:read"]));
    expect(ids(view, 3)).toEqual(expect.arrayContaining(["progress:transition", "progress:gate", "progress:evaluated", "memory:applied", "lore:count", "lore:entry", "cast:member", "cast:talk", "pacing:level", "calls:judge"]));
    expect(ids(view, 4)).toEqual(expect.arrayContaining(["calls:payload", "memory:derived"]));
    expect(ids(view, 5)).toEqual(expect.arrayContaining(["threads:resolved", "calls:stall"]));
    expect(ids(view, 7)).toEqual(expect.arrayContaining(["calls:live", "pacing:live"]));
    expect(view.byMessage[2].some((item) => item.id === "memory:fact:f2" || item.id === "memory:fact:f3")).toBe(false);
  });

  it("marks a read pending until its boundary drains it, then applied with a back-reference under the boundary's reply", () => {
    const view = composeInlineTimeline(sources(SUN));
    const read = (auditId: string) => Object.values(view.byMessage).flat().find((item) => item.id === `calls:read:${auditId}`);
    expect(read("a2")?.state).toBe("pending");
    expect(read("a2")?.text).toBe("1 thing noted, apply next turn");
    expect(read("a1")?.state).toBe("applied");
    expect(view.byMessage[3].find((item) => item.id.startsWith("memory:applied"))?.detail).toBe("read at message 2");
  });

  it("CR-U M8: player mode never carries an item above its level, nor any author detail or author action", () => {
    const player = composeInlineTimeline(sources(SUN, { authorView: false }));
    const all = Object.values(player.byMessage).flat();
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((item) => item.level <= 2)).toBe(true);
    expect(all.some((item) => item.detail !== undefined)).toBe(false);
    expect(all.flatMap((item) => item.actions ?? []).every((action) => action.kind === "pin-fact" || action.kind === "exclude-fact")).toBe(true);
    const author = composeInlineTimeline(sources(SUN));
    expect(Object.values(author.byMessage).flat().some((item) => item.level > 2)).toBe(true);
  });

  it("CR-U M1: a cast change names the character, never the avatar file", () => {
    const view = composeInlineTimeline(sources(SUN, { castNames: { "Mira.png": "Mira Vell" } }));
    expect(Object.values(view.byMessage).flat().map((item) => item.text)).toContain("Mira Vell joined");
  });

  it("caps the level at 2 without Author view, and filters by level, category and window", () => {
    expect(effectiveInlineLevel(4, false)).toBe(2);
    expect(effectiveInlineLevel(3, true)).toBe(3);
    const player = composeInlineTimeline(sources(SUN, { authorView: false }));
    expect(player.level).toBe(2);
    const shown = inlineMessageIds(player).flatMap((messageId) => visibleInlineItems(player, messageId));
    expect(shown.every((item) => item.level <= 2 && item.persona === "player")).toBe(true);
    expect(shown.some((item) => item.id.startsWith("lore:count"))).toBe(true);
    const author = composeInlineTimeline(sources(SUN, { settings: { ...defaultInlineSettings(), level: 3 } }));
    expect(visibleInlineItems(author, 3).some((item) => item.id.startsWith("lore:count"))).toBe(false);
    expect(visibleInlineItems(author, 3).some((item) => item.id.startsWith("lore:entry"))).toBe(true);
    const noLore = composeInlineTimeline(sources(SUN, { settings: { ...defaultInlineSettings(), level: 4, categories: { lore: false } } }));
    expect(visibleInlineItems(noLore, 3).some((item) => item.category === "lore")).toBe(false);
    const narrow = composeInlineTimeline(sources(SUN, { settings: { ...defaultInlineSettings(), level: 4, window: 2 } }));
    expect(Object.keys(narrow.byMessage).map(Number).every((messageId) => messageId >= 6)).toBe(true);
    const off = composeInlineTimeline(sources(SUN, { settings: { ...defaultInlineSettings(), level: 0 } }));
    expect(inlineMessageIds(off)).toEqual([]);
  });

  it("places the speaker pick under the reply only, never before it", () => {
    const view = composeInlineTimeline(sources(SUN, { talkDecisions: [{ at: "t", messageId: 7, checkpointId: "cp1", chosenRosterId: "arin", chosenName: "Arin", source: "rules", latencyMs: 3 }] }));
    expect(Object.values(view.byMessage).flat().some((item) => item.id.startsWith("cast:talk"))).toBe(false);
  });

  it.each([["sun-ruins", SUN], ["adventurer", ADV]] as Array<[string, NormalizedStoryV2]>)("never puts a checkpoint id, a quality key or a gated entry name in player copy (%s)", (_name, story) => {
    const view = composeInlineTimeline(sources(story, { lastRollback: { checkpointName: story.checkpoints[1].name, playerName: story.checkpoints[1].player_name ?? null, at: "r" }, agencyRecovery: true, saveNotice: "Changes not saved yet" }));
    const player = texts(view, 2);
    const gatedNames = [...gatedWorldInfo([story]).values()].flatMap((comments) => [...comments]);
    const forbidden = [...story.checkpoints.map((checkpoint) => checkpoint.id), ...Object.keys(story.qualityByKey), ...gatedNames, ...story.checkpoints.map((checkpoint) => checkpoint.name)];
    const leaks = player.flatMap((text) => forbidden.filter((needle) => new RegExp(`(^|[^\\w-])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\w-])`).test(text)).map((needle) => `${needle} in "${text}"`));
    expect(leaks).toEqual([]);
    expect(player).toEqual(expect.arrayContaining([`Lore consulted: The Tavern and ${gatedNames.length} more`, `Stepped back to ${story.checkpoints[1].player_name}`]));
  });

  it("the spoiler property fails on a leak (control)", () => {
    const view = composeInlineTimeline(sources(SUN, { pipeline: { state: "reading", text: `reading ${Object.keys(SUN.qualityByKey)[0]}`, detail: null, needsSetup: false, nextAction: null } }));
    expect(texts(view, 2).some((text) => text.includes(Object.keys(SUN.qualityByKey)[0]))).toBe(true);
  });

  it("the inspector groups one message's items by category, dropping level-replaced summaries", () => {
    const view = composeInlineTimeline(sources(SUN));
    const inspection = inspectMessage(view, 3);
    expect(inspection.sections.map((section) => section.category)).toEqual(["progress", "memory", "lore", "cast", "pacing", "calls"]);
    expect(inspection.sections.find((section) => section.category === "lore")?.items.some((item) => item.id.startsWith("lore:count"))).toBe(false);
    expect(inspectMessage(view, 0).sections).toEqual([]);
    const kinds = (messageId: number) => inspectMessage(view, messageId).sections.flatMap((section) => section.items.map((item) => item.id.split(":").slice(0, 2).join(":")));
    expect(["progress:gate", "cast:talk"].filter((kind) => !kinds(3).includes(kind))).toEqual([]);
    expect(kinds(2)).toContain("memory:delta");
    expect(["memory:raw", "calls:read"].filter((kind) => !kinds(5).includes(kind))).toEqual([]);
  });

  it("returns the requested level alongside the effective one", () => {
    const level: InlineLevel = 3;
    const view = composeInlineTimeline(sources(SUN, { authorView: false, settings: { ...defaultInlineSettings(), level } }));
    expect({ requested: view.requested, level: view.level }).toEqual({ requested: 3, level: 2 });
  });

  it("sanitizes the install-wide display.inline setting: level 1, window 20 by default, bounded window, known categories only", () => {
    expect(sanitizeGlobalSettings({}).display.inline).toEqual({ level: 1, categories: {}, window: 20 });
    expect(sanitizeInlineSettings({ level: 7, categories: { lore: false, bogus: false, memory: "no" }, window: 5000 })).toEqual({ level: 1, categories: { lore: false }, window: INLINE_WINDOW_MAX });
    expect(sanitizeInlineSettings({ level: 3, window: 0 })).toEqual({ level: 3, categories: {}, window: 20 });
  });
});
