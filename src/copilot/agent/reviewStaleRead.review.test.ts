import type { Story } from "@engine/index";
import { applyAgentOp, approvePlan, decideStep, executeReply, newAgentSession, type StepMeta } from "./loop";
import { agentContext } from "./testing";
import type { AgentSession } from "./types";

const AT = "2026-10-16T15:00:00.000Z";
const META: StepMeta = { route: "harness", firstTryValid: true, repaired: false, at: AT };

const ferry = (): Story => ({
  title: "SO-W09R codex-pages",
  description: "",
  qualities: [
    { key: "ferry_paid", type: "bool", source: "extractor", rubric: "Has the player paid the ferryman?" },
    { key: "arin_name_known", type: "bool", source: "extractor", rubric: "Has the player learned Arin's name?" },
  ],
  checkpoints: [
    { id: "dock", name: "The Dock", objective: "The ferryman names his price.", type: "anchor", start: true },
    { id: "far_bank", name: "The Far Bank", objective: "The player lands.", type: "anchor" },
  ],
  transitions: [{ from: "dock", to: "far_bank", priority: 0, gate: { q: "ferry_paid", op: "==", v: true } }],
  roster: [{ id: "arin", name: "Arin", role: "the ferryman's daughter" }],
});

const ARIN_PAGE = {
  page: "people",
  entry: { id: "arin", member: "arin", known_when: { q: "arin_name_known", op: "==", v: true }, facts: [{ id: "identity", text: "Arin is the ferryman's daughter.", known_when: { q: "arin_name_known", op: "==", v: true } }] },
};

const running = (): AgentSession => approvePlan({ ...newAgentSession("codex", "review", {}, AT), plan: ["pages"], status: "awaiting-plan" }, ["pages"], AT);
const call = (tool: string, args: Record<string, unknown>) => ({ kind: "call" as const, call: { tool, args } });

const harness = (start: Story) => {
  let draft = start;
  let session = running();
  const step = (tool: string, args: Record<string, unknown> = {}) => {
    const turn = executeReply(session, call(tool, args), agentContext(draft), META);
    session = turn.session;
    if (turn.apply) draft = applyAgentOp(draft, turn.apply);
    return session.steps.at(-1)!;
  };
  const accept = (id: number) => {
    const turn = decideStep(session, id, { kind: "accept" }, draft);
    session = turn.session;
    if (turn.apply) draft = applyAgentOp(draft, turn.apply);
    return session.steps.find((entry) => entry.id === id)!;
  };
  return { step, accept, draft: () => draft, session: () => session };
};

describe("review mode: reads after an accepted card see the accepted draft", () => {
  it("readQualityUsage names the codex page that gates on the quality, once the author accepts it", () => {
    const run = harness(ferry());
    expect(run.step("readQualityUsage", { key: "arin_name_known" })).toMatchObject({ status: "observed", observation: "\"arin_name_known\" is not read anywhere." });
    const card = run.step("setCodexEntry", ARIN_PAGE);
    expect(card.status).toBe("pending");
    expect(run.accept(card.id).status).toBe("accepted");
    expect(run.draft().codex?.people?.[0]?.id).toBe("arin");
    const after = run.step("readQualityUsage", { key: "arin_name_known" });
    expect(after.status).toBe("observed");
    expect(after.observation).toContain("codex people arin");
  });

  it("re-checking validation and diagnostics after an accepted edit is observed even when the text is the same", () => {
    const run = harness(ferry());
    expect(run.step("readValidation").status).toBe("observed");
    expect(run.step("readDiagnostics").status).toBe("observed");
    const card = run.step("setCodexEntry", ARIN_PAGE);
    run.accept(card.id);
    const validation = run.step("readValidation");
    expect(validation).toMatchObject({ status: "observed", observation: "Valid: 0 errors." });
    expect(run.step("readDiagnostics").status).toBe("observed");
    expect(run.session().status).toBe("running");
  });

  it("readStory shows the codex pages the author accepted", () => {
    const run = harness(ferry());
    run.accept(run.step("setCodexEntry", ARIN_PAGE).id);
    expect(run.step("readStory").observation).toContain("\"codex\":{\"people\":[\"arin\"]");
  });

  it("control: an identical read with no applied edit since is still refused", () => {
    const run = harness(ferry());
    run.step("readValidation");
    run.accept(run.step("setCodexEntry", ARIN_PAGE).id);
    expect(run.step("readValidation").status).toBe("observed");
    const again = run.step("readValidation");
    expect(again.status).toBe("refused");
    expect(again.observation).toContain("nothing changed since step #3");
  });

  it("control: a rejected card is no change, so the identical read is refused", () => {
    const run = harness(ferry());
    run.step("readValidation");
    const card = run.step("setCodexEntry", ARIN_PAGE);
    const rejected = decideStep(run.session(), card.id, { kind: "reject", reason: "not yet" }, run.draft()).session;
    const turn = executeReply(rejected, call("readValidation", {}), agentContext(run.draft()), META);
    expect(turn.session.steps.at(-1)?.status).toBe("refused");
  });

  it("auto-draft: an applied edit lets the same check run again", () => {
    const auto = approvePlan({ ...newAgentSession("codex", "auto-draft", {}, AT), plan: ["pages"], status: "awaiting-plan" }, ["pages"], AT);
    let draft = ferry();
    let session = executeReply(auto, call("readValidation", {}), agentContext(draft), META).session;
    const edit = executeReply(session, call("setCodexEntry", ARIN_PAGE), agentContext(draft), META);
    draft = applyAgentOp(draft, edit.apply!);
    session = executeReply(edit.session, call("readValidation", {}), agentContext(draft), META).session;
    expect(session.steps.map((step) => step.status)).toEqual(["observed", "applied", "observed"]);
  });
});
