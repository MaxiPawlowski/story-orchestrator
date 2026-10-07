import type { StoryV2 } from "@engine/index";
import { mintToken, tokenMatches, type RunContext, type RunOwnership } from "@runtime/runToken";
import type { ProvisioningOp } from "@wizard/index";
import { confirmProvisioning, driveAgent, type AgentRunner } from "./drive";
import { approvePlan, newAgentSession, type AgentTurn } from "./loop";
import type { AgentOp, AgentSession, AgentStep } from "./types";

const AT = "2026-09-30T00:00:00.000Z";

const story = (): StoryV2 => ({
  format: 2,
  title: "Drive",
  description: "",
  qualities: [],
  checkpoints: [{ id: "start", name: "Start", objective: "Begin.", type: "anchor", start: true }],
  transitions: [],
  roster: [],
});

const running = (): AgentSession => approvePlan({ ...newAgentSession("drive", "auto-draft", {}, AT), plan: ["p"], status: "awaiting-plan" }, ["p"], AT);

const OP: AgentOp = { kind: "updateCheckpoint", id: "start", patch: { objective: "Begin at the harbour." } };

const epochOwnership = () => {
  const world = { epoch: 0 };
  const context = (): RunContext => ({ chatId: null, storyId: null, storyHash: null, sessionEpoch: world.epoch, windowRevision: 0 });
  const ownership: RunOwnership = { mint: () => mintToken(context()), check: (token) => tokenMatches(context(), token) };
  return { world, ownership };
};

const scriptedRunner = (turns: Array<(session: AgentSession) => AgentTurn>, during?: () => void) => {
  const log: string[] = [];
  const runner: AgentRunner = async (session) => {
    during?.();
    const next = turns.shift();
    if (!next) throw new Error("no turn scripted");
    return next(session);
  };
  runner.settle = async (turn) => { log.push(`settle:${turn.session.status}`); };
  runner.close = async () => { log.push("close"); };
  return { runner, log };
};

const doneTurn = (session: AgentSession): AgentTurn => ({ session: { ...session, status: "done", summary: "ok" }, apply: null });
const applyTurn = (session: AgentSession): AgentTurn => ({ session: { ...session, status: "running", steps: [...session.steps, { id: 1 } as AgentStep] }, apply: OP });

describe("agent drive loop ownership (v2.6 plan 04 agent bridge)", () => {
  it("an owned turn applies its op, commits and settles the bridge call", async () => {
    const { ownership } = epochOwnership();
    const { runner, log } = scriptedRunner([applyTurn, doneTurn]);
    const applied: AgentOp[] = [];
    const commits: string[] = [];
    const outcome = await driveAgent(running(), {
      runner, ownership, draft: story, applyOp: (op) => applied.push(op), commit: (session) => commits.push(session.status), stopRequested: () => false,
    });
    expect(outcome).toMatchObject({ lapsed: null, session: { status: "done" } });
    expect(applied).toEqual([OP]);
    expect(commits).toEqual(["running", "running", "done"]);
    expect(log).toEqual(["settle:running", "settle:done", "close"]);
  });

  it("a draft replaced while the agent turn runs writes nothing and closes the bridge", async () => {
    const { world, ownership } = epochOwnership();
    const { runner, log } = scriptedRunner([applyTurn], () => { world.epoch += 1; });
    const applied: AgentOp[] = [];
    const commits: string[] = [];
    const outcome = await driveAgent(running(), {
      runner, ownership, draft: story, applyOp: (op) => applied.push(op), commit: (session) => commits.push(session.status), stopRequested: () => false,
    });
    expect(outcome.lapsed).toContain("epoch");
    expect(applied).toEqual([]);
    expect(commits).toEqual(["running"]);
    expect(log).toEqual(["close"]);
  });

  it("stop commits a stopped session and still closes the bridge", async () => {
    const { ownership } = epochOwnership();
    const { runner, log } = scriptedRunner([applyTurn]);
    const outcome = await driveAgent(running(), { runner, ownership, draft: story, applyOp: () => undefined, commit: () => undefined, stopRequested: () => true });
    expect(outcome.session.status).toBe("stopped");
    expect(log).toEqual(["close"]);
  });

  it("a provisioning confirmed after the draft was replaced leaves the draft alone", async () => {
    const op: ProvisioningOp = { kind: "createStoryLorebook", name: "Drive Lore" };
    const step = { id: 1, family: "provision", status: "pending", op } as AgentStep;
    const session = { ...running(), status: "awaiting-author" as const, steps: [step] };
    for (const replaced of [false, true]) {
      const { world, ownership } = epochOwnership();
      const followUps: ProvisioningOp[] = [];
      const outcome = await confirmProvisioning(session, step, op, {
        ownership,
        draft: story,
        provision: async () => {
          if (replaced) world.epoch += 1;
          return { ok: true, message: "created" };
        },
        applyFollowUps: (created) => followUps.push(created),
      });
      expect({ replaced, followUps: followUps.length, lapsed: outcome.lapsed !== null }).toEqual({ replaced, followUps: replaced ? 0 : 1, lapsed: replaced });
      if (!replaced) expect(outcome.session.steps[0].status).toBe("applied");
    }
  });
});
