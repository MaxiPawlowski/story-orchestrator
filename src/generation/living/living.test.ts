import { readFileSync } from "fs";
import { join } from "path";
import { parseStoryV2, parseStoryV2OrThrow, type NormalizedStoryV2 } from "@engine/index";
import type { ModelCall } from "@extraction/modelRoute";
import { compactOps, dropOpsAfter, foldOps, graphEpoch, livingRaw } from "./fold";
import { excludedCheckpoints, projectLivingExport } from "./export";
import { guardDraft, narratesPlayer } from "./guard";
import { parseDirectorDraft } from "./parse";
import { findFrontier, livingAutonomy } from "./frontier";
import { buildDirectorOps, checkDirectorOps, planChapter } from "./plan";
import { renderDirectorPrompt, type DirectorInput } from "./prompt";
import { runDirector } from "./direct";
import { createLivingState, type DirectorDraft, type LivingOp, type LivingOpPayload, type LivingRuntimeState } from "./types";

const fixture = (name: string): Record<string, unknown> => JSON.parse(readFileSync(join(__dirname, "../../../test/fixtures", `${name}.story.json`), "utf8"));

const draft = (patch: Partial<DirectorDraft> = {}, anchor: Partial<DirectorDraft["anchor"]> = {}): DirectorDraft => ({
  anchor: { name: "The Cold Quay", objective: "A lantern on the quay goes dark while the harbourmaster watches the water.", tension: "stirring", snapshot: {}, final: false, ...anchor },
  opensWhen: { kind: "new", key: "lantern_failed", rubric: "Has a quay lantern gone out in front of witnesses?" },
  newQualities: [],
  buildsOn: null,
  newChapter: false,
  reason: "the lanterns are the open thread",
  ...patch,
});

const opsOf = (payloads: LivingOpPayload[], boundary: number, proposalId: string): LivingOp[] =>
  payloads.map((payload, index) => ({ ...payload, id: `${proposalId}:${index}`, boundary, messageId: boundary * 2, proposalId }));

const apply = (raw: Record<string, unknown>, story: NormalizedStoryV2, frontierId: string, entry: DirectorDraft = draft()) => {
  const plan = planChapter(story, frontierId, { sealsOn: true, final: entry.anchor.final, newChapter: entry.newChapter });
  const built = buildDirectorOps(story, frontierId, entry, plan);
  const checked = checkDirectorOps({ raw, story, frontierId, ops: built.ops, values: {}, latched: {} });
  return { built, checked, raw: foldOps(raw, built.ops) };
};

describe("living story block", () => {
  it("parses a premise-only story and synthesises the opening it starts on", () => {
    const story = parseStoryV2OrThrow(fixture("living-premise"));
    expect(story.startCheckpointId).toBe("liv_open");
    expect(story.checkpointById.liv_open).toMatchObject({ type: "anchor", start: true, objective: expect.stringContaining("harbour lanterns") });
    expect(story.living).toMatchObject({ chapter_size: [2, 3], ending: "director-proposes", cast: ["harbourmaster", "innkeeper", "keeper"] });
  });

  it("refuses an unknown key, a missing premise, an authored_until that is not an anchor and an unknown cast member", () => {
    const raw = fixture("living-hybrid");
    const errors = (living: unknown) => {
      const parsed = parseStoryV2({ ...raw, living });
      return Array.isArray(parsed) ? parsed.map((error) => error.path) : [];
    };
    expect(errors({ premise: "x", horizn: 2 })).toContain("living.horizn");
    expect(errors({ tone: "dry" })).toContain("living.premise");
    expect(errors({ premise: "x", authored_until: "nowhere" })).toContain("living.authored_until");
    expect(errors({ premise: "x", cast: ["ghost"] })).toContain("living.cast.0");
    expect(errors({ premise: "x", chapter_size: [4, 2] })).toContain("living.chapter_size");
    expect(errors({ premise: "x", horizon: 9 })).toContain("living.horizon");
    expect(errors({ premise: "x" })).toEqual([]);
  });

  it("defaults autonomy to suggest for a hybrid and auto for a premise-only story", () => {
    expect(livingAutonomy(parseStoryV2OrThrow(fixture("living-premise")))).toBe("auto");
    expect(livingAutonomy(parseStoryV2OrThrow({ ...fixture("living-hybrid"), living: { premise: "x", authored_until: "ford" } }))).toBe("suggest");
  });
});

describe("the director's frontier", () => {
  it("is the active anchor when nothing is written ahead, and nothing once the horizon holds an anchor", () => {
    const raw = fixture("living-premise");
    const story = parseStoryV2OrThrow(raw);
    expect(findFrontier(story, "liv_open")).toEqual({ frontierId: "liv_open", ahead: 0 });
    const next = parseStoryV2OrThrow(apply(raw, story, "liv_open").raw);
    expect(findFrontier(next, "liv_open")).toBeNull();
    expect(findFrontier(next, "liv_1")).toEqual({ frontierId: "liv_1", ahead: 0 });
  });

  it("in a hybrid, waits for authored_until and never writes from an authored anchor before it", () => {
    const story = parseStoryV2OrThrow(fixture("living-hybrid"));
    expect(findFrontier(story, "mill")).toBeNull();
    expect(findFrontier(story, "ford")).toEqual({ frontierId: "ford", ahead: 0 });
    const noUntil = parseStoryV2OrThrow({ ...fixture("living-hybrid"), living: { premise: "x" } });
    expect(findFrontier(noUntil, "ford")?.frontierId).toBe("ford");
  });

  it("stops at a final chapter", () => {
    const raw = fixture("living-premise");
    const story = parseStoryV2OrThrow(raw);
    const ended = parseStoryV2OrThrow(apply(raw, story, "liv_open", draft({}, { final: true })).raw);
    expect(ended.chapterById?.liv_ch_1?.final).toBe(true);
    expect(findFrontier(ended, "liv_1")).toBeNull();
  });
});

describe("director ops", () => {
  const raw = fixture("living-premise");
  const story = parseStoryV2OrThrow(raw);

  it("writes a namespaced anchor, its stub, the chapter and the transitions, and the folded story parses", () => {
    const { built, checked } = apply(raw, story, "liv_open");
    expect(built.anchorId).toBe("liv_1");
    expect(built.ops.map((op) => op.kind)).toEqual(["add-chapter", "add-quality", "add-stub", "add-checkpoint", "add-transition", "add-transition"]);
    expect(checked.issues).toEqual([]);
    expect(checked.story?.checkpointById.liv_open.chapter).toBe("liv_ch_1");
    expect(checked.story?.qualityByKey.liv_1_lantern_failed).toMatchObject({ type: "bool", source: "extractor", latching: true });
    expect(checked.story?.outgoingByCheckpoint.liv_open[0]).toMatchObject({ to: "liv_1_way", gate: { q: "liv_1_lantern_failed", op: "==", v: true } });
  });

  it("refuses a way in that is already open on arrival", () => {
    const entry = draft({ opensWhen: { kind: "reuse", gate: { q: "trust_harbourmaster", op: ">=", v: 0 } } });
    const plan = planChapter(story, "liv_open", { sealsOn: true, final: false, newChapter: false });
    const built = buildDirectorOps(story, "liv_open", entry, plan);
    const checked = checkDirectorOps({ raw, story, frontierId: "liv_open", ops: built.ops, values: { trust_harbourmaster: 1 }, latched: {} });
    expect(checked.issues.join(" ")).toContain("already open on arrival");
  });

  it("refuses a way in that can never open: a locked value or a code quality", () => {
    const plan = planChapter(story, "liv_open", { sealsOn: true, final: false, newChapter: false });
    const locked = buildDirectorOps(story, "liv_open", draft({ opensWhen: { kind: "reuse", gate: { q: "lighthouse_lit", op: "==", v: true } } }), plan);
    expect(checkDirectorOps({ raw, story, frontierId: "liv_open", ops: locked.ops, values: { lighthouse_lit: false }, latched: { lighthouse_lit: true } }).issues.join(" "))
      .toContain("can never open");
    const code = buildDirectorOps(story, "liv_open", draft({ opensWhen: { kind: "reuse", gate: { q: "progress_toward_liv_open", op: ">=", v: 1 } } }), plan);
    expect(checkDirectorOps({ raw, story, frontierId: "liv_open", ops: code.ops, values: {}, latched: {} }).issues.join(" ")).toContain("set in code");
  });

  it("bounds new qualities and asks for reuse of an existing one", () => {
    const plan = planChapter(story, "liv_open", { sealsOn: true, final: false, newChapter: false });
    const many = buildDirectorOps(story, "liv_open", draft({ newQualities: [{ key: "a", type: "bool", rubric: "A?" }, { key: "b", type: "int", rubric: "B?" }] }), plan);
    expect(many.issues.join(" ")).toContain("at most 2 new qualities");
    const dup = buildDirectorOps(story, "liv_open", draft({ newQualities: [{ key: "lighthouse_lit", type: "bool", rubric: "Lit?" }] }), plan);
    expect(dup.issues.join(" ")).toContain("reuse it");
  });

  it("refuses ops that write behind the player or reuse an authored id", () => {
    const behind: LivingOpPayload[] = [
      { kind: "add-transition", transition: { from: "elsewhere", to: "liv_open", priority: 1, gate: { q: "lighthouse_lit", op: "==", v: true } } },
      { kind: "add-checkpoint", checkpoint: { id: "harbour", name: "Harbour", objective: "x", type: "anchor" } },
    ];
    const issues = checkDirectorOps({ raw, story, frontierId: "liv_open", ops: behind, values: {}, latched: {} }).issues.join(" ");
    expect(issues).toContain("behind or beside the frontier");
    expect(issues).toContain("did not write");
    expect(issues).toContain("not a generated id");
  });

  it("closes a chapter after chapter_size and caps a run at three chapters when seals are off", () => {
    let current = raw;
    let parsed = story;
    let frontier = "liv_open";
    for (let index = 1; index <= 9; index += 1) {
      const step = apply(current, parsed, frontier);
      expect(step.checked.issues).toEqual([]);
      current = step.raw;
      parsed = parseStoryV2OrThrow(current);
      frontier = `liv_${index}`;
    }
    expect((parsed.chapters ?? []).map((chapter) => chapter.id)).toEqual(["liv_ch_1", "liv_ch_2", "liv_ch_3"]);
    expect(planChapter(parsed, frontier, { sealsOn: false, final: false, newChapter: false }).capped).toBe(true);
    expect(planChapter(parsed, frontier, { sealsOn: true, final: false, newChapter: false }).capped).toBe(false);
  });
});

describe("director answer", () => {
  const story = parseStoryV2OrThrow(fixture("living-premise"));
  const answer = (patch: Record<string, unknown> = {}) => JSON.stringify({
    name: "The Cold Quay", objective: "A lantern on the quay goes dark while the harbourmaster watches.", tension: "stirring", snapshot: {},
    opens_when: { new: { key: "lantern_failed", rubric: "Has a quay lantern gone out?" } }, new_qualities: [], builds_on: "the lanterns", new_chapter: false,
    chapter_title: null, final: false, reason: "pursued thread", ...patch,
  });

  it("parses a fenced answer after a thought block and coerces a reused value", () => {
    const parsed = parseDirectorDraft(`<think>hm</think>\n\`\`\`json\n${answer({ opens_when: { reuse: { q: "lighthouse_lit", op: "==", v: "true" } } })}\n\`\`\``, story);
    expect(parsed.ok && parsed.draft.opensWhen).toEqual({ kind: "reuse", gate: { q: "lighthouse_lit", op: "==", v: true } });
  });

  it("refuses an unknown reused value, a bad tension, a macro and an over-long name", () => {
    const issues = (patch: Record<string, unknown>) => { const parsed = parseDirectorDraft(answer(patch), story); return parsed.ok ? [] : parsed.issues; };
    expect(issues({ opens_when: { reuse: { q: "nope", op: "==", v: true } } }).join(" ")).toContain("unknown 'nope'");
    expect(issues({ tension: "wild" }).join(" ")).toContain("tension must be");
    expect(issues({ objective: "{{user}} arrives" }).join(" ")).toContain("macro");
    expect(issues({ name: "x".repeat(80) }).join(" ")).toContain("longer than 60");
    expect(parseDirectorDraft("no json here", story)).toEqual({ ok: false, issues: ["the answer was not one JSON object"] });
  });
});

describe("player-visible guard", () => {
  it("catches narrated player acts and leaves world pressure alone", () => {
    expect(narratesPlayer("The player agrees to help the keeper.")).toBe(true);
    expect(narratesPlayer("You decide to climb the tower.")).toBe(true);
    expect(narratesPlayer("The storm breaks and then Rook takes the boat.", ["Rook"])).toBe(true);
    expect(narratesPlayer("The keeper demands an answer before dawn.")).toBe(false);
    expect(narratesPlayer("A boat takes on water by the quay.")).toBe(false);
  });

  it("refuses a field that restates a held secret", () => {
    const issues = guardDraft(draft({}, { objective: "The innkeeper's smuggling ledger is found under the floor." }), {
      playerNames: [], restatesSecret: (text) => /smuggling ledger/.test(text),
    });
    expect(issues).toEqual(["the objective restates something a character keeps private"]);
  });
});

describe("graph-op history", () => {
  const raw = fixture("living-premise");
  const state = (ops: LivingOp[]): LivingRuntimeState => ({ ...createLivingState(), authored: { raw, hash: "h" }, ops });

  it("drops ops after a rollback point, withdraws their applied proposals and bumps the epoch", () => {
    const story = parseStoryV2OrThrow(raw);
    const first = opsOf(apply(raw, story, "liv_open").built.ops, 3, "p1");
    const after1 = foldOps(raw, first);
    const second = opsOf(apply(after1, parseStoryV2OrThrow(after1), "liv_1").built.ops, 7, "p2");
    const full: LivingRuntimeState = { ...state([...first, ...second]), proposals: [{ id: "p2", status: "applied" } as LivingRuntimeState["proposals"][number]] };
    const before = graphEpoch(full);
    const { state: rolled, dropped } = dropOpsAfter(full, 5);
    expect(dropped.map((op) => op.proposalId)).toEqual(second.map(() => "p2"));
    expect(rolled.proposals[0].status).toBe("withdrawn");
    expect(graphEpoch(rolled)).not.toBe(before);
    expect(JSON.stringify(livingRaw(rolled))).toBe(JSON.stringify(after1));
  });

  it("compaction moves settled ops into folded without changing the played graph", () => {
    const story = parseStoryV2OrThrow(raw);
    const ops = opsOf(apply(raw, story, "liv_open").built.ops, 3, "p1");
    const live = state(ops);
    const compacted = compactOps(live, 4);
    expect(compacted.ops).toEqual([]);
    expect(compacted.folded).toHaveLength(ops.length);
    expect(JSON.stringify(livingRaw(compacted))).toBe(JSON.stringify(livingRaw(live)));
    expect(compactOps(live, 2)).toBe(live);
  });
});

describe("Save as story", () => {
  const build = (steps: number) => {
    let raw = fixture("living-premise");
    let story = parseStoryV2OrThrow(raw);
    let frontier = "liv_open";
    for (let index = 1; index <= steps; index += 1) {
      raw = apply(raw, story, frontier).raw;
      story = parseStoryV2OrThrow(raw);
      frontier = `liv_${index}`;
    }
    return { raw, story };
  };

  it("drops the unreached anchor and what names it, and ends the reached anchor in a stub (R3-12)", () => {
    const { raw, story } = build(2);
    const out = projectLivingExport(raw, story, { reached: new Set(["liv_open", "liv_1"]), includeUnreached: false, id: "coast-run", title: "Coast run" });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const ids = out.raw.checkpoints.map((checkpoint) => checkpoint.id);
    expect(ids).not.toContain("liv_2");
    expect(ids).not.toContain("liv_2_way");
    expect(JSON.stringify(out.raw)).not.toContain("liv_2_lantern_failed");
    expect(out.stubbed).toEqual(["liv_1"]);
    const parsed = parseStoryV2OrThrow(out.raw);
    expect(parsed.outgoingByCheckpoint.liv_1[0].to).toMatch(/_way$/);
    const defined = new Set(parsed.checkpoints.map((checkpoint) => checkpoint.id));
    parsed.transitions.forEach((transition) => { expect(defined.has(transition.from) && defined.has(transition.to)).toBe(true); });
    expect(parsed.checkpointById.liv_open).toBeDefined();
  });

  it("keeps unreached anchors when the author asks", () => {
    const { raw, story } = build(2);
    const out = projectLivingExport(raw, story, { reached: new Set(["liv_open"]), includeUnreached: true, id: "x", title: "x" });
    expect(out.ok && out.raw.checkpoints.map((checkpoint) => checkpoint.id)).toContain("liv_2");
  });

  it("scrubs a generated field with the held-secret filter", () => {
    const { raw, story } = build(1);
    const out = projectLivingExport(raw, story, { reached: new Set(["liv_open", "liv_1"]), includeUnreached: false, id: "x", title: "x", scrub: (text) => text.replace(/harbourmaster/g, "someone") });
    expect(out.ok && out.raw.checkpoints.find((checkpoint) => checkpoint.id === "liv_1")?.objective).toContain("someone");
  });

  it("validates for every reached cut of a longer run (property)", () => {
    const { raw, story } = build(6);
    const path = ["liv_open", ...Array.from({ length: 6 }, (_, index) => `liv_${index + 1}`)];
    for (let cut = 1; cut <= path.length; cut += 1) {
      const reached = new Set(path.slice(0, cut));
      const out = projectLivingExport(raw, story, { reached, includeUnreached: false, id: "x", title: "x" });
      expect({ cut, ok: out.ok }).toEqual({ cut, ok: true });
      if (!out.ok) continue;
      const excluded = excludedCheckpoints(story, reached, false);
      const text = JSON.stringify(out.raw.checkpoints.map((checkpoint) => checkpoint.id));
      excluded.forEach((id) => expect(text).not.toContain(`"${id}"`));
    }
  });
});

describe("runDirector", () => {
  const raw = fixture("living-premise");
  const story = parseStoryV2OrThrow(raw);
  const input: DirectorInput = {
    title: story.title, premise: story.living?.premise ?? "", cast: [{ name: "Maren" }], path: ["The opening"],
    frontier: { id: "liv_open", name: "The opening", objective: "x" }, canon: "", openThreads: ["the lanterns"], resolvedThreads: [], plans: [], refused: null,
    qualities: [], tension: { suggested: "stirring", current: null }, chapter: { number: 1, anchorsIn: 0, size: [2, 3], mayClose: false },
    ending: { finalAllowed: true, finalRequired: false },
  };
  const scripted = (answers: string[]): ModelCall & { prompts: string[] } => {
    const prompts: string[] = [];
    const call: ModelCall = async (prompt) => { prompts.push(prompt); return { text: answers.shift() ?? "", finish: "stop" }; };
    return Object.assign(call, { prompts });
  };
  const good = JSON.stringify({ name: "The Cold Quay", objective: "A quay lantern goes dark while the harbourmaster watches.", tension: "stirring", opens_when: { new: { key: "lantern_failed", rubric: "Did a lantern go out?" } }, final: false });

  it("retries once with the refusal named, then answers", async () => {
    const model = scripted([JSON.stringify({ name: "The Quay", objective: "The player agrees to watch the lanterns.", tension: "calm", opens_when: { new: { key: "a", rubric: "A?" } } }), good, JSON.stringify({ pass: true, issues: [] })]);
    const outcome = await runDirector({ story, raw, frontierId: "liv_open", values: {}, latched: {}, sealsOn: true, input, guard: { playerNames: [], restatesSecret: () => false }, critic: true },
      model, { role: "authoring", pass: "living" });
    expect(outcome.status).toBe("ok");
    expect(model.prompts[1]).toContain("narrates the player's own act");
    expect(outcome.status === "ok" && outcome.anchorId).toBe("liv_1");
  });

  it("returns refused after the attempts, and capped without a model call when the chapter cap is reached", async () => {
    const model = scripted(["{}", "{}"]);
    const refused = await runDirector({ story, raw, frontierId: "liv_open", values: {}, latched: {}, sealsOn: true, input, guard: { playerNames: [], restatesSecret: () => false }, critic: false },
      model, { role: "authoring", pass: "living" });
    expect(refused.status).toBe("refused");
    let current = raw;
    let parsed = story;
    for (let index = 0; index < 9; index += 1) {
      current = apply(current, parsed, index ? `liv_${index}` : "liv_open").raw;
      parsed = parseStoryV2OrThrow(current);
    }
    const none = scripted([]);
    const capped = await runDirector({ story: parsed, raw: current, frontierId: "liv_9", values: {}, latched: {}, sealsOn: false, input, guard: { playerNames: [], restatesSecret: () => false }, critic: false },
      none, { role: "authoring", pass: "living" });
    expect(capped.status).toBe("capped");
    expect(none.prompts).toEqual([]);
  });

  it("forces the ending when the story's ending gate holds", async () => {
    const ended = parseStoryV2OrThrow({ ...raw, living: { ...(raw.living as object), ending: { when: { q: "lighthouse_lit", op: "==", v: true } } } });
    const outcome = await runDirector({ story: ended, raw: { ...raw, living: ended.living }, frontierId: "liv_open", values: { lighthouse_lit: true }, latched: {}, sealsOn: true, input,
      guard: { playerNames: [], restatesSecret: () => false }, critic: false }, scripted([good]), { role: "authoring", pass: "living" });
    expect(outcome.status === "ok" && outcome.draft.anchor.final).toBe(true);
  });

  it("renders the private plans as private and the refusal as something the world answers", () => {
    const prompt = renderDirectorPrompt({ ...input, plans: ["Tobin hides the oil"], refused: "The Ferry" });
    expect(prompt).toContain("never name or reveal them");
    expect(prompt).toContain('refused the prepared route at "The Ferry"');
  });
});
