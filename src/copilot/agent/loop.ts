import { isValidationErrorList, parseStoryV2, type StoryV2 } from "@engine/index";
import { validateProvisioningOp, type ProvisioningEnvironment } from "@wizard/index";
import { isRecord } from "@utils/guards";
import { truncate } from "@utils/string";
import { runDiagnostics, type DiagnosticsContext } from "../../studio/diagnostics";
import type { ProvisioningOp } from "@wizard/index";
import { setChapters, setHouseRules } from "../../studio/mutations";
import { setCheckpointMotive, setRosterDrive, setRosterView } from "../../studio/innerVoiceMutations";
import { applyOp, applyOps, applyOpsChecked, diffProposal, isProvisioningOp, provisioningFollowUpOps, type OpAction, type OpDescription } from "../index";
import { renderPlanPrompt, renderStepPrompt } from "./prompt";
import { runReadTool } from "./readTools";
import type { AgentAudit, AgentRoute, RouteAnswer } from "./route";
import { checkRequirementsOp, resolveCastOp } from "./requirements";
import { checkToolCall, type ReadToolName } from "./tools";
import { doneSummary, missingAtDone, refusedDoneLast } from "./finish";
import { greetingClash, playerCastProblem } from "./playerCast";
import { rejectedRefusal } from "./rejected";
import type { AgentBudget, AgentOnlyOp, AgentOp, AgentLookup, AgentMode, AgentReply, AgentSession, AgentStep, AgentStepStatus } from "./types";

export const AGENT_SESSION_VERSION = 1;
export const DEFAULT_AGENT_BUDGET: Omit<AgentBudget, "usedTokens"> = { maxSteps: 40, maxTokens: 240_000 };
const OBSERVATION_LIMIT = 1500;
const CHECK_LINES = 12;

const now = () => new Date().toISOString();

const AGENT_ONLY_KINDS: ReadonlySet<string> = new Set<AgentOnlyOp["kind"]>(["setHouseRules", "setChapters", "setRosterDrive", "setRosterView", "setCheckpointMotive"]);

const isAgentOnly = (op: AgentOp): op is AgentOnlyOp => AGENT_ONLY_KINDS.has(op.kind);

const applyAgentOnly = (draft: StoryV2, op: AgentOnlyOp): StoryV2 => {
  switch (op.kind) {
    case "setHouseRules": return setHouseRules(draft, op.rules);
    case "setChapters": return setChapters(draft, op.chapters, op.assign);
    case "setRosterDrive": return setRosterDrive(draft, op.id, op.drive);
    case "setRosterView": return setRosterView(draft, op.id, op.view);
    case "setCheckpointMotive": return setCheckpointMotive(draft, op.id, op.member, op.motive);
  }
};

const describeAgentOnly = (op: AgentOnlyOp): OpDescription => {
  switch (op.kind) {
    case "setHouseRules": return { action: "update", entity: "story.house_rules", label: op.rules.length ? `Set ${op.rules.length} house rule(s)` : "Clear the house rules" };
    case "setChapters": {
      const assigned = Object.keys(op.assign).length;
      const label = op.chapters.length ? `Chapters: ${op.chapters.map((chapter) => chapter.title).join(" / ")}${assigned ? ` (${assigned} checkpoint(s) assigned)` : ""}` : "Remove every chapter";
      return { action: "update", entity: "story.chapters", label };
    }
    case "setRosterDrive": return { action: "update", entity: `roster.${op.id}.drive`, label: op.drive ? `Drive for ${op.id}: ${op.drive}` : `Clear ${op.id}'s drive` };
    case "setRosterView": return { action: "update", entity: `roster.${op.id}.view`, label: `${op.id} sees ${op.view === "omniscient" ? "every character's private rows" : "only their own"}` };
    case "setCheckpointMotive": {
      const label = op.motive ? `${op.member} wants at ${op.id}: ${op.motive}` : `Clear ${op.member}'s motive at ${op.id}`;
      return { action: "update", entity: `checkpoints.${op.id}.motives.${op.member}`, label };
    }
  }
};

const chaptersProblem = (draft: StoryV2, op: Extract<AgentOnlyOp, { kind: "setChapters" }>): string | null => {
  const chapters = new Set(op.chapters.map((chapter) => chapter.id));
  const problems = Object.entries(op.assign).flatMap(([checkpoint, chapter]) => [
    ...(draft.checkpoints.some((entry) => entry.id === checkpoint) ? [] : [`'${checkpoint}' is not a checkpoint`]),
    ...(chapter && !chapters.has(chapter) ? [`'${chapter}' is not one of the chapters sent`] : []),
  ]);
  return problems.length ? problems.join("; ") : null;
};

const agentOnlyProblem = (draft: StoryV2, op: AgentOnlyOp): string | null => {
  if (op.kind === "setHouseRules") return null;
  if (op.kind === "setChapters") return chaptersProblem(draft, op);
  const member = op.kind === "setCheckpointMotive" ? op.member : op.id;
  if (!draft.roster.some((entry) => entry.id === member)) return `'${member}' is not a roster id`;
  if (op.kind === "setCheckpointMotive" && !draft.checkpoints.some((entry) => entry.id === op.id)) return `'${op.id}' is not a checkpoint`;
  return null;
};

export const isProvisionOp = (op: AgentOp): op is ProvisioningOp => !isAgentOnly(op) && isProvisioningOp(op);

export const applyAgentOp = (draft: StoryV2, op: AgentOp): StoryV2 => (isAgentOnly(op) ? applyAgentOnly(draft, op) : applyOp(draft, op));

export const describeAgentOp = (op: AgentOp): OpDescription => {
  if (!isAgentOnly(op)) {
    const diff = diffProposal([op]);
    return diff.items[0] ?? diff.provisioning[0];
  }
  return describeAgentOnly(op);
};
const clip = (text: string) => truncate(text, OBSERVATION_LIMIT);

export const newAgentSession = (goal: string, mode: AgentMode = "review", budget: Partial<Omit<AgentBudget, "usedTokens">> = {}, at = now()): AgentSession => ({
  version: AGENT_SESSION_VERSION,
  mode,
  goal: goal.trim(),
  plan: [],
  status: "planning",
  steps: [],
  notes: [{ role: "author", text: goal.trim(), at }],
  budget: { ...DEFAULT_AGENT_BUDGET, ...budget, usedTokens: 0 },
});

export const isAgentSession = (value: unknown): value is AgentSession =>
  isRecord(value) && value.version === AGENT_SESSION_VERSION && Array.isArray(value.steps) && Array.isArray(value.plan);

export const budgetSpent = (session: AgentSession): boolean =>
  session.steps.length >= session.budget.maxSteps || session.budget.usedTokens >= session.budget.maxTokens;

export const pendingStep = (session: AgentSession): AgentStep | null => session.steps.find((step) => step.status === "pending") ?? null;

export const approvePlan = (session: AgentSession, plan: string[], at = now()): AgentSession => {
  const kept = plan.map((step) => step.trim()).filter(Boolean);
  if (!kept.length) return session;
  const edited = kept.join("\n") !== session.plan.join("\n");
  return {
    ...session,
    plan: kept,
    status: "running",
    notes: edited ? [...session.notes, { role: "author", text: `Edited the plan: ${kept.join(" / ")}`, at }] : session.notes,
  };
};

export const setAgentMode = (session: AgentSession, mode: AgentMode): AgentSession => ({ ...session, mode });

export const stopAgent = (session: AgentSession): AgentSession => ({ ...session, status: "stopped" });

export const grantBudget = (session: AgentSession): AgentSession => {
  if (!budgetSpent(session)) return session;
  const { usedTokens } = session.budget;
  return { ...session, budget: { maxSteps: session.steps.length + DEFAULT_AGENT_BUDGET.maxSteps, maxTokens: usedTokens + DEFAULT_AGENT_BUDGET.maxTokens, usedTokens } };
};

export const budgetSliceText = (): string => `${DEFAULT_AGENT_BUDGET.maxSteps} more steps, ~${Math.round(DEFAULT_AGENT_BUDGET.maxTokens / 1000)}k tokens`;

export const resumeAgent = (session: AgentSession): AgentSession =>
  session.status === "stopped" || session.status === "budget" ? { ...grantBudget(session), status: session.plan.length ? "running" : "planning" } : session;

export const addAuthorNote = (session: AgentSession, text: string, at = now()): AgentSession =>
  text.trim() ? { ...session, notes: [...session.notes, { role: "author", text: text.trim(), at }] } : session;

export const addUndoNote = (session: AgentSession, text: string, at = now()): AgentSession =>
  text.trim() ? { ...session, notes: [...session.notes, { role: "author", text: text.trim(), at, onceAt: session.steps.length }] } : session;

export const checkDraft = (draft: StoryV2, install: DiagnosticsContext = {}): string => {
  const parsed = parseStoryV2(draft);
  const errors = isValidationErrorList(parsed) ? parsed : [];
  const diagnostics = runDiagnostics(draft, install).filter((diagnostic) => diagnostic.severity !== "info");
  const lines = [
    ...errors.map((error) => `error ${error.path}: ${error.message}`),
    ...diagnostics.map((diagnostic) => `${diagnostic.severity} ${diagnostic.code} at ${diagnostic.path}: ${diagnostic.message}`),
  ];
  const count = (severity: string) => diagnostics.filter((diagnostic) => diagnostic.severity === severity).length;
  const head = `${errors.length} validation error(s), ${count("blocking")} blocking, ${count("warning")} warning(s).`;
  return [head, ...lines.slice(0, CHECK_LINES), ...(lines.length > CHECK_LINES ? [`… ${lines.length - CHECK_LINES} more`] : [])].join("\n");
};

export interface AgentContext {
  draft: StoryV2;
  environment: ProvisioningEnvironment;
  lookup: AgentLookup;
}

export interface StepMeta {
  route: AgentRoute["id"];
  firstTryValid: boolean;
  repaired: boolean;
  at?: string;
}

export interface AgentTurn {
  session: AgentSession;
  apply: AgentOp | null;
  audit?: AgentAudit;
}

const installOf = (context: AgentContext): DiagnosticsContext => ({
  characterNames: () => context.environment.characterNames, backgroundNames: context.lookup.backgrounds, personaNames: () => context.environment.personaNames,
});

const nextStatus = (session: AgentSession, steps: AgentStep[]): AgentSession["status"] => {
  if (steps.some((step) => step.status === "pending")) return "awaiting-author";
  if (budgetSpent({ ...session, steps })) return "budget";
  return session.status === "planning" ? "planning" : "running";
};

const withStep = (session: AgentSession, step: Omit<AgentStep, "id">): AgentSession => {
  const steps = [...session.steps, { ...step, id: session.steps.length + 1, observation: clip(step.observation) }];
  return { ...session, steps, status: nextStatus(session, steps) };
};

const baseStep = (meta: StepMeta, reply: Extract<AgentReply, { kind: "call" }>) => ({
  at: meta.at ?? now(),
  route: meta.route,
  ...(reply.thought ? { thought: reply.thought } : {}),
  call: reply.call,
  repaired: meta.repaired,
});

export const recordUnparsed = (session: AgentSession, issues: string[], meta: StepMeta): AgentSession =>
  withStep(session, {
    at: meta.at ?? now(),
    route: meta.route,
    call: { tool: "(unparsed)", args: {} },
    family: null,
    status: "refused",
    observation: `Refused: ${issues.join("; ")}`,
    firstTryValid: false,
    repaired: meta.repaired,
  });

const editProblem = (draft: StoryV2, op: AgentOp): string | null => {
  if (isAgentOnly(op)) return agentOnlyProblem(draft, op);
  const issue = applyOpsChecked(draft, [op]).issues[0];
  return issue ? issue.replace(/^ops\.0: /, "") : null;
};

export const NO_CHANGE = "this changes nothing in the draft; send only the fields that change, or move on";

const unchangedProblem = (draft: StoryV2, op: AgentOp): string | null =>
  (JSON.stringify(applyAgentOp(draft, op)) === JSON.stringify(draft) ? NO_CHANGE : null);

export const executeReply = (session: AgentSession, reply: AgentReply, context: AgentContext, meta: StepMeta): AgentTurn => {
  const at = meta.at ?? now();
  if (reply.kind === "plan") {
    const notes = [...session.notes, { role: "agent" as const, text: `Plan: ${reply.plan.join(" / ")}`, at }];
    return { session: { ...session, plan: reply.plan, status: "awaiting-plan", notes }, apply: null };
  }
  if (reply.kind === "done") return finish(session, reply.summary, context, meta);
  const base = baseStep(meta, reply);
  const record = (step: Pick<AgentStep, "family" | "status" | "observation"> & Partial<AgentStep>, apply: AgentOp | null = null): AgentTurn => ({
    session: withStep(session, { ...base, firstTryValid: step.status === "refused" ? false : meta.firstTryValid, ...step }),
    apply,
  });
  const check = checkToolCall(reply.call);
  if (!check.ok) return record({ family: null, status: "refused", observation: `Refused: ${check.message}` });
  const { spec, op } = check;
  if (spec.family === "read" || spec.family === "simulate" || spec.family === "lookup") {
    return record({ family: spec.family, status: "observed", observation: runReadTool(spec.name as ReadToolName, reply.call.args, context.draft, context.lookup) });
  }
  if (!op) return record({ family: null, status: "refused", observation: `Refused: ${spec.name}: arguments did not parse` });
  const player = playerCastProblem(session, context.draft, op);
  if (player) return record({ family: spec.family === "provision" ? "provision" : "edit", op, status: "refused", observation: `Refused: ${player}` });
  if (spec.family === "provision") {
    if (!isProvisionOp(op)) return record({ family: null, status: "refused", observation: `Refused: ${spec.name} is not a provisioning step` });
    const rejected = rejectedRefusal(session, op);
    if (rejected) return record({ family: "provision", op, status: "refused", observation: `Refused: ${rejected}` });
    const validation = validateProvisioningOp(op, context.environment);
    if (!validation.ok) return record({ family: "provision", op, status: "refused", observation: `Refused: ${validation.message}` });
    const clash = greetingClash(context.draft, op);
    return record({ family: "provision", op, status: "pending", observation: `Waiting for the author to confirm this asset.${clash ? ` ${clash}` : ""}` });
  }
  const requirements = op.kind === "setRequirements" ? checkRequirementsOp(session, context.draft, op, context.environment) : null;
  if (requirements?.problem) return record({ family: "edit", op, status: "refused", observation: `Refused: ${requirements.problem}` });
  const cast = resolveCastOp(context.draft, requirements?.op ?? op);
  const edit = cast.op;
  const rejected = rejectedRefusal(session, op) ?? rejectedRefusal(session, edit);
  if (rejected) return record({ family: "edit", op: edit, status: "refused", observation: `Refused: ${rejected}` });
  const note = [requirements?.note, cast.note].filter(Boolean).join(" ");
  const noted = (text: string) => (note ? `${text} ${note}` : text);
  const problem = editProblem(context.draft, edit) ?? unchangedProblem(context.draft, edit);
  if (problem) return record({ family: "edit", op: edit, status: "refused", observation: `Refused: ${problem}` });
  if (session.mode === "auto-draft") {
    const check = checkDraft(applyAgentOp(context.draft, edit), installOf(context));
    return record({ family: "edit", op: edit, status: "applied", observation: noted("Applied to the draft (auto-draft)."), check }, edit);
  }
  return record({ family: "edit", op: edit, status: "pending", observation: noted("Waiting for the author.") });
};

const finish = (session: AgentSession, claim: string, context: AgentContext, meta: StepMeta): AgentTurn => {
  const at = meta.at ?? now();
  const missing = missingAtDone(session, context.draft, context.environment);
  if (missing.length && !refusedDoneLast(session)) {
    const observation = `Refused: not done yet: ${missing.join("; ")}. Create what is missing, or tell the author why it should not exist, then finish again.`;
    const call = { tool: "done", args: { summary: claim } };
    const step = { at, route: meta.route, call, family: null, status: "refused" as const, observation, firstTryValid: false, repaired: meta.repaired };
    return { session: withStep(session, step), apply: null };
  }
  const summary = `${doneSummary(session, context.draft, claim)}${missing.length ? ` Still missing: ${missing.join("; ")}.` : ""}`;
  const notes = [...session.notes, { role: "agent" as const, text: summary, at }];
  return { session: { ...session, status: "done", summary, notes }, apply: null };
};

const updateStep = (session: AgentSession, id: number, patch: Partial<AgentStep>): AgentSession => {
  const steps = session.steps.map((step) => (step.id === id ? { ...step, ...patch, ...(patch.observation ? { observation: clip(patch.observation) } : {}) } : step));
  return { ...session, steps, status: session.status === "awaiting-author" ? nextStatus(session, steps) : session.status };
};

export type AgentDecision = { kind: "accept"; op?: AgentOp } | { kind: "reject"; reason: string };

export const decideStep = (session: AgentSession, id: number, decision: AgentDecision, draft: StoryV2): AgentTurn => {
  const step = session.steps.find((entry) => entry.id === id);
  if (!step || step.status !== "pending") return { session, apply: null };
  if (decision.kind === "reject") {
    const reason = decision.reason.trim() || "no reason given";
    return { session: updateStep(session, id, { status: "rejected", reason, observation: `Rejected by the author: ${reason}` }), apply: null };
  }
  if (step.family !== "edit" || !step.op) return { session, apply: null };
  const op = decision.op ?? step.op;
  if (isProvisionOp(op)) return { session, apply: null };
  const problem = editProblem(draft, op);
  if (problem) return { session: updateStep(session, id, { status: "failed", op, observation: `The accepted change no longer applies: ${problem}` }), apply: null };
  const edited = decision.op !== undefined && JSON.stringify(decision.op) !== JSON.stringify(step.op);
  const observation = edited ? `Accepted after the author edited it: ${JSON.stringify(op)}` : "Accepted by the author.";
  return { session: updateStep(session, id, { status: "accepted", op, observation, check: checkDraft(applyAgentOp(draft, op)) }), apply: op };
};

export const resolveProvisioning = (session: AgentSession, id: number, outcome: { ok: boolean; message: string }, draftAfter: StoryV2): AgentSession => {
  const step = session.steps.find((entry) => entry.id === id);
  if (!step || step.status !== "pending" || step.family !== "provision") return session;
  return updateStep(session, id, { status: outcome.ok ? "applied" : "failed", observation: outcome.message, ...(outcome.ok ? { check: checkDraft(draftAfter) } : {}) });
};

const replyProblems = (reply: AgentReply): string[] => {
  if (reply.kind !== "call") return [];
  const check = checkToolCall(reply.call);
  return check.ok ? [] : [check.message];
};

export const advanceAgent = async (session: AgentSession, context: AgentContext, route: AgentRoute, at?: string): Promise<AgentTurn> => {
  if (session.status !== "planning" && session.status !== "running") return { session, apply: null };
  if (budgetSpent(session)) return { session: { ...session, status: "budget" }, apply: null };
  const expect = session.status === "planning" ? "plan" : "step";
  const backgrounds = context.lookup.backgrounds();
  const prompt = expect === "plan"
    ? renderPlanPrompt(session, context.draft, context.environment, route.native, backgrounds)
    : renderStepPrompt(session, context.draft, context.environment, route.native, backgrounds);
  const answer: RouteAnswer = await route.ask(prompt, expect, replyProblems);
  const charged = { ...session, budget: { ...session.budget, usedTokens: session.budget.usedTokens + answer.tokens } };
  const meta: StepMeta = { route: answer.route, firstTryValid: answer.firstTryValid, repaired: answer.repaired, at };
  if (!answer.parsed.ok) return { session: recordUnparsed(charged, answer.parsed.issues, meta), apply: null, audit: answer.audit };
  return { ...executeReply(charged, answer.parsed.reply, context, meta), audit: answer.audit };
};

export interface OpPreview {
  action: OpAction;
  label: string;
  before: unknown;
  after: unknown;
}

const fieldPath = (root: unknown, fields: string[]): unknown => fields.reduce<unknown>((value, field) => (isRecord(value) ? value[field] ?? null : null), root);

const entityPath = (draft: StoryV2, entity: string): unknown => {
  const [collection, id, ...fields] = entity.split(".");
  if (collection === "roster") return fieldPath(draft.roster.find((entry) => entry.id === id) ?? null, fields);
  if (collection === "checkpoints") return fieldPath(draft.checkpoints.find((entry) => entry.id === id) ?? null, fields);
  return undefined;
};

const entityOf = (draft: StoryV2, entity: string): unknown => {
  const dotted = entityPath(draft, entity);
  if (dotted !== undefined) return dotted;
  const [kind, ...rest] = entity.split(":");
  const key = rest.join(":");
  if (kind === "quality") return draft.qualities.find((entry) => entry.key === key) ?? null;
  if (kind === "checkpoint") return draft.checkpoints.find((entry) => entry.id === key) ?? null;
  if (kind === "member") return draft.roster.find((entry) => entry.id === key) ?? null;
  if (kind === "transition") {
    const [from, to] = key.split("->");
    return draft.transitions.filter((entry) => entry.from === from && entry.to === to);
  }
  const fields: Record<string, unknown> = { ...draft };
  if (entity.startsWith("story.")) return fields[entity.slice("story.".length)] ?? null;
  return null;
};

export const opPreview = (draft: StoryV2, op: AgentOp): OpPreview => {
  const described = describeAgentOp(op);
  if (isProvisionOp(op)) return { action: "provision", label: described.label, before: null, after: op };
  return { action: described.action, label: described.label, before: entityOf(draft, described.entity), after: entityOf(applyAgentOp(draft, op), described.entity) };
};

export interface AgentStats {
  calls: number;
  firstTryValid: number;
  proposed: number;
  accepted: number;
  refused: number;
}

export const agentStats = (session: AgentSession): AgentStats => {
  const writes = session.steps.filter((step) => step.family === "edit" || step.family === "provision");
  const decided = (status: AgentStepStatus) => ["accepted", "applied"].includes(status);
  return {
    calls: session.steps.length,
    firstTryValid: session.steps.filter((step) => step.firstTryValid).length,
    proposed: writes.filter((step) => step.status !== "refused").length,
    accepted: writes.filter((step) => decided(step.status)).length,
    refused: session.steps.filter((step) => step.status === "refused").length,
  };
};

export const applyDraftOp = applyAgentOp;

export const validationErrorCount = (draft: StoryV2): number => {
  const parsed = parseStoryV2(draft);
  return isValidationErrorList(parsed) ? parsed.length : 0;
};

export const applyProvisioningFollowUps = (draft: StoryV2, op: AgentOp): StoryV2 =>
  (isProvisionOp(op) ? applyOps(draft, provisioningFollowUpOps(draft, op)) : draft);
