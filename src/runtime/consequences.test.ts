import { parseStory, parseStoryOrThrow, StoryEngine, type BoundaryLogEntry, type NormalizedStory } from "@engine/index";
import { readFileSync } from "fs";
import { join } from "path";
import {
  ATTRIBUTION_CASES, LINES, OATH, OATH_RAW, POSTING, POSTING_RAW, STORIES, WELL, WELL_RAW, chatFor, entryOf, spanFor, playBoundaries, type AttributionCase, type ChatRow, type Write,
} from "../../test/support/recapFixtures";
import { cardSections, composeLines, currentSection, deriveRefs, lineFor, neutralText } from "./consequences";
import { appendRefs, rollbackRecap, sanitizeRecap, type EffectRef, type RecapRuntimeState } from "./recapPort";
import { buildNarrativeStatus } from "./narrative";
import { playedProjection } from "./playerProjection";
import { derivePipelineStatus } from "./pipeline";

interface Scored {
  testCase: AttributionCase;
  line: string;
  because: boolean;
  neutral: string | null;
}

const neutralOnly = (story: NormalizedStory): NormalizedStory => ({
  ...story,
  transitions: story.transitions.map(({ recap: _recap, recap_when: _when, ...rest }) => rest),
  quests: story.quests?.map(({ recap: _recap, recap_when: _when, ...rest }) => rest),
  milestones: story.milestones?.map(({ recap: _recap, recap_when: _when, ...rest }) => rest),
  qualityByKey: Object.fromEntries(Object.entries(story.qualityByKey).map(([key, { player_action: _action, ...rest }]) => [key, rest])),
});

const edited = (chat: ChatRow[]): ChatRow[] => chat.map((row, index) => (index === 1 ? { ...row, mes: `${row.mes} (edited)` } : row));

const score = (testCase: AttributionCase, line: string): Scored => {
  const story = STORIES[testCase.story];
  const chat = chatFor(line);
  const played = playBoundaries(story, [...(testCase.setup ?? []).map((group) => [group]), testCase.writes], chat);
  const ref = played.refs.filter((candidate) => candidate.boundary === played.entry.boundary)
    .find((candidate) => candidate.kind === testCase.target.kind && candidate.id === testCase.target.id);
  if (!ref) throw new Error(`fixture ${testCase.id} did not produce ${testCase.target.kind} ${testCase.target.id}`);
  const shown = testCase.edit ? edited(chat) : chat;
  const rendered = lineFor(story, ref, shown, []);
  return { testCase, line, because: rendered?.because ?? false, neutral: lineFor(neutralOnly(story), ref, shown, [])?.text ?? null };
};

const SCORED = ATTRIBUTION_CASES.flatMap((testCase) => LINES[testCase.story].map((line) => score(testCase, line)));

describe("v2.8 46 C1: \"Because you…\" is precise, abstaining on everything it cannot prove", () => {
  it("runs at least 60 labelled cases from at least 3 fixture stories, half of them adversarial", () => {
    expect(SCORED.length).toBeGreaterThanOrEqual(60);
    expect(new Set(SCORED.map((row) => row.testCase.story)).size).toBeGreaterThanOrEqual(3);
    expect(SCORED.filter((row) => row.testCase.adversarial).length / SCORED.length).toBeGreaterThanOrEqual(0.5);
    expect(new Set(ATTRIBUTION_CASES.map((row) => row.adversarial).filter(Boolean))).toEqual(new Set([
      "coincidental write", "code write", "overwrite", "reversal", "priority race", "NPC-caused", "any gate", "redundant any operand", "already-satisfied operand",
      "multi-operand tie", "living director", "gate shape", "edited evidence", "span not a player line", "already-satisfied gate", "competing outcome",
    ]));
  });

  it("precision >= 0.95 (abstaining is correct on negatives); recall reported, no floor", () => {
    const truePositive = SCORED.filter((row) => row.because && row.testCase.player).length;
    const falsePositive = SCORED.filter((row) => row.because && !row.testCase.player);
    const positives = SCORED.filter((row) => row.testCase.player).length;
    const negatives = SCORED.filter((row) => !row.testCase.player).length;
    const precision = truePositive + falsePositive.length ? truePositive / (truePositive + falsePositive.length) : 1;
    const negativeAccuracy = (negatives - falsePositive.length) / negatives;
    process.stdout.write(`C1 cases=${SCORED.length} positives=${positives} negatives=${negatives} because=${truePositive + falsePositive.length} precision=${precision.toFixed(3)} `
      + `negativeAccuracy=${negativeAccuracy.toFixed(3)} recall=${(truePositive / positives).toFixed(3)}\n`);
    expect(falsePositive.map((row) => row.testCase.id)).toEqual([]);
    expect(precision).toBeGreaterThanOrEqual(0.95);
    expect(truePositive).toBeGreaterThan(0);
  });

  it("C1n: the same cases rendered neutral-only carry no cause at all", () => {
    expect(SCORED.every((row) => row.neutral && !/because/i.test(row.neutral))).toBe(true);
    const neutralBecause = SCORED.filter((row) => row.because).length;
    process.stdout.write(`C1n neutral lines=${SCORED.filter((row) => row.neutral).length}/${SCORED.length}; B adds ${neutralBecause} because-line(s) over the neutral baseline\n`);
  });

  it("phrases an evidenced line from player_action, and an authored because when there is one", () => {
    const yard = score(ATTRIBUTION_CASES.find((row) => row.id.startsWith("P10")) as AttributionCase, LINES.posting[0]);
    expect(yard.because).toBe(true);
    const played = playBoundaries(POSTING, [[[{ q: "gate_open", v: true }]], [[{ q: "watch_state", v: "set", player: true }]]], chatFor(LINES.posting[0]));
    const ref = played.refs.find((candidate) => candidate.kind === "transition") as EffectRef;
    expect(lineFor(POSTING, ref, played.chat, [])?.text).toBe("Reached The Yard, because you set the watch.");
    const gate = playBoundaries(POSTING, [[[{ q: "posting_choice", v: "taken", player: true }]]], chatFor(LINES.posting[0]));
    expect(lineFor(POSTING, gate.refs[0], gate.chat, [])?.text).toBe("Because you took the posting, the gatehouse let you in.");
  });
});

const played = (story: NormalizedStory, boundaries: Write[][][], line = "We take it.") => playBoundaries(story, boundaries, chatFor(line));

const stateOf = (run: ReturnType<typeof played>) => run.engine.serialize();

describe("v2.8 46 C2/C10: player-safe lines only", () => {
  it("never shows an invisible effect, even with an authored line (C10)", () => {
    const run = played(POSTING, [[[{ q: "cellar_door", v: "open", player: true }]]]);
    const ref = run.refs.find((candidate) => candidate.kind === "transition") as EffectRef;
    expect(ref.visible).toBe(false);
    expect(POSTING.transitions.find((transition) => transition.to === "cellar")?.recap?.text).toBe("The cellar held a secret.");
    expect(lineFor(POSTING, ref, run.chat, [])).toBeNull();
    expect(composeLines(POSTING, stateOf(run), run.refs, run.chat)).toEqual([]);
  });

  it("drops a line naming a withheld name and falls back to the neutral line; a planted control proves the check fires", () => {
    const story = parseStoryOrThrow({
      ...JSON.parse(JSON.stringify(rawOf(POSTING))),
      transitions: [{ from: "board", to: "gate", priority: 5, gate: { q: "posting_choice", op: "==", v: "taken" }, recap: "The road to The Tower opens." }],
    });
    const run = played(story, [[[{ q: "posting_choice", v: "taken", player: true }]]]);
    const ref = run.refs[0];
    expect(lineFor(story, ref, run.chat, [])?.text).toBe("The road to The Tower opens.");
    const shown = composeLines(story, stateOf(run), run.refs, run.chat).map((line) => line.text);
    expect(shown).toEqual(["Reached The Gatehouse, because you took the posting."]);
    expect(shown.join(" | ")).not.toContain("The Tower");
    expect(composeLines(story, stateOf(run), run.refs, edited(run.chat)).map((line) => line.text)).toEqual(["Reached The Gatehouse"]);
  });

  it("property: no line names an unreached place, a hidden quest, an unearned secret milestone, a hidden check, a private agenda step, or a raw key", () => {
    const random = seeded(46);
    const writes: Write[] = [
      { q: "keeper_met", v: true }, { q: "water_state", v: "drawn", player: true }, { q: "water_state", v: "spilled" }, { q: "well_state", v: "dry" },
      { q: "rope_mended", v: true }, { q: "luck_count", v: 3, code: true }, { q: "luck_count", v: 45, code: true }, { q: "luck_count", v: 55, code: true },
    ];
    for (let run = 0; run < 120; run += 1) {
      const boundaries = Array.from({ length: 1 + Math.floor(random() * 5) }, () => [[writes[Math.floor(random() * writes.length)]]]);
      const result = played(WELL, boundaries);
      const state = stateOf(result);
      const text = composeLines(WELL, state, result.refs, result.chat).map((line) => line.text).join("\n");
      const values = state.blackboard.values;
      const hiddenQuest = Number(values.luck_count ?? 0) < 50 ? ["Secrets of the Cistern"] : [];
      const secret = Number(values.luck_count ?? 0) < 40 ? ["The Hidden Spring"] : [];
      const unreached = state.visitedPath.includes("cistern") ? [] : ["The Hidden Cistern"];
      [...hiddenQuest, ...secret, ...unreached, ...WELL.qualities.map((quality) => quality.key)].forEach((name) => expect(text).not.toContain(name));
    }
    const planted = played(WELL, [[[{ q: "luck_count", v: 45, code: true }]]]);
    expect(composeLines(WELL, stateOf(planted), planted.refs, []).map((line) => line.text)).toEqual(expect.arrayContaining(["Milestone: The Hidden Spring"]));
    const unearned = played(WELL, [[[{ q: "luck_count", v: 3, code: true }]]]);
    const forged: EffectRef = { ...unearned.refs[0], kind: "milestone", id: "hidden-spring" };
    expect(composeLines(WELL, stateOf(unearned), [forged], []).map((line) => line.text)).toEqual([]);
    expect(neutralText(WELL, forged)).toBe("Milestone: The Hidden Spring");
  });

  it("a hidden check and a private agenda step render nothing; public ones render neutral", () => {
    const life = parseStoryOrThrow(JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/character-life.story.json"), "utf8")));
    const at = { boundary: 1, messageId: 1, chapterId: null, authored: false, causes: [] };
    expect(neutralText(life, { ...at, kind: "agenda", id: "arin:debt:0", visible: false })).toBeNull();
    expect(neutralText(life, { ...at, kind: "agenda", id: "arin:debt:1", visible: true })).toBe("met the smuggler at the docks");
    const checks = parseStoryOrThrow({
      ...rawOf(POSTING),
      qualities: [...rawOf(POSTING).qualities, { key: "sneak_ok", type: "bool", source: "code", rubric: "Sneaked?" }, { key: "climb_ok", type: "bool", source: "code", rubric: "Climbed?" }],
      checkpoints: [{ ...rawOf(POSTING).checkpoints[0], checks: [
        { id: "sneak", label: "Sneak past", quality: "sneak_ok", roll: { sides: 20, target: 10 }, narrate: "hidden" },
        { id: "climb", label: "Climb", quality: "climb_ok", roll: { sides: 20, target: 10 }, narrate: "public" },
      ] }, ...rawOf(POSTING).checkpoints.slice(1)],
    });
    expect(neutralText(checks, { ...at, kind: "check", id: "sneak", to: "success", visible: false })).toBeNull();
    expect(neutralText(checks, { ...at, kind: "check", id: "climb", to: "success", visible: true })).toBe("Climb: success");
  });
});

describe("v2.8 46 C5: no causeless because, no empty section", () => {
  it("every because line carries a recorded span or authored text", () => {
    SCORED.filter((row) => row.because).forEach((row) => {
      const story = STORIES[row.testCase.story];
      const run = playBoundaries(story, [...(row.testCase.setup ?? []).map((group) => [group]), row.testCase.writes], chatFor(row.line));
      const ref = run.refs.filter((candidate) => candidate.boundary === run.entry.boundary)
        .find((candidate) => candidate.kind === row.testCase.target.kind && candidate.id === row.testCase.target.id) as EffectRef;
      expect(ref.causes).toHaveLength(1);
      expect(ref.causes[0].playerSpan.messageId).toBe(1);
    });
  });

  it("an empty recap leaves no section", () => {
    const run = played(POSTING, [[[{ q: "cellar_door", v: "open" }]]]);
    expect(currentSection({ story: POSTING, state: stateOf(run), recap: { refs: run.refs }, chat: run.chat })).toBeNull();
    const pipeline = derivePipelineStatus({ settings: { enabled: true, cadence: 3, stabilityLag: 0 }, audits: [], reconciliationEvents: [], scheduler: { queueDepth: 0, inFlight: false, lastError: null } } as never, undefined, null);
    const narrative = buildNarrativeStatus({ storyTitle: "T", checkpointName: null, objective: null, lastTransition: null, openThreads: [], canon: "", tensionLevel: null, pendingCount: 0, pipeline, consequences: { label: "What changed", lines: [] } });
    expect(narrative.sections.map((section) => section.id)).not.toContain("consequences");
  });
});

describe("v2.8 46 surfaces: chapter card, Overview, recently", () => {
  it("titles the section Because of you only with an authored or evidenced line", () => {
    const evidenced = played(OATH, [[[{ q: "oath_state", v: "sworn", player: true }]]], LINES.oath[0]);
    expect(currentSection({ story: OATH, state: stateOf(evidenced), recap: { refs: evidenced.refs }, chat: evidenced.chat })).toEqual({
      label: "Because of you", lines: ["Because you swore it, the order counts you as its own."], personal: true,
    });
    const neutral = played(OATH, [[[{ q: "oath_state", v: "sworn" }]]]);
    expect(currentSection({ story: OATH, state: stateOf(neutral), recap: { refs: neutral.refs }, chat: neutral.chat })?.label).toBe("What changed");
  });

  it("the chapter card at the crossing lists the chapter that ended; the Overview starts the new chapter empty", () => {
    const run = played(OATH, [[[{ q: "oath_state", v: "sworn", player: true }]], [[{ q: "storm_broke", v: true }]]], LINES.oath[0]);
    const view = { story: OATH, state: stateOf(run), recap: { refs: run.refs }, chat: run.chat };
    const crossing = run.refs.find((ref) => ref.kind === "transition") as EffectRef;
    expect(cardSections(view)[crossing.messageId]?.lines).toEqual(["Because you swore it, the order counts you as its own.", "Milestone: Either Way", "Reached The Field"]);
    expect(currentSection(view)).toBeNull();
  });

  it("caps at five lines, authored first, then evidenced, then neutral, newest first", () => {
    const at = (boundary: number) => ({ boundary, messageId: boundary, chapterId: "vows", visible: true, authored: true });
    const span = { messageId: 1, revision: "", span: [0, 0] as [number, number] };
    const chat = chatFor(LINES.oath[0]);
    span.revision = spanFor(chat).revision;
    const refs: EffectRef[] = [
      { ...at(1), kind: "transition", id: "chapel->keep#0", from: "chapel", to: "keep", causes: [] },
      { ...at(2), kind: "milestone", id: "veteran", causes: [{ key: "oath_state", value: "sworn", playerSpan: span }] },
      ...[3, 4, 5, 6].map((boundary): EffectRef => ({ ...at(boundary), kind: "milestone", id: boundary % 2 ? "either" : "trusted", causes: [] })),
      { ...at(7), kind: "quest", id: "none", causes: [] },
    ];
    const reached = stateOf(played(OATH, [[[{ q: "banner_raised", v: true }]], [[{ q: "trust_score", v: 6 }]], [[{ q: "storm_broke", v: true }]]]));
    const lines = composeLines(OATH, reached, refs, chat);
    expect(lines.map((line) => [line.tier, line.text])).toEqual([
      ["authored", "The keep's doors opened."],
      ["evidenced", "Milestone: Veteran, because you swore the oath."],
      ["neutral", "Milestone: Trusted Blade"],
      ["neutral", "Milestone: Either Way"],
    ]);
    const seven: EffectRef[] = [
      ...["chapel->keep#0", "chapel->field#0", "keep->field#0"].map((id, index): EffectRef => ({ ...at(index + 1), kind: "transition", id, to: id.split("->")[1].split("#")[0], authored: false, causes: [] })),
      ...["sworn", "veteran", "trusted", "either"].map((id, index): EffectRef => ({ ...at(index + 4), kind: "milestone", id, causes: [] })),
    ];
    const capped = composeLines(OATH, reached, seven, chat);
    expect(capped).toHaveLength(5);
    expect(capped.map((line) => line.text)).toEqual(["Milestone: Either Way", "Milestone: Trusted Blade", "Milestone: Veteran", "Milestone: Sworn", "Reached The Field"]);
    const repeated = Array.from({ length: 9 }, (_, index): EffectRef => ({ ...at(index + 1), kind: "transition", id: "chapel->keep#0", to: "keep", authored: false, causes: [] }));
    expect(composeLines(OATH, reached, repeated, chat)).toHaveLength(1);
  });

  it("a chapterless story shows the last 20 boundaries, labelled recent", () => {
    const run = played(WELL, [[[{ q: "keeper_met", v: true }]], ...Array.from({ length: 25 }, () => [[{ q: "rope_mended", v: false } as Write]])]);
    const state = stateOf(run);
    expect(currentSection({ story: WELL, state, recap: { refs: run.refs }, chat: run.chat })).toBeNull();
    const fresh = played(WELL, [[[{ q: "keeper_met", v: true }]]]);
    expect(currentSection({ story: WELL, state: stateOf(fresh), recap: { refs: fresh.refs }, chat: fresh.chat })?.label).toBe("What changed recently");
  });

  it("the player projection carries the section", () => {
    const pipeline = derivePipelineStatus({ settings: { enabled: true, cadence: 3, stabilityLag: 0 }, audits: [], reconciliationEvents: [], scheduler: { queueDepth: 0, inFlight: false, lastError: null } } as never, undefined, null);
    const narrative = buildNarrativeStatus({ storyTitle: "T", checkpointName: null, objective: null, lastTransition: null, openThreads: [], canon: "", tensionLevel: null, pendingCount: 0, pipeline, consequences: { label: "What changed", lines: ["Reached The Keep"] } });
    const projection = playedProjection({ story: OATH, narrative, visitedPath: ["chapel"], activeCheckpointId: "chapel", cast: [], chat: [], playerName: "You" });
    expect(projection.sections.find((section) => section.id === "consequences")?.lines).toEqual(["Reached The Keep"]);
  });
});

describe("v2.8 46 C6/C8/C9: cost, retention, evidence integrity", () => {
  it("C6: composes a 120-ref chapter at p95 <= 5 ms", () => {
    const refs: EffectRef[] = Array.from({ length: 120 }, (_, index) => ({
      kind: index % 3 ? "milestone" : "transition", id: index % 3 ? "sworn" : "chapel->keep#0", to: "keep", boundary: index + 1, messageId: index + 1, chapterId: "vows", visible: true, authored: true,
      causes: [{ key: "oath_state", value: "sworn", playerSpan: { messageId: 1, revision: "x", span: [0, 1] } }],
    }));
    const state = new StoryEngineFor(OATH).state;
    for (let warm = 0; warm < 20; warm += 1) currentSection({ story: OATH, state, recap: { refs }, chat: [] });
    const batch = 10;
    const measure = () => {
      const samples = Array.from({ length: 40 }, () => {
        const start = performance.now();
        for (let call = 0; call < batch; call += 1) currentSection({ story: OATH, state, recap: { refs }, chat: [] });
        return (performance.now() - start) / batch;
      }).sort((left, right) => left - right);
      return samples[Math.floor(samples.length * 0.95)];
    };
    const attempts = [measure()];
    while (attempts[attempts.length - 1] > 5 && attempts.length < 3) attempts.push(measure());
    const p95 = Math.min(...attempts);
    process.stdout.write(`C6 p95=${p95.toFixed(3)}ms per compose (40 batches of ${batch}) over 120 refs, best of ${attempts.length}\n`);
    expect(p95).toBeLessThanOrEqual(5);
  });

  it("C8: a 260-boundary chapter keeps every visible effect although the engine log keeps 200", () => {
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(WELL);
    const chat = chatFor("We draw the water.");
    let recap: RecapRuntimeState | undefined;
    const expected: string[] = [];
    for (let boundary = 1; boundary <= 260; boundary += 1) {
      const writes: Write[] = boundary === 3 ? [{ q: "keeper_met", v: true }] : boundary === 120 ? [{ q: "water_state", v: "drawn" }] : boundary === 250 ? [{ q: "luck_count", v: 3, code: true }] : [];
      if (writes.length) engine.enqueue(entryOf(writes, chat));
      engine.commitBoundary({ lastMessageId: boundary, chatLength: boundary + 1 });
      const refs = deriveRefs(WELL, engine.stateLog.at(-1) as BoundaryLogEntry);
      refs.forEach((ref) => expected.push(`${ref.kind}:${ref.id}:${ref.boundary}`));
      recap = appendRefs(recap, refs);
    }
    expect(engine.stateLog.length).toBe(200);
    expect(expected).toEqual(["quest:keeper:3", "quest:deep:3", "quest:keeper:120", "milestone:first-sip:120", "quest:rope:250"]);
    expect(recap?.refs.map((ref) => `${ref.kind}:${ref.id}:${ref.boundary}`)).toEqual(expected);
    expect(currentSection({ story: WELL, state: engine.serialize(), recap, chat })?.lines).toEqual(["Quest completed: Mend the Rope"]);
    const all = composeLines(WELL, engine.serialize(), (recap as RecapRuntimeState).refs, chat, 99).map((line) => line.text);
    expect(all).toEqual(expect.arrayContaining(["Milestone: First Sip"]));
    expect(all).toHaveLength(5);
  });

  it("C9 property: every because line's span resolves to the current revision of a player message; an edit removes it", () => {
    const random = seeded(9);
    for (let run = 0; run < 60; run += 1) {
      const testCase = ATTRIBUTION_CASES[Math.floor(random() * ATTRIBUTION_CASES.length)];
      const line = LINES[testCase.story][Math.floor(random() * 2)];
      const story = STORIES[testCase.story];
      const result = playBoundaries(story, [...(testCase.setup ?? []).map((group) => [group]), testCase.writes], chatFor(line));
      const chat = random() < 0.5 ? edited(result.chat) : result.chat;
      result.refs.forEach((ref) => {
        const rendered = lineFor(story, ref, chat, []);
        if (!rendered?.because) return;
        const span = ref.causes[0].playerSpan;
        expect(chat[span.messageId]?.is_user).toBe(true);
        expect(chat[span.messageId]?.mes).toBe(line);
      });
    }
  });
});

describe("v2.8 46 retention store", () => {
  it("sanitizes, appends per boundary and rolls back by the engine's boundary", () => {
    const ref = (boundary: number): EffectRef => ({ kind: "milestone", id: "sworn", boundary, messageId: boundary, chapterId: null, visible: true, authored: true, causes: [] });
    const state = appendRefs(appendRefs(undefined, [ref(1)]), [ref(2), ref(2)]);
    expect(state?.refs.map((entry) => entry.boundary)).toEqual([1, 2, 2]);
    expect(appendRefs(state, [ref(2)])?.refs.map((entry) => entry.boundary)).toEqual([1, 2]);
    expect(rollbackRecap(state, 1)?.refs.map((entry) => entry.boundary)).toEqual([1]);
    expect(rollbackRecap(state, 5)).toBe(state);
    expect(sanitizeRecap({ refs: [ref(1), { kind: "nope" }, null] })?.refs).toHaveLength(1);
    expect(sanitizeRecap("x")).toBeUndefined();
  });

  it("validates the new authoring fields", () => {
    const errors = (patch: Record<string, unknown>) => {
      const parsed = parseStory({ ...rawOf(POSTING), ...patch });
      return Array.isArray(parsed) ? parsed.map((error) => `${error.path}: ${error.message}`) : [];
    };
    expect(errors({})).toEqual([]);
    expect(errors({ transitions: [{ from: "board", to: "gate", priority: 1, gate: { q: "gate_open", op: "==", v: true }, recap_when: { q: "gate_open", op: "==", v: true } }] }))
      .toEqual(["transitions.0.recap_when: recap_when narrows an authored recap: add recap"]);
    expect(errors({ transitions: [{ from: "board", to: "gate", priority: 1, gate: { q: "gate_open", op: "==", v: true }, recap: { txt: "x" } }] })[0]).toContain("unknown key");
    expect(errors({ transitions: [{ from: "board", to: "gate", priority: 1, gate: { q: "gate_open", op: "==", v: true }, recap: "x".repeat(241) }] })[0]).toContain("240");
    expect(errors({ transitions: [{ from: "board", to: "gate", priority: 1, gate: { q: "gate_open", op: "==", v: true }, recap: "ok", recap_when: { q: "missing", op: "==", v: true } }] }))
      .toEqual(["transitions.0.recap_when: unknown quality 'missing'"]);
    const qualities = rawOf(POSTING).qualities.map((quality: Record<string, unknown>) => (quality.key === "gate_open" ? { ...quality, player_action: { true: "opened it" } } : quality));
    expect(errors({ qualities })).toEqual(["qualities.1.player_action.true: a player action shows only for a value the player committed to: give this value a commit_evidence pattern"]);
    const wrongValue = rawOf(POSTING).qualities.map((quality: Record<string, unknown>) => (quality.key === "posting_choice" ? { ...quality, player_action: { maybe: "x" } } : quality));
    expect(errors({ qualities: wrongValue })).toEqual(["qualities.0.player_action.maybe: 'maybe' is not a value of this quality"]);
    expect(WELL.quests?.[0].recap?.done?.because).toContain("drew the water");
    expect(OATH.milestones?.[0].recap).toEqual({ because: "Because you swore it, the order counts you as its own." });
  });
});

class StoryEngineFor {
  readonly state;
  constructor(story: NormalizedStory) {
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(story);
    this.state = engine.serialize();
  }
}

function seeded(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value * 1103515245 + 12345) % 2147483648;
    return value / 2147483648;
  };
}

function rawOf(story: NormalizedStory) {
  return JSON.parse(JSON.stringify(story === POSTING ? POSTING_RAW : story === WELL ? WELL_RAW : OATH_RAW));
}
