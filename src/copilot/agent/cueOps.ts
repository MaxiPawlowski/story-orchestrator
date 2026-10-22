import type { MemberCue, MemberTopic, Story, StoryNorm, ValidationError } from "@engine/index";
import { addLifeQualities, checkLife, readLife } from "@engine/validate/life";
import { readMemberCues, readNorms } from "@engine/validate/cues";
import { isRecord } from "@utils/guards";
import { removeCue, removeNorm, removeTopic, setCue, setNorm, setTopic } from "../../studio/gameMutations";
import type { OpDescription } from "../index";

export type CueAgentOp =
  | { kind: "setCue"; member: string; cue: MemberCue }
  | { kind: "removeCue"; member: string; id: string }
  | { kind: "setTopic"; member: string; topic: MemberTopic }
  | { kind: "removeTopic"; member: string; id: string }
  | { kind: "setNorm"; norm: StoryNorm }
  | { kind: "removeNorm"; id: string };

export const CUE_AGENT_KINDS: readonly CueAgentOp["kind"][] = ["setCue", "removeCue", "setTopic", "removeTopic", "setNorm", "removeNorm"];

const refused = (tool: string, errors: ValidationError[]) => ({ ok: false as const, message: errors.map((error) => `${tool}.${error.path}: ${error.message}`).join("; ") });

export const readCueCall = (tool: string, args: Record<string, unknown>): { ok: true; op: CueAgentOp } | { ok: false; message: string } => {
  const errors: ValidationError[] = [];
  const member = String(args.member ?? "").trim();
  const id = String(args.id ?? "").trim();
  if (tool === "removeCue" || tool === "removeTopic") return { ok: true, op: { kind: tool, member, id } };
  if (tool === "removeNorm") return { ok: true, op: { kind: "removeNorm", id } };
  if (tool === "setNorm") {
    const raw = isRecord(args.norm) ? args.norm : {};
    const ids = (value: unknown) => (Array.isArray(value) ? value.filter((id): id is string => typeof id === "string").map((id) => ({ id: id.trim() })) : []);
    const norm = readNorms({ norms: [args.norm], roster: ids(raw.noticed_by), checkpoints: ids(raw.checkpoints) }, errors)?.[0];
    return norm && !errors.length ? { ok: true, op: { kind: "setNorm", norm } } : refused(tool, errors);
  }
  const field = tool === "setCue" ? "cues" : "topics";
  const read = readMemberCues({ [field]: [tool === "setCue" ? args.cue : args.topic] }, "", errors);
  if (errors.length) return refused(tool, errors);
  if (tool === "setCue" && read.cues?.[0]) return { ok: true, op: { kind: "setCue", member, cue: read.cues[0] } };
  if (tool === "setTopic" && read.topics?.[0]) return { ok: true, op: { kind: "setTopic", member, topic: read.topics[0] } };
  return { ok: false, message: `${tool}: nothing to set` };
};

export const applyCueOp = (draft: Story, op: CueAgentOp): Story => {
  switch (op.kind) {
    case "setCue": return setCue(draft, op.member, op.cue);
    case "removeCue": return removeCue(draft, op.member, op.id);
    case "setTopic": return setTopic(draft, op.member, op.topic);
    case "removeTopic": return removeTopic(draft, op.member, op.id);
    case "setNorm": return setNorm(draft, op.norm);
    case "removeNorm": return removeNorm(draft, op.id);
  }
};

export const describeCueOp = (op: CueAgentOp): OpDescription => {
  switch (op.kind) {
    case "setCue": return { action: "update", entity: `roster.${op.member}.cues.${op.cue.id}`, label: `${op.member} ${op.cue.kind} cue ${op.cue.id}: ${op.cue.cue}` };
    case "removeCue": return { action: "remove", entity: `roster.${op.member}.cues.${op.id}`, label: `Remove ${op.member}'s cue ${op.id}` };
    case "setTopic": return { action: "update", entity: `roster.${op.member}.topics.${op.topic.id}`, label: `${op.member} topic ${op.topic.id}: ${op.topic.tiers.length} tier(s)` };
    case "removeTopic": return { action: "remove", entity: `roster.${op.member}.topics.${op.id}`, label: `Remove ${op.member}'s topic ${op.id}` };
    case "setNorm": return { action: "update", entity: `norms.${op.norm.id}`, label: `Norm ${op.norm.id}: ${op.norm.label}` };
    case "removeNorm": return { action: "remove", entity: `norms.${op.id}`, label: `Remove the norm ${op.id}` };
  }
};

const ownPath = (op: CueAgentOp, index: number) => {
  if (op.kind === "setNorm" || op.kind === "removeNorm") return "norms";
  return `roster.${index}.${op.kind === "setCue" || op.kind === "removeCue" ? "cues" : "topics"}`;
};

export const cueOpProblem = (draft: Story, op: CueAgentOp): string | null => {
  const index = "member" in op ? draft.roster.findIndex((member) => member.id === op.member) : -1;
  if ("member" in op && index < 0) return `'${op.member}' is not a cast member`;
  const removed = op.kind === "removeCue" ? { id: op.id, list: draft.roster[index]?.cues } : op.kind === "removeTopic" ? { id: op.id, list: draft.roster[index]?.topics }
    : op.kind === "removeNorm" ? { id: op.id, list: draft.norms } : null;
  if (removed && !(removed.list ?? []).some((entry) => entry.id === removed.id)) return `'${removed.id}' is not there to remove`;
  const next = applyCueOp(draft, op);
  const errors: ValidationError[] = [];
  const json = { roster: next.roster.map((member) => ({ ...member })), norms: next.norms, checkpoints: next.checkpoints, clock: next.clock };
  const life = readLife(json, errors);
  const qualities = addLifeQualities(next.qualities, life, errors);
  checkLife(life, next.roster, Object.fromEntries(qualities.map((quality) => [quality.key, quality])), errors, Boolean(next.chapters?.length));
  const own = ownPath(op, index);
  const mine = errors.filter((error) => error.path.startsWith(own) || error.path.startsWith("qualities.cue_") || error.path.startsWith("qualities.topic_"));
  return mine.length ? mine.map((error) => `${error.path}: ${error.message}`).join("; ") : null;
};
