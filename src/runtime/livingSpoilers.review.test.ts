import { readFileSync } from "fs";
import { join } from "path";
import { parseStoryV2OrThrow, StoryEngine, type NormalizedStoryV2 } from "@engine/index";
import { foldOps } from "@generation/living/fold";
import { projectLivingExport } from "@generation/living/export";
import { guardDraft } from "@generation/living/guard";
import { buildDirectorOps, checkDirectorOps, planChapter } from "@generation/living/plan";
import type { DirectorDraft } from "@generation/living/types";
import { heldSecrets, withoutSecretLines, type EpistemicEntry } from "@memory/index";
import { defaultInlineSettings } from "./settingsModel";
import { composeInlineTimeline, type InlineSources } from "./inlineTimeline";
import { livingAuthorView } from "./livingAuthorView";
import { installLivingAuthorView, livingSlice } from "./livingSnapshot";
import { buildNarrativeStatus } from "./narrative";
import type { PipelineStatus } from "./pipeline";
import { playedProjection, projectionText } from "./playerProjection";

const UNREACHED_NAME = "The Drowned Bell";
const UNREACHED_OBJECTIVE = "A bell tolls under the harbour water and the keeper rows out to it.";
const SECRET = /oil|smuggl/i;
const HIDING = { id: "h-tobin", subject: "Tobin", tag: "hiding", hiddenFrom: "Maren", content: "that he smuggles lamp oil past the customs house", messageId: 1, createdAt: 1 } as unknown as EpistemicEntry;
const secrets = heldSecrets([HIDING], ["Maren", "Tobin", "Ysolde", "Narrator"]);
const resting = (text: string) => withoutSecretLines(text, secrets, null);

const draft = (name: string, objective: string, key: string): DirectorDraft => ({
  anchor: { name, objective, tension: "stirring", snapshot: {}, final: false },
  opensWhen: { kind: "new", key, rubric: `Has ${key.replace(/_/g, " ")} happened?` },
  newQualities: [], buildsOn: null, newChapter: false, reason: "",
});

const grow = (raw: Record<string, unknown>, frontierId: string, entry: DirectorDraft) => {
  const story = parseStoryV2OrThrow(raw);
  const built = buildDirectorOps(story, frontierId, entry, planChapter(story, frontierId, { sealsOn: true, final: false, newChapter: false }));
  expect(checkDirectorOps({ raw, story, frontierId, ops: built.ops, values: {}, latched: {} }).issues).toEqual([]);
  return foldOps(raw, built.ops);
};

const livingRun = () => {
  const authored = JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/living-premise.story.json"), "utf8")) as Record<string, unknown>;
  const once = grow(authored, "liv_open", draft("The Cold Quay", "A quay lantern goes dark while the harbourmaster watches.", "lantern_dark"));
  const raw = grow(once, "liv_1", draft(UNREACHED_NAME, UNREACHED_OBJECTIVE, "bell_heard"));
  const story = parseStoryV2OrThrow(raw) as NormalizedStoryV2;
  const engine = new StoryEngine({ now: () => 0 });
  engine.loadStory(story);
  const step = (q: string, v: boolean | number, source: "extractor" | "code", message: number) => {
    engine.enqueue({ source: source === "code" ? "mechanical" : "extractor", blackboardVersionSum: 0, deltas: [{ q, v, source }] });
    return engine.commitBoundary({ lastMessageId: message, chatLength: message + 1 });
  };
  step("liv_1_lantern_dark", true, "extractor", 2);
  step("progress_toward_liv_1", 1, "code", 4);
  expect(engine.serialize().activeCheckpointId).toBe("liv_1");
  return { raw, story, engine };
};

const pipeline = { state: "idle", text: "", needsSetup: false, nextAction: "none" } as unknown as PipelineStatus;

const inline = (run: ReturnType<typeof livingRun>, level: 1 | 2): InlineSources => ({
  story: run.story, settings: { ...defaultInlineSettings(), level }, authorView: false, chatLength: 6, boundaryLog: run.engine.stateLog, audits: [], pending: [],
  reconciliation: [], memory: { entries: [], arcs: [], derived: [], conflicts: [], verifyDrops: [] }, loreFired: [], talkDecisions: [], judgeCalls: [],
  proposals: [], curatorPass: null, effects: [], tensionHistory: [], tension: { expected: null, hint: null }, payloadCaptures: [], pipeline, agencyRecovery: false,
  lastRollback: null, saveNotice: null,
});

describe("v2.8 22 spoiler property: an unreached generated anchor and a held secret never reach a player surface (F27)", () => {
  it("the player projection, the narrative and the suggestion input name only reached turning points", () => {
    const run = livingRun();
    const state = run.engine.serialize();
    const narrative = buildNarrativeStatus({
      storyTitle: run.story.title, publicIntro: null, checkpointName: run.story.checkpointById[state.activeCheckpointId]?.name ?? "", objective: null,
      lastTransition: { fromName: "The opening", toName: "The Cold Quay" }, openThreads: [], canon: "", tensionLevel: "stirring", pendingCount: 0, pipeline,
    });
    const projection = playedProjection({ story: run.story, narrative, visitedPath: state.visitedPath, activeCheckpointId: state.activeCheckpointId, cast: ["Maren"], chat: [], playerName: "Max" });
    const text = `${JSON.stringify(narrative)}\n${projectionText(projection)}\n${JSON.stringify(projection)}`;
    expect(text).not.toContain(UNREACHED_NAME);
    expect(text).not.toContain("tolls under the harbour");
  });

  it("the inline timeline at the player levels never names it", () => {
    const run = livingRun();
    for (const level of [1, 2] as const) {
      const view = composeInlineTimeline(inline(run, level));
      expect(JSON.stringify(view)).not.toContain(UNREACHED_NAME);
    }
  });

  it("the living slice carries no director card, name or reason in player mode; Author view does", () => {
    const run = livingRun();
    const living = { authored: null, folded: [], ops: [], proposals: [{
      id: "p2", status: "applied" as const, epoch: "0:1:x", frontierId: "liv_1", anchorId: "liv_2", ops: [], issues: [], reason: "the bell thread", boundary: 2, messageId: 4,
      attempts: 1, autonomy: "auto" as const, at: "t", draft: draft(UNREACHED_NAME, UNREACHED_OBJECTIVE, "bell_heard"),
    }], epochBumps: 0, passes: 2, lastPass: null };
    const player = livingSlice({ story: run.story, state: run.engine.serialize(), living, authorView: false, enabled: true, branching: true, epoch: null });
    expect(player).toEqual({ canSave: true, author: null });
    installLivingAuthorView(livingAuthorView);
    const author = livingSlice({ story: run.story, state: run.engine.serialize(), living, authorView: true, enabled: true, branching: true, epoch: null });
    expect(JSON.stringify(author)).toContain(UNREACHED_NAME);
  });

  it("Save as story drops the unreached anchor, and the held-secret filter scrubs what it keeps", () => {
    const run = livingRun();
    const reached = new Set([...run.engine.serialize().visitedPath, "liv_1"]);
    const leaky = JSON.parse(JSON.stringify(run.raw)) as { checkpoints: Array<{ id: string; objective: string }> };
    const kept = leaky.checkpoints.find((checkpoint) => checkpoint.id === "liv_1");
    if (kept) kept.objective = "Tobin smuggles lamp oil past the customs house. A quay lantern goes dark.";
    const out = projectLivingExport(leaky as unknown as Record<string, unknown>, parseStoryV2OrThrow(leaky), { reached, includeUnreached: false, id: "x", title: "x", scrub: resting });
    expect(out.ok).toBe(true);
    const text = JSON.stringify(out.ok ? out.raw : null);
    expect(text).not.toContain(UNREACHED_NAME);
    expect(SECRET.test(text)).toBe(false);
  });

  it("a director field that restates a held secret is refused before it can be shown", () => {
    const issues = guardDraft(draft("The Customs House", "Tobin smuggles lamp oil past the customs house while Maren is away.", "oil_found"), {
      playerNames: ["Max"], restatesSecret: (value) => resting(value).trim() !== value.trim(),
    });
    expect(issues).toContain("the objective restates something a character keeps private");
  });
});
