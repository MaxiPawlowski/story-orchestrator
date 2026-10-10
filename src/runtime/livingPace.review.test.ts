import { readFileSync } from "fs";
import { join } from "path";
import { parseStoryV2, parseStoryV2OrThrow, StoryEngine, type EngineState, type GateNode, type NormalizedStoryV2 } from "@engine/index";
import { EXPANSION_CONTRACT, mergeExpansions, type ExpansionCacheEntry, type ExpansionRuntimeState } from "@generation/index";
import { projectLivingExport } from "@generation/living/export";
import { foldOps } from "@generation/living/fold";
import { buildDirectorOps, planChapter } from "@generation/living/plan";
import type { DirectorDraft, LivingOpPayload } from "@generation/living/types";
import { ExpansionCoordinator, LIVING_STUB_ATTEMPTS } from "./coordinators/expansionCoordinator";
import { testOwnership } from "../../test/findings/testOwnership";

const premise = (): Record<string, unknown> => JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/living-premise.story.json"), "utf8"));

const draft: DirectorDraft = {
  anchor: { name: "The Watch at the Door", objective: "The town watch brings the newcomers to the lantern shop's splintered back door.", tension: "stirring", snapshot: {}, final: false },
  opensWhen: { kind: "new", key: "entered_shop", rubric: "Has the player gone into the lantern shop?" },
  newQualities: [],
  buildsOn: null,
  newChapter: false,
  reason: "the robbery is the open thread",
};

const written = () => {
  const raw = premise();
  const story = parseStoryV2OrThrow(raw);
  const built = buildDirectorOps(story, "liv_open", draft, planChapter(story, "liv_open", { sealsOn: true, final: false, newChapter: false }));
  const folded = foldOps(raw, built.ops);
  return { raw: folded, story: parseStoryV2OrThrow(folded), ops: built.ops };
};

const chain = (status: ExpansionCacheEntry["status"], attempts = 1): ExpansionCacheEntry => ({
  key: "liv_open->liv_1_way->liv_1", status, contract: EXPANSION_CONTRACT, sourceCheckpointId: "liv_open", stubId: "liv_1_way", targetAnchorId: "liv_1",
  basis: {}, blackboardVersionSum: 0,
  beats: [
    { id: "0", title: "Knock at the Door", objective: "A watchman knocks before dawn and asks the newcomers to walk the shop.", guidance: "Urgent, not hostile.", tension_target: "stirring",
      outcomes: [{ id: "0:0", label: "success", gate: { q: "liv_1_entered_shop", op: "==", v: true }, deltas: [{ q: "progress_toward_liv_1", v: 1 }], progress: { anchor: "liv_1", amount: 1 } }] },
    { id: "1", title: "The Lantern Shop", objective: "The shop with its forced shutters and empty strongbox niche.", guidance: "The watchman waits at the door.", tension_target: "stirring",
      outcomes: [{ id: "1:0", label: "success", gate: { q: "liv_1_entered_shop", op: "==", v: true }, deltas: [] }] },
  ],
  needsReview: false, verdicts: [], codeCheck: { ok: true, issues: [], progressTotal: 1 }, insertedCheckpointIds: ["gen_liv_1_way_1", "gen_liv_1_way_2"],
  lastError: null, attempts, origin: "active", updatedAt: "t",
} as ExpansionCacheEntry);

const walk = (story: NormalizedStoryV2) => {
  const engine = new StoryEngine({ now: () => 0 });
  engine.loadStory(story);
  let message = 0;
  const commit = () => { message += 2; return engine.commitBoundary({ lastMessageId: message, chatLength: message + 1 }); };
  const read = (q: string, v: boolean) => engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q, v, source: "extractor" }] });
  return { engine, commit, read, active: () => engine.serialize().activeCheckpointId };
};

describe("v2.8 22 L1 pace: a premise story reaches its written turning points", () => {
  it("a bridge merged into a premise story keeps the synthesised opening (L1 run 1: 'unknown checkpoint liv_open')", () => {
    const { raw } = written();
    const merged = mergeExpansions(raw, { [chain("validated").key]: chain("validated") });
    expect(merged.checkpointById.liv_open).toMatchObject({ start: true });
    expect(merged.outgoingByCheckpoint.liv_open.map((transition) => transition.to)).toEqual(["gen_liv_1_way_1"]);
    const walked = walk(merged);
    walked.read("liv_1_entered_shop", true);
    walked.commit();
    expect(walked.active()).toBe("gen_liv_1_way_1");
    walked.commit();
    walked.commit();
    expect(walked.active()).toBe("liv_1");
  });

  it("control: an authored, non-generated checkpoint still turns the synthesised opening off", () => {
    const raw = { ...premise(), checkpoints: [{ id: "harbour", name: "Harbour", objective: "The harbour at dusk.", type: "anchor", start: true }] };
    const parsed = parseStoryV2(raw);
    expect(Array.isArray(parsed)).toBe(false);
    if (Array.isArray(parsed)) return;
    expect(parsed.checkpointById.liv_open).toBeUndefined();
  });

  it("a player who opens the way before the bridge exists is not trapped in the bare stub: the turning point opens on the next boundary", () => {
    const { story } = written();
    const walked = walk(story);
    walked.read("liv_1_entered_shop", true);
    walked.commit();
    expect(walked.active()).toBe("liv_1_way");
    walked.commit();
    expect(walked.active()).toBe("liv_1");
  });

  it("control: the old progress-only stub exit left that player in the stub for good", () => {
    const { ops } = written();
    const progressOnly: GateNode = { q: "progress_toward_liv_1", op: ">=", v: 1 };
    const old = ops.map((op): LivingOpPayload => (op.kind === "add-transition" && op.transition.from === "liv_1_way" ? { ...op, transition: { ...op.transition, gate: progressOnly } } : op));
    const walked = walk(parseStoryV2OrThrow(foldOps(premise(), old)));
    walked.read("liv_1_entered_shop", true);
    for (let turn = 0; turn < 10; turn += 1) walked.commit();
    expect(walked.active()).toBe("liv_1_way");
  });

  it("a failed bridge toward a director stub is asked again on the next boundary, up to the cap; an authored stub's failure is not", () => {
    const { story } = written();
    const rigged = (entry: ExpansionCacheEntry | null, subject: NormalizedStoryV2 = story) => {
      const store: ExpansionRuntimeState = { entries: entry ? { [entry.key]: entry } : {}, scheduler: { queueDepth: 0, inFlight: false, lastError: null } };
      const coordinator = new ExpansionCoordinator({
        hosts: { player: { getPlayerName: () => "Max" } },
        getStory: () => subject,
        getStoryRaw: () => ({}),
        getState: () => ({ activeCheckpointId: subject.startCheckpointId ?? "liv_open", blackboard: { values: {}, versions: {}, latched: {} } }) as unknown as EngineState,
        getExpansion: () => store,
        model: (async () => ({ text: "", finish: "stop" })) as never,
        getCanon: () => "",
        getFactTexts: () => [],
        replaceStory: () => undefined,
        setStatus: () => undefined,
        persist: async () => undefined,
        notify: () => undefined,
        ownership: testOwnership(),
      } as never);
      const reasons: string[] = [];
      coordinator.scheduleForActive((reason) => { reasons.push(reason); });
      return reasons;
    };
    expect(rigged({ ...chain("failed"), beats: [], lastError: "transitions.1.from: unknown checkpoint 'liv_open'" })).toEqual(["expand:liv_1_way"]);
    expect(rigged({ ...chain("failed", LIVING_STUB_ATTEMPTS - 1), beats: [] })).toEqual(["expand:liv_1_way"]);
    expect(rigged({ ...chain("failed", LIVING_STUB_ATTEMPTS), beats: [] })).toEqual([]);
    expect(rigged({ ...chain("validated"), beats: [] })).toEqual([]);
    const authored = parseStoryV2OrThrow({
      format: 2, id: "authored", title: "Authored", description: "",
      qualities: [{ key: "done", type: "bool", source: "extractor", rubric: "Done?" }],
      checkpoints: [
        { id: "a", name: "A", objective: "Start.", type: "anchor", start: true },
        { id: "s0", name: "S0", objective: "Bridge.", type: "intermediate" },
        { id: "b", name: "B", objective: "End.", type: "anchor" },
      ],
      transitions: [
        { from: "a", to: "s0", priority: 1, gate: { q: "done", op: "==", v: true } },
        { from: "s0", to: "b", priority: 1, gate: { q: "progress_toward_b", op: ">=", v: 1 } },
      ],
      roster: [],
    });
    const failedAuthored = { ...chain("failed"), key: "a->s0->b", sourceCheckpointId: "a", stubId: "s0", targetAnchorId: "b", beats: [] };
    expect(rigged(failedAuthored, authored)).toEqual([]);
  });

  it("Save as story from inside the stub or a bridge beat keeps the turning point the player is heading into (L1 run 1: no saved line)", () => {
    const { raw, story } = written();
    for (const where of ["liv_1_way", "gen_liv_1_way_2"]) {
      const out = projectLivingExport(raw, story, { reached: new Set(["liv_open", where]), includeUnreached: false, id: "x", title: "x" });
      expect({ where, ok: out.ok }).toEqual({ where, ok: true });
      if (!out.ok) continue;
      expect(out.raw.checkpoints.map((checkpoint) => checkpoint.id)).toEqual(["liv_open", "liv_1_way", "liv_1"]);
      expect(() => parseStoryV2OrThrow(out.raw)).not.toThrow();
    }
    const atOpening = projectLivingExport(raw, story, { reached: new Set(["liv_open"]), includeUnreached: false, id: "x", title: "x" });
    expect(atOpening.ok && atOpening.raw.checkpoints.map((checkpoint) => checkpoint.id)).toEqual(["liv_open", "liv_next_1_way", "liv_next_1"]);
  });
});
