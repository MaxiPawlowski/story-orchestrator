import { castMemberName, resolveCastChanges, type CheckpointEffects, type StoryRequirements, type StoryV2 } from "@engine/index";
import { isProvisioningKind, personaRequirementProblem, provisioningRequirements, type ProvisioningEnvironment, type ProvisioningOp } from "@wizard/index";
import type { ProposalOp } from "../types";
import type { AgentOp, AgentSession } from "./types";

type RequirementsOp = Extract<ProposalOp, { kind: "setRequirements" }>;

export interface RequirementsCheck {
  op: AgentOp;
  note: string | null;
  problem: string | null;
}

const isProvision = (op: AgentOp): op is ProvisioningOp => isProvisioningKind(op.kind);

const fold = (text: string) => text.trim().toLowerCase();

const holds = (list: string[] | undefined, value: string) => (list ?? []).some((entry) => fold(entry) === fold(value));

export const rosterNameForId = (draft: StoryV2, member: string): string | null => {
  const name = castMemberName(draft.roster, member);
  return fold(name) === fold(member) ? null : name;
};

export const createdBySession = (session: AgentSession): { members: string[]; lorebooks: string[] } => session.steps
  .flatMap((step) => (step.family === "provision" && step.status === "applied" && step.op && isProvision(step.op) ? [step.op] : []))
  .reduce((created, op) => {
    const wanted = provisioningRequirements(op);
    return { members: [...created.members, ...wanted.members], lorebooks: [...created.lorebooks, ...wanted.lorebooks] };
  }, { members: [] as string[], lorebooks: [] as string[] });

const resolveMembers = (draft: StoryV2, members: string[]) => {
  const resolved: string[] = [];
  const next = members.map((member) => {
    const name = rosterNameForId(draft, member);
    if (!name) return member;
    resolved.push(`${member} → ${name}`);
    return name;
  }).filter((member, index, list) => list.findIndex((entry) => fold(entry) === fold(member)) === index);
  return { next, resolved };
};

const dropped = (draft: StoryV2, session: AgentSession, requirements: StoryRequirements): string[] => {
  const created = createdBySession(session);
  const lost = (kind: "members" | "lorebooks") => created[kind].filter((name) => holds(draft.requirements?.[kind], name) && !holds(requirements[kind], name));
  return [
    ...lost("members").map((name) => `member "${name}"`),
    ...lost("lorebooks").map((name) => `lorebook "${name}"`),
  ];
};

export const checkRequirementsOp = (session: AgentSession, draft: StoryV2, op: RequirementsOp, environment: Pick<ProvisioningEnvironment, "personaNames">): RequirementsCheck => {
  const persona = personaRequirementProblem(op.requirements.personas, environment);
  if (persona) return { op, note: null, problem: persona };
  const members = op.requirements.members ?? [];
  const { next, resolved } = resolveMembers(draft, members);
  const requirements: StoryRequirements = members.length ? { ...op.requirements, members: next } : op.requirements;
  const lost = dropped(draft, session, requirements);
  if (lost.length) {
    const names = (kind: "members" | "lorebooks") => JSON.stringify(requirements[kind] ?? []);
    return {
      op,
      note: null,
      problem: `setRequirements would drop what this story created and needs: ${lost.join(", ")}. Requirements name characters by their card name, never by roster id; ` +
        `send the full lists (members ${names("members")}, lorebooks ${names("lorebooks")}) with them kept`,
    };
  }
  return {
    op: resolved.length ? { kind: "setRequirements", requirements } : op,
    note: resolved.length ? `Requirements name characters by card name, so roster ids were resolved: ${resolved.join(", ")}.` : null,
    problem: null,
  };
};

const effectsOf = (op: AgentOp): CheckpointEffects | undefined => {
  if (op.kind === "setCheckpointEffects") return op.effects;
  if (op.kind === "addCheckpoint") return op.checkpoint.effects;
  if (op.kind === "updateCheckpoint") return op.patch.effects;
  return undefined;
};

const withEffects = (op: AgentOp, effects: CheckpointEffects): AgentOp => {
  if (op.kind === "setCheckpointEffects") return { ...op, effects };
  if (op.kind === "addCheckpoint") return { ...op, checkpoint: { ...op.checkpoint, effects } };
  if (op.kind === "updateCheckpoint") return { ...op, patch: { ...op.patch, effects } };
  return op;
};

export const resolveCastOp = (draft: StoryV2, op: AgentOp): { op: AgentOp; note: string | null } => {
  const effects = effectsOf(op);
  const resolved = effects?.cast_changes === undefined ? null : resolveCastChanges(draft.roster, effects.cast_changes);
  if (!effects || !resolved?.resolved.length) return { op, note: null };
  return {
    op: withEffects(op, { ...effects, cast_changes: resolved.changes }),
    note: `cast_changes name characters by card name, so roster ids were resolved: ${resolved.resolved.join(", ")}.`,
  };
};
