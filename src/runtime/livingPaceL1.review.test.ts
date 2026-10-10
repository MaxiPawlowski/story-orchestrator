import { parseStoryV2OrThrow, PLAYER_TURNS_KEY, playerTurnsBetween, StoryEngine, type NormalizedStoryV2 } from "@engine/index";
import { EXPANSION_CONTRACT, mergeExpansions, type ExpansionCacheEntry } from "@generation/index";
import { foldOps } from "@generation/living/fold";
import { isEligibleFrontier } from "@generation/living/frontier";
import { buildDirectorOps, checkDirectorOps, planChapter, withoutPace } from "@generation/living/plan";
import type { DirectorDraft, LivingOpPayload } from "@generation/living/types";

const premise = (): Record<string, unknown> => ({
  format: 2, id: "l1-lantern-shop", title: "L1 Lantern Shop", description: "A robbed shop.",
  living: {
    premise: "A lantern-maker's shop in a river town was robbed in the night, and the town watch asks the newcomers to look into it before the morning market opens.",
    cast: ["narrator", "ward", "smith"], autonomy: "auto",
  },
  qualities: [], checkpoints: [], transitions: [],
  roster: [{ id: "narrator", name: "Narrator", view: "omniscient" }, { id: "ward", name: "Ward" }, { id: "smith", name: "Smith" }],
});

const turningPoint = (n: number): DirectorDraft => ({
  anchor: {
    name: n === 1 ? "The Watch at the Door" : `Turning point ${n}`,
    objective: n === 1 ? "The town watch arrives at the newcomers' lodging before dawn and insists the shop must be examined before the market opens." : `The story turns a ${n}th time.`,
    tension: "stirring", snapshot: {}, final: false,
  },
  opensWhen: { kind: "new", key: n === 1 ? "watch_pressed_for_answers" : `turn_${n}_sign`, rubric: "Did the watch press the newcomers for a decision or account of their movements?" },
  newQualities: [], buildsOn: null, newChapter: false, reason: "the open thread",
});

const chainFor = (anchor: string, wayKey: string): ExpansionCacheEntry => ({
  key: `liv_open->${anchor}_way->${anchor}`, status: "validated", contract: EXPANSION_CONTRACT, sourceCheckpointId: "liv_open", stubId: `${anchor}_way`, targetAnchorId: anchor,
  basis: {}, blackboardVersionSum: 0,
  beats: [
    { id: "0", title: "Knocking Before Dawn", objective: "The watch knocks before first light.", guidance: "World pressure.", tension_target: "stirring",
      outcomes: [{ id: "0:0", label: "answered", gate: { q: wayKey, op: "==", v: true }, deltas: [], progress: { anchor, amount: 1 } }] },
    { id: "1", title: "At the Door", objective: "The watch waits at the threshold.", guidance: "Hold the scene.", tension_target: "calm",
      outcomes: [{ id: "1:0", label: "pressed", gate: { q: wayKey, op: "==", v: true }, deltas: [] }] },
  ],
  needsReview: false, verdicts: [], codeCheck: { ok: true, issues: [], progressTotal: 1 }, insertedCheckpointIds: [], lastError: null, attempts: 1, origin: "active", updatedAt: "t",
} as ExpansionCacheEntry);

type Shape = { chain: boolean; pace: boolean };

const stripPace = (ops: LivingOpPayload[]): LivingOpPayload[] =>
  ops.map((op) => (op.kind === "add-transition" ? { ...op, transition: { ...op.transition, gate: withoutPace(op.transition.gate) } } : op));

const play = (shape: Shape, turns = 12) => {
  let raw = premise();
  let story: NormalizedStoryV2 = parseStoryV2OrThrow(raw);
  const chains: Record<string, ExpansionCacheEntry> = {};
  const playerIds: number[] = [];
  const engine = new StoryEngine({
    now: () => 0,
    derive: (view) => (story.qualityByKey[PLAYER_TURNS_KEY]?.source === "code"
      ? [{ q: PLAYER_TURNS_KEY, v: playerTurnsBetween(playerIds, view.checkpointStartedMessageId, view.lastMessageId) }] : []),
  });
  engine.loadStory(story);
  let pending: LivingOpPayload[] | null = null;
  let written = 0;
  const issues: string[] = [];
  let message = 0;
  const graph = () => (shape.chain ? mergeExpansions(raw, chains) : parseStoryV2OrThrow(raw));
  for (let turn = 1; turn <= turns; turn += 1) {
    message += 1;
    const player = message;
    playerIds.push(player);
    for (let reply = 0; reply < 2; reply += 1) {
      message += 1;
      if (pending) {
        raw = foldOps(raw, pending);
        pending = null;
        story = graph();
        engine.replaceGraph(story);
      }
      const reads = story.qualities.filter((quality) => quality.source === "extractor" && quality.type === "bool").map((quality) => ({ q: quality.key, v: false, source: "extractor" as const }));
      if (reads.length) engine.enqueue({ source: "extractor", blackboardVersionSum: 0, turnRange: { from: player, to: message - 1 }, deltas: reads });
      engine.commitBoundary({ lastMessageId: message, chatLength: message + 1, lastPlayerMessageId: player });
      const active = engine.serialize().activeCheckpointId;
      if (!pending && isEligibleFrontier(story, active)) {
        written += 1;
        const built = buildDirectorOps(story, active, turningPoint(written), planChapter(story, active, { sealsOn: true, final: false, newChapter: false }));
        const state = engine.serialize().blackboard;
        issues.push(...checkDirectorOps({ raw, story, frontierId: active, ops: built.ops, values: state.values, latched: state.latched }).issues);
        pending = shape.pace ? built.ops : stripPace(built.ops);
        if (shape.chain && active === "liv_open") chains[`liv_open->${built.anchorId}_way->${built.anchorId}`] = chainFor(built.anchorId, `${built.anchorId}_watch_pressed_for_answers`);
      }
    }
  }
  const visited = engine.serialize().visitedPath;
  return { visited, anchors: visited.filter((id) => /^liv_\d+$/.test(id)), written, issues };
};

describe("v2.8 22 L1 replay (pod 2026-10-10, master f031637b): the way-in gate never reads true", () => {
  it("a bare stub: the opening hands over after the pace and the story reaches two written turning points in 12 turns", () => {
    const run = play({ chain: false, pace: true });
    expect(run.anchors.length).toBeGreaterThanOrEqual(2);
    expect(run.issues).toEqual([]);
    expect(run.visited.slice(0, 4)).toEqual(["liv_open", "liv_1_way", "liv_1", "liv_2_way"]);
  });

  it("a merged bridge whose beats wait on the same never-true reading still reaches two turning points in 12 turns", () => {
    const run = play({ chain: true, pace: true });
    expect(run.visited.slice(0, 2)).toEqual(["liv_open", "gen_liv_1_way_1"]);
    expect(run.anchors.length).toBeGreaterThanOrEqual(2);
  });

  it("control: without the pace fallback (the f031637b ops) the run stays on liv_open for all 12 turns, as on the pod", () => {
    expect(play({ chain: false, pace: false }).visited).toEqual(["liv_open"]);
    expect(play({ chain: true, pace: false }).visited).toEqual(["liv_open"]);
  });
});
