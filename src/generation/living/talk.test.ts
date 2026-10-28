import { readFileSync } from "fs";
import { join } from "path";
import { parseStoryOrThrow, type TalkControl } from "@engine/index";
import { resolveTalkPolicy } from "@talk/policy";
import { foldOps } from "./fold";
import { buildBranchOps, buildDirectorOps, checkDirectorOps, planChapter } from "./plan";
import { LIVING_TALK_FALLBACK, livingTalkControl } from "./talk";
import type { DirectorDraft, LivingOpPayload } from "./types";

const fixture = (name: string): Record<string, unknown> => JSON.parse(readFileSync(join(__dirname, "../../../test/fixtures", `${name}.story.json`), "utf8"));

const draft: DirectorDraft = {
  anchor: { name: "The Flooded Ford", objective: "The ford rises while the miller counts the sacks still on the far bank.", tension: "stirring", snapshot: {}, final: false },
  opensWhen: { kind: "new", key: "ford_rose", rubric: "Has the ford risen past the stepping stones?" },
  newQualities: [],
  buildsOn: null,
  newChapter: false,
  reason: "the river is the open thread",
};

const scripted: TalkControl = {
  profile: "action", budget: { voices: 4 }, lead: "narrator", spotlight: { members: ["miller"] },
  chain: { mode: "scripted", sequence: ["narrator", "miller"], max: 2, stop_on_transition: true },
};

const withTalk = (raw: Record<string, unknown>, id: string, control: TalkControl, extra: Record<string, unknown> = {}) => ({
  ...raw, ...extra,
  checkpoints: (raw.checkpoints as Array<Record<string, unknown>>).map((checkpoint) => (checkpoint.id === id ? { ...checkpoint, talk_control: control } : checkpoint)),
});

const directorOps = (raw: Record<string, unknown>, frontierId: string) => {
  const story = parseStoryOrThrow(raw);
  const plan = planChapter(story, frontierId, { sealsOn: true, final: false, newChapter: false });
  const built = buildDirectorOps(story, frontierId, draft, plan);
  return { story, built, checked: checkDirectorOps({ raw, story, frontierId, ops: built.ops, values: {}, latched: {} }) };
};

const checkpointsOf = (ops: readonly LivingOpPayload[]) => ops.flatMap((op) => (op.kind === "add-checkpoint" || op.kind === "add-stub" ? [op.checkpoint] : []));

describe("living checkpoints take their talk pacing from the beat they grew from", () => {
  it("a turning point and its stub inherit the frontier's talk control, without the scripted order or an opening profile", () => {
    const raw = withTalk(fixture("living-hybrid"), "ford", scripted);
    const { built, checked } = directorOps(raw, "ford");
    expect(checked.issues).toEqual([]);
    const expected = { profile: "action", budget: { voices: 4 }, lead: "narrator", spotlight: { members: ["miller"] }, chain: { max: 2, stop_on_transition: true } };
    expect(checkpointsOf(built.ops).map((checkpoint) => checkpoint.talk_control)).toEqual([expected, expected]);
    const played = parseStoryOrThrow(foldOps(raw, built.ops));
    const policy = resolveTalkPolicy({ control: played.checkpointById.liv_1.talk_control ?? null, defaults: played.talk_defaults, chainMax: 2, activeReplies: false });
    expect(policy).toMatchObject({ profile: "action", budget: { voices: 4, attempts: 5 } });
    expect(livingTalkControl({ id: "x", name: "x", objective: "x", type: "anchor", talk_control: { profile: "opening", lead_words: 90 } }, undefined)).toEqual({ profile: "conversation", lead_words: 90 });
  });

  it("a beat with no talk control gives a generated checkpoint the story's default profile, or conversation", () => {
    const premise = fixture("living-premise");
    expect(checkpointsOf(directorOps(premise, "liv_open").built.ops).map((checkpoint) => checkpoint.talk_control)).toEqual([
      { profile: LIVING_TALK_FALLBACK }, { profile: LIVING_TALK_FALLBACK },
    ]);
    const decided = directorOps({ ...premise, talk_defaults: { profile: "decision", budget: { voices: 2 } } }, "liv_open");
    expect(decided.checked.issues).toEqual([]);
    expect(checkpointsOf(decided.built.ops)[1].talk_control).toEqual({ profile: "decision" });
    const policy = resolveTalkPolicy({ control: { profile: "decision" }, defaults: decided.story.talk_defaults, chainMax: 3, activeReplies: false });
    expect(policy.budget).toEqual({ voices: 2, attempts: 3 });
    expect(livingTalkControl(undefined, { profile: "opening" })).toEqual({ profile: LIVING_TALK_FALLBACK });
  });

  it("a fully living story's opening takes the story's default profile, or opening, and the director cannot rewrite it", () => {
    const premise = fixture("living-premise");
    const story = parseStoryOrThrow(premise);
    expect(story.checkpointById.liv_open.talk_control).toEqual({ profile: "opening" });
    expect(resolveTalkPolicy({ control: story.checkpointById.liv_open.talk_control ?? null, defaults: undefined, chainMax: 3, activeReplies: false }))
      .toMatchObject({ profile: "opening", budget: { voices: 2, attempts: 3 } });
    expect(parseStoryOrThrow({ ...premise, talk_defaults: { profile: "aftermath" } }).checkpointById.liv_open.talk_control).toEqual({ profile: "aftermath" });
    const hybrid = parseStoryOrThrow(withTalk(fixture("living-hybrid"), "ford", { profile: "decision" }));
    expect(hybrid.checkpointById.liv_open).toBeUndefined();
    const rewrite: LivingOpPayload[] = [{ kind: "add-checkpoint", checkpoint: { id: "liv_open", name: "Again", objective: "x", type: "anchor", talk_control: { budget: { voices: 8 } } } }];
    const issues = checkDirectorOps({ raw: premise, story, frontierId: "liv_open", ops: rewrite, values: {}, latched: {} }).issues.join(" ");
    expect(issues).toContain("'liv_open' already exists");
    expect(issues).toContain("'liv_open' must take its talk control from 'liv_open'");
  });

  it("a branch stub inherits the talk control of the checkpoint it branches from", () => {
    const raw = withTalk(fixture("living-hybrid"), "mill", { profile: "conversation", budget: { voices: 2 } });
    const story = parseStoryOrThrow(raw);
    const built = buildBranchOps(story, "mill", "ford", "liv_b1", draft);
    expect(checkpointsOf(built.ops).map((checkpoint) => checkpoint.talk_control)).toEqual([{ profile: "conversation", budget: { voices: 2 } }]);
    expect(checkDirectorOps({ raw, story, frontierId: "mill", ops: built.ops, values: {}, latched: {}, convergeTo: "ford" }).issues).toEqual([]);
  });

  it("refuses a generated checkpoint that drops, widens or invents its talk control", () => {
    const raw = withTalk(fixture("living-hybrid"), "ford", { profile: "decision" });
    const { story, built } = directorOps(raw, "ford");
    const edit = (change: (control: TalkControl | undefined) => TalkControl | undefined) => built.ops.map((op) => (op.kind === "add-checkpoint"
      ? { ...op, checkpoint: { ...op.checkpoint, talk_control: change(op.checkpoint.talk_control) } } : op));
    const issues = (ops: LivingOpPayload[]) => checkDirectorOps({ raw, story, frontierId: "ford", ops, values: {}, latched: {} }).issues.join(" ");
    expect(issues(edit(() => undefined))).toContain("'liv_1' must take its talk control from 'ford'");
    expect(issues(edit((control) => ({ ...control, budget: { voices: 8 } })))).toContain("must take its talk control");
    expect(issues(edit((control) => ({ ...control, chain: { mode: "scripted", sequence: ["miller"] } })))).toContain("must take its talk control");
    expect(issues(built.ops)).toBe("");
  });
});
