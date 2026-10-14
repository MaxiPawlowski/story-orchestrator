import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Quality } from "@engine/index";
import { buildTypedPlan, readTypedDeltas } from "./extraction";
import type { TypedCase } from "./extractionCalibration";
import {
  J76_MIN_TUNE_ANSWERED, SINGLE_FLOORS, TYPED_KINDS, heldOutVerdict, kindFloorOf, kindRows, replayKindLeg, scoreKindRun, selectKindFloors, typedKindCalls,
  type KindFloors, type KindRow, type TypedKindAnswers,
} from "./typedKindFloors";

const root = join(__dirname, "../../test");
const read = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8"));
const revision = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 12);

interface RecordedCall { id?: string; state: unknown; questions: unknown; answers: TypedKindAnswers extends ReadonlyMap<string, infer A> ? A : never }

const byRequest = (calls: RecordedCall[], cases: TypedCase[]): Map<string, RecordedCall["answers"]> => {
  const recorded = new Map(calls.map((call) => [JSON.stringify([call.state, call.questions]), call.answers]));
  return new Map(typedKindCalls(cases).map((call) => [call.id, recorded.get(JSON.stringify([call.request.state, call.request.questions])) ?? null]));
};

describe("J7.6 Phase A recorded runs (v2.8 13)", () => {
  const tune: { rows: TypedCase[] } = read("fixtures/judge/spike-typed-kinds-tune.json");
  const held: { rows: TypedCase[] } = read("fixtures/judge/spike-typed-kinds.json");
  const frozen = read("fixtures/judge/spike-typed-kinds.floors.json");
  const typed: { rows: TypedCase[] } = read("fixtures/judge/typed.json");

  test("each fixture holds at least 20 rows of every kind, one of each per case", () => {
    for (const fixture of [tune, held]) {
      for (const row of fixture.rows) expect(row.qualities.map((quality) => quality.read_as).sort()).toEqual(["choice", "rating", "stated"]);
      expect(typedKindCalls(fixture.rows)).toHaveLength(fixture.rows.length);
      expect(fixture.rows.length).toBeGreaterThanOrEqual(20);
    }
  });

  test("the frozen floors are what the predeclared rule picks from the tuning split", () => {
    const tuneGolden = read("goldens/judge/spike-typed-kinds-tune.run1.json");
    expect(tuneGolden.fixtureRevision).toBe(revision(tune));
    expect(frozen.heldOutRevision).toBe(revision(held));
    const typedAnswers = byRequest(read("goldens/judge/typed.json").calls, typed.rows);
    const tuneAnswers = byRequest(tuneGolden.calls, tune.rows);
    const selection = selectKindFloors((at) => [...kindRows(typed.rows, typedAnswers, at), ...kindRows(tune.rows, tuneAnswers, at)]);
    expect(selection.floors).toEqual(frozen.floors);
    expect([...typedAnswers.values()].filter((value) => value === null)).toHaveLength(frozen.tuning.typedMissing);
  });

  test.each([1, 2])("held-out run %i replays its exact requests and keeps its recorded verdict", (run) => {
    const golden = read(`goldens/judge/spike-typed-kinds.run${run}.json`);
    expect(golden.fixtureRevision).toBe(revision(held));
    expect(golden.floors).toEqual(frozen.floors);
    const calls = typedKindCalls(held.rows);
    expect(golden.calls.map((call: RecordedCall) => [call.id, call.state, call.questions])).toEqual(calls.map((call) => [call.id, call.request.state, call.request.questions]));
    const answers = byRequest(golden.calls, held.rows);
    const candidate = kindRows(held.rows, answers, frozen.floors);
    const single = kindRows(held.rows, answers, SINGLE_FLOORS);
    for (const kind of TYPED_KINDS) {
      const scored = scoreKindRun(candidate, single, kind);
      expect({ status: scored.status, candidate: scored.candidate, single: scored.single }).toEqual(golden.verdict[kind]);
    }
  });

  test("the held-out verdict: every kind passes x2 on the fixture; nothing moves without its recorded answers", () => {
    const runs = [1, 2].map((run) => {
      const answers = byRequest(read(`goldens/judge/spike-typed-kinds.run${run}.json`).calls, held.rows);
      return { candidate: kindRows(held.rows, answers, frozen.floors), single: kindRows(held.rows, answers, SINGLE_FLOORS) };
    });
    const verdict = heldOutVerdict(frozen.floors, runs);
    expect(TYPED_KINDS.map((kind) => verdict[kind].status)).toEqual(["pass", "pass", "pass"]);
    const empty = kindRows(held.rows, new Map(), frozen.floors);
    expect(TYPED_KINDS.map((kind) => heldOutVerdict(frozen.floors, [{ candidate: empty, single: empty }, { candidate: empty, single: empty }])[kind].status)).toEqual(["insufficient", "insufficient", "insufficient"]);
    expect(heldOutVerdict(frozen.floors, runs.slice(0, 1)).choice.status).toBe("insufficient");
  });
});

const row = (kind: KindRow["kind"], answered: boolean, right: boolean | null, n = 0): KindRow => ({ caseId: `c${n}`, key: `k${n}`, kind, asked: true, answered, right });

describe("J7.6 per-kind floor rules", () => {
  test("the single floors read exactly what production reads, latching bump included", () => {
    const quality: Quality = { key: "door", type: "bool", source: "extractor", rubric: "Is the door open?", read_as: "choice", latching: true };
    expect(kindFloorOf(SINGLE_FLOORS)(quality)).toBeCloseTo(0.9);
    expect(kindFloorOf({ ...SINGLE_FLOORS, choice: 0.5 })(quality)).toBeCloseTo(0.6);
    const held: { rows: TypedCase[] } = read("fixtures/judge/spike-typed-kinds.json");
    const golden = read("goldens/judge/spike-typed-kinds.run1.json");
    const answers = byRequest(golden.calls, held.rows);
    for (const entry of held.rows) {
      const plan = buildTypedPlan(entry.qualities, entry.window, entry.story, entry.prior);
      const recorded = answers.get(entry.id);
      if (!plan || !recorded) continue;
      const production = readTypedDeltas(recorded, plan, entry.qualities, entry.window).answered;
      expect(kindRows([entry], answers, SINGLE_FLOORS).filter((item) => item.answered).map((item) => item.key)).toEqual(production);
    }
  });

  test("selection takes the lowest grid floor that holds 0.95 on enough answered rows, else the single floor", () => {
    const rowsAt = (floors: KindFloors) => [
      ...Array.from({ length: 12 }, (_, n) => row("choice", true, true, n)),
      ...Array.from({ length: 12 }, (_, n) => row("stated", floors.stated >= 0.7, floors.stated >= 0.7 || n > 2, n)),
      ...Array.from({ length: J76_MIN_TUNE_ANSWERED - 1 }, (_, n) => row("rating", true, true, n)),
    ];
    const selection = selectKindFloors(rowsAt);
    expect(selection.floors).toEqual({ choice: 0.5, stated: 0.7, rating: SINGLE_FLOORS.rating });
    expect(selection.kinds.rating.moved).toBe(false);
    expect(selection.kinds.choice.moved).toBe(true);
  });

  test("a run fails below 0.95 and is insufficient below 15 answered or 20 rows", () => {
    const fill = (answered: number, wrong: number, total = 20) => Array.from({ length: total }, (_, n) => row("choice", n < answered, n < answered ? n >= wrong : null, n));
    expect(scoreKindRun(fill(20, 0), [], "choice").status).toBe("pass");
    expect(scoreKindRun(fill(20, 2), [], "choice").status).toBe("fail");
    expect(scoreKindRun(fill(14, 0), [], "choice").status).toBe("insufficient");
    expect(scoreKindRun(fill(19, 0, 19), [], "choice").status).toBe("insufficient");
  });

  test("the replay leg hands back keys under a raised floor and flags a lowered one as unseen", () => {
    const keys = [
      { readAs: "rating", confidence: 0.82, latching: false, class: "agree" },
      { readAs: "rating", confidence: 0.92, latching: false, class: "disagree" },
      { readAs: "choice", confidence: 0.85, latching: true, class: "judge-moved" },
      { readAs: "stated", confidence: null, latching: false, class: "agree" },
    ];
    const leg = replayKindLeg(keys, { choice: 0.8, stated: 0.5, rating: 0.9 });
    expect(leg.rating).toMatchObject({ keys: 2, keptAtCandidate: 1, handedBack: 1, differAll: 1, differKept: 1, unseenBelowSingle: false });
    expect(leg.choice).toMatchObject({ keptAtCandidate: 0, handedBack: 1 });
    expect(leg.stated).toMatchObject({ withConfidence: 0, keptAtCandidate: 1, unseenBelowSingle: true });
  });
});
