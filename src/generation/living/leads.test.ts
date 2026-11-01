import { readFileSync } from "fs";
import { join } from "path";
import { parseStoryOrThrow } from "@engine/index";
import type { ModelCall } from "@extraction/modelRoute";
import type { JudgeAnswer } from "@judge/types";
import { parseDirectorDraft } from "./parse";
import { buildDirectorOps, checkDirectorOps, planChapter } from "./plan";
import { renderDirectorPrompt, type DirectorInput } from "./prompt";
import { runDirector, type DirectorJudge } from "./direct";
import { LIVING_PACE_TURNS, type DirectorDraft } from "./types";

const raw = JSON.parse(readFileSync(join(__dirname, "../../../test/fixtures/living-premise.story.json"), "utf8")) as Record<string, unknown>;
const story = parseStoryOrThrow(raw);
const plan = () => planChapter(story, "liv_open", { sealsOn: true, final: false, newChapter: false });

const draft = (patch: Partial<DirectorDraft> = {}): DirectorDraft => ({
  anchor: { name: "The Cold Quay", objective: "A lantern on the quay goes dark while the harbourmaster watches the water.", tension: "stirring", snapshot: {}, final: false },
  opensWhen: { kind: "reuse", gate: { q: "trust_harbourmaster", op: ">=", v: 2 } },
  alsoOpensWhen: [
    { kind: "new", key: "lantern_failed", rubric: "Has a quay lantern gone out in front of witnesses?" },
    { kind: "new", key: "keeper_spoke", rubric: "Has the lighthouse keeper spoken about the lamps?" },
  ],
  newQualities: [], buildsOn: null, newChapter: false, reason: "r",
  ...patch,
});

describe("v3.0 43 P3: several leads into a living turning point", () => {
  it("parses opens_when as a list of up to three leads, and a single object as before", () => {
    const answer = (opens: unknown) => parseDirectorDraft(JSON.stringify({ name: "The Cold Quay", objective: "A lantern goes dark.", tension: "calm", opens_when: opens }), story);
    const three = answer([{ reuse: { q: "trust_harbourmaster", op: ">=", v: 2 } }, { new: { key: "a_b", rubric: "A?" } }, { new: { key: "c_d", rubric: "C?" } }]);
    expect(three.ok && three.draft.opensWhen).toEqual({ kind: "reuse", gate: { q: "trust_harbourmaster", op: ">=", v: 2 } });
    expect(three.ok && three.draft.alsoOpensWhen?.map((lead) => lead.kind)).toEqual(["new", "new"]);
    const one = answer({ new: { key: "a_b", rubric: "A?" } });
    expect(one.ok && one.draft.alsoOpensWhen).toBeUndefined();
    const four = answer([1, 2, 3, 4].map((n) => ({ new: { key: `k_${n}`, rubric: "K?" } })));
    expect(four.ok ? "" : four.issues.join(" ")).toContain("at most 3 leads");
    expect(answer([{ new: { key: "a_b", rubric: "A?" } }, { nothing: true }]).ok).toBe(false);
  });

  it("still one transition per way in: an any-gate over every lead and the pace fallback", () => {
    const built = buildDirectorOps(story, "liv_open", draft(), plan());
    const checked = checkDirectorOps({ raw, story, frontierId: "liv_open", ops: built.ops, values: {}, latched: {} });
    expect(checked.issues).toEqual([]);
    const ways = checked.story?.outgoingByCheckpoint.liv_open ?? [];
    expect(ways).toHaveLength(1);
    expect(ways[0].gate).toEqual({ any: [
      { q: "trust_harbourmaster", op: ">=", v: 2 }, { q: "liv_1_lantern_failed", op: "==", v: true }, { q: "liv_1_keeper_spoke", op: "==", v: true },
      { q: "player_turns_in_checkpoint", op: ">=", v: LIVING_PACE_TURNS },
    ] });
  });

  it("every new lead counts against the two new values, so three new leads are refused", () => {
    const built = buildDirectorOps(story, "liv_open", draft({ opensWhen: { kind: "new", key: "x_y", rubric: "X?" } }), plan());
    expect(built.issues.join(" ")).toContain("at most 2 new qualities");
  });

  it("each lead must be closed now and reachable: one open lead or one impossible lead refuses the draft", () => {
    const open = buildDirectorOps(story, "liv_open", draft(), plan());
    expect(checkDirectorOps({ raw, story, frontierId: "liv_open", ops: open.ops, values: { trust_harbourmaster: 3 }, latched: {} }).issues.join(" ")).toContain("already open on arrival");
    const code = buildDirectorOps(story, "liv_open", draft({ opensWhen: { kind: "reuse", gate: { q: "progress_toward_liv_open", op: ">=", v: 1 } } }), plan());
    expect(checkDirectorOps({ raw, story, frontierId: "liv_open", ops: code.ops, values: {}, latched: {} }).issues.join(" ")).toContain("set in code");
  });

  it("the prompt asks for 2-3 leads only when the switch is on", () => {
    const input = {
      title: "t", premise: "p", cast: [], path: [], frontier: { id: "liv_open", name: "o", objective: "x" }, canon: "", openThreads: [], resolvedThreads: [], plans: [], refused: null,
      qualities: [], tension: { suggested: "calm", current: null }, chapter: { number: 1, anchorsIn: 0, size: [2, 3], mayClose: false }, ending: { finalAllowed: false, finalRequired: false },
    } as DirectorInput;
    expect(renderDirectorPrompt({ ...input, leads: true })).toContain("is a list of 2 or 3 leads");
    expect(renderDirectorPrompt({ ...input, leads: true })).toContain("\"opens_when\":[{\"reuse\"");
    expect(renderDirectorPrompt(input)).not.toContain("2 or 3 leads");
  });
});

describe("v3.0 43 P2: the judge critic in the director loop", () => {
  const input: DirectorInput = {
    title: story.title, premise: "p", cast: [{ name: "Maren" }], path: [], frontier: { id: "liv_open", name: "The opening", objective: "x" }, canon: "- Maren keeps the store.",
    openThreads: ["the lanterns"], resolvedThreads: [], plans: [], refused: null, qualities: [], tension: { suggested: "stirring", current: null },
    chapter: { number: 1, anchorsIn: 0, size: [2, 3], mayClose: false }, ending: { finalAllowed: false, finalRequired: false },
  };
  const good = JSON.stringify({ name: "The Cold Quay", objective: "A quay lantern goes dark while the harbourmaster watches.", tension: "stirring",
    opens_when: { new: { key: "lantern_failed", rubric: "Did a lantern go out?" } } });
  const scripted = (answers: string[]): ModelCall & { prompts: string[] } => {
    const prompts: string[] = [];
    const call: ModelCall = async (prompt) => { prompts.push(prompt); return { text: answers.shift() ?? "", finish: "stop" }; };
    return Object.assign(call, { prompts });
  };
  const noul = (value: number): JudgeAnswer => ({ type: "noul", noul: value });
  const answers = (playerAct: number): Record<string, JudgeAnswer> => ({
    playerAct: noul(playerAct), contradicts: noul(0.05), outcomeName: noul(0.05), newPerson: noul(0.05), followsThread: noul(0.9),
  });
  const run = (judgeCritic?: DirectorJudge) => ({
    story, raw, frontierId: "liv_open", values: {}, latched: {}, sealsOn: true, input, guard: { playerNames: ["Max"], restatesSecret: () => false }, critic: true,
    ...(judgeCritic ? { judgeCritic } : {}),
  });

  it("a clean judge read replaces the authoring-model critic call", async () => {
    const asked: unknown[] = [];
    const model = scripted([good]);
    const outcome = await runDirector(run(async (request) => { asked.push(request.state); return answers(0.1); }), model, { role: "authoring", pass: "living" });
    expect(outcome.status).toBe("ok");
    expect(model.prompts).toHaveLength(1);
    expect(asked[0]).toMatchObject({ player: "Max", cast: ["Max", "Maren"], established_facts: ["Maren keeps the store."], open_threads: ["the lanterns"] });
  });

  it("a judge refusal retries the draft with the composed issue, then refuses at the critic stage", async () => {
    const model = scripted([good, good]);
    const outcome = await runDirector(run(async () => answers(0.9)), model, { role: "authoring", pass: "living" });
    expect(outcome.status).toBe("refused");
    expect(outcome.status === "refused" && outcome.refusal.stage).toBe("critic");
    expect(model.prompts[1]).toContain("decides what the player does");
  });

  it("no answer or a partial answer falls back to the authoring-model critic", async () => {
    const model = scripted([good, JSON.stringify({ pass: true, issues: [] })]);
    expect((await runDirector(run(async () => null), model, { role: "authoring", pass: "living" })).status).toBe("ok");
    expect(model.prompts).toHaveLength(2);
    const partial = scripted([good, JSON.stringify({ pass: true, issues: [] })]);
    expect((await runDirector(run(async () => ({ playerAct: noul(0.1) })), partial, { role: "authoring", pass: "living" })).status).toBe("ok");
    expect(partial.prompts).toHaveLength(2);
  });
});
