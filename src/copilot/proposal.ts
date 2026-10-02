import type { StoryV2 } from "@engine/index";
import { describeProvisioningOp, isProvisioningKind, provisioningRequirements, type ProvisioningOp } from "@wizard/index";
import {
  addCheckpoint,
  addQuality,
  addRosterMember,
  addTransition,
  removeCheckpoint,
  removeQuality,
  removeRosterMember,
  removeTransition,
  setArcBridges,
  setArcTemplate,
  setCheckpointEffects,
  setCheckpointSnapshot,
  setRequirements,
  setLoreSelect,
  setSceneRead,
  setStagecraft,
  setStartCheckpoint,
  setStoryField,
  setTransitionGate,
  updateCheckpoint,
  updateQuality,
  updateRosterMember,
  updateTransition,
} from "../studio/mutations";
import { stageOpIssue } from "./stages";
import type { CopilotStage, ProposalOp, TransitionRef } from "./types";

export const transitionRefMatches = (draft: StoryV2, ref: TransitionRef): number[] =>
  draft.transitions.reduce<number[]>((matches, entry, index) => {
    if (entry.from === ref.from && entry.to === ref.to && (ref.priority === undefined || entry.priority === ref.priority)) matches.push(index);
    return matches;
  }, []);

export const resolveTransitionRef = (draft: StoryV2, ref: TransitionRef): number => transitionRefMatches(draft, ref)[0] ?? -1;

export const ambiguousRef = (draft: StoryV2, op: ProposalOp): string | null => {
  if (op.kind !== "updateTransition" && op.kind !== "removeTransition" && op.kind !== "setTransitionGate") return null;
  const matches = transitionRefMatches(draft, op.ref);
  return matches.length > 1 ? `transition ${op.ref.from} → ${op.ref.to} is ambiguous (${matches.length} matches; set priority to disambiguate)` : null;
};

export const isProvisioningOp = (op: ProposalOp): op is ProvisioningOp => isProvisioningKind(op.kind);

// A provisioning op acts on the ST install, so applying it to the draft is a no-op; what it leaves
// behind in the story is its requirement, added through the ordinary mutation path.
export const provisioningFollowUpOps = (draft: StoryV2, op: ProvisioningOp): ProposalOp[] => {
  const wanted = provisioningRequirements(op);
  const current = draft.requirements ?? {};
  const merge = (existing: string[] | undefined, additions: string[]) => {
    const seen = new Set((existing ?? []).map((entry) => entry.trim().toLowerCase()));
    return [...(existing ?? []), ...additions.map((entry) => entry.trim()).filter((entry) => !seen.has(entry.toLowerCase()))];
  };
  const requirements = {
    ...current,
    ...(wanted.members.length ? { members: merge(current.members, wanted.members) } : {}),
    ...(wanted.lorebooks.length ? { lorebooks: merge(current.lorebooks, wanted.lorebooks) } : {}),
  };
  const ops: ProposalOp[] = [];
  if (wanted.members.length || wanted.lorebooks.length) ops.push({ kind: "setRequirements", requirements });
  // A lorebook the wizard made for this story is the one book a curator may write into, so creating
  // it also grants the scope (`stagecraft.lorebooks` allowlist), and it is the book
  // lore-select may judge (nothing runs until the install opts in).
  if (op.kind === "createStoryLorebook") {
    ops.push({ kind: "setStagecraft", stagecraft: { lorebooks: merge(draft.stagecraft?.lorebooks, [op.name]) } });
    ops.push({ kind: "setLoreSelect", loreSelect: { ...draft.lore_select, lorebooks: merge(draft.lore_select?.lorebooks, [op.name]) } });
  }
  if (op.kind === "createCharacterCard" && !draft.roster.some((member) => (member.name ?? member.id).trim().toLowerCase() === op.name.trim().toLowerCase())) {
    ops.push({ kind: "addRosterMember", member: { id: op.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_"), name: op.name, ...(op.role ? { role: op.role } : {}) } });
  }
  return ops;
};

const keepAuthorLoreFlags = (draft: StoryV2, next: NonNullable<StoryV2["lore_select"]>): NonNullable<StoryV2["lore_select"]> => ({
  ...next,
  ...(next.min_p === undefined && draft.lore_select?.min_p !== undefined ? { min_p: draft.lore_select.min_p } : {}),
  ...(next.exclusive === undefined && draft.lore_select?.exclusive ? { exclusive: true } : {}),
});

export const applyOp = (draft: StoryV2, op: ProposalOp): StoryV2 => {
  if (isProvisioningOp(op)) return draft;
  switch (op.kind) {
    case "setStoryField":
      return setStoryField(draft, op.field, op.value);
    case "addQuality":
      return addQuality(draft, op.quality);
    case "updateQuality":
      return updateQuality(draft, op.key, op.patch);
    case "removeQuality":
      return removeQuality(draft, op.key);
    case "addCheckpoint":
      return addCheckpoint(draft, op.checkpoint);
    case "updateCheckpoint":
      return updateCheckpoint(draft, op.id, op.patch);
    case "removeCheckpoint":
      return removeCheckpoint(draft, op.id);
    case "setStartCheckpoint":
      return setStartCheckpoint(draft, op.id);
    case "setCheckpointSnapshot":
      return setCheckpointSnapshot(draft, op.id, op.snapshot);
    case "setCheckpointEffects":
      return setCheckpointEffects(draft, op.id, op.effects);
    case "addTransition":
      return addTransition(draft, op.transition);
    case "updateTransition": {
      const index = resolveTransitionRef(draft, op.ref);
      return index < 0 ? draft : updateTransition(draft, index, op.patch);
    }
    case "removeTransition": {
      const index = resolveTransitionRef(draft, op.ref);
      return index < 0 ? draft : removeTransition(draft, index);
    }
    case "setTransitionGate": {
      const index = resolveTransitionRef(draft, op.ref);
      return index < 0 ? draft : setTransitionGate(draft, index, op.gate);
    }
    case "addRosterMember":
      return addRosterMember(draft, op.member);
    case "updateRosterMember":
      return updateRosterMember(draft, op.id, op.patch);
    case "removeRosterMember":
      return removeRosterMember(draft, op.id);
    case "setArcTemplate":
      return setArcTemplate(draft, op.template ?? undefined);
    case "setArcBridges":
      return setArcBridges(draft, op.bridges);
    case "setRequirements":
      return setRequirements(draft, op.requirements);
    case "setStagecraft":
      return setStagecraft(draft, op.stagecraft);
    case "setSceneRead":
      return setSceneRead(draft, op.sceneRead);
    case "setLoreSelect":
      return setLoreSelect(draft, keepAuthorLoreFlags(draft, op.loreSelect));
    default:
      return draft;
  }
};

export const applyOps = (draft: StoryV2, ops: ProposalOp[]): StoryV2 => ops.reduce(applyOp, draft);

export const missingTarget = (draft: StoryV2, op: ProposalOp): string | null => {
  switch (op.kind) {
    case "updateQuality":
      return draft.qualities.some((entry) => entry.key === op.key) ? null : `quality "${op.key}"`;
    case "updateCheckpoint":
    case "setStartCheckpoint":
    case "setCheckpointSnapshot":
    case "setCheckpointEffects":
      return draft.checkpoints.some((entry) => entry.id === op.id) ? null : `checkpoint "${op.id}"`;
    case "updateTransition":
    case "setTransitionGate":
      return resolveTransitionRef(draft, op.ref) >= 0 ? null : `transition ${op.ref.from} → ${op.ref.to}`;
    case "updateRosterMember":
      return draft.roster.some((entry) => entry.id === op.id) ? null : `roster member "${op.id}"`;
    default:
      return null;
  }
};

const exists = (what: string, id: string, update: string, field: string) => `${what} "${id}" already exists; change it with ${update}, or pick a new ${field}`;

export const duplicateTarget = (draft: StoryV2, op: ProposalOp): string | null => {
  if (op.kind === "addQuality" && draft.qualities.some((entry) => entry.key === op.quality.key)) return exists("quality", op.quality.key, "updateQuality", "key");
  if (op.kind === "addCheckpoint" && draft.checkpoints.some((entry) => entry.id === op.checkpoint.id)) return exists("checkpoint", op.checkpoint.id, "updateCheckpoint", "id");
  if (op.kind === "addRosterMember" && draft.roster.some((entry) => entry.id === op.member.id)) return exists("roster member", op.member.id, "updateRosterMember", "id");
  return null;
};

export const applyOpsChecked = (draft: StoryV2, ops: ProposalOp[], stage?: CopilotStage): { next: StoryV2; issues: string[]; stageIssues: string[] } => {
  const issues: string[] = [];
  const stageIssues: string[] = [];
  const next = ops.reduce((current, op, index) => {
    const outOfStage = stage ? stageOpIssue(stage, op, index) : null;
    if (outOfStage) {
      stageIssues.push(outOfStage);
      return current;
    }
    const missing = missingTarget(current, op);
    if (missing) {
      issues.push(`ops.${index}: ${missing} not found`);
      return current;
    }
    const duplicate = duplicateTarget(current, op);
    if (duplicate) {
      issues.push(`ops.${index}: ${duplicate}`);
      return current;
    }
    const ambiguous = ambiguousRef(current, op);
    if (ambiguous) {
      issues.push(`ops.${index}: ${ambiguous}`);
      return current;
    }
    return applyOp(current, op);
  }, draft);
  return { next, issues, stageIssues };
};

export type OpAction = "add" | "update" | "remove" | "provision";

export interface OpDescription {
  action: OpAction;
  entity: string;
  label: string;
}

const refLabel = (ref: TransitionRef): string => `${ref.from} → ${ref.to}`;

export const describeOp = (op: ProposalOp): OpDescription => {
  if (isProvisioningOp(op)) {
    const described = describeProvisioningOp(op);
    return { action: "provision", entity: `st:${op.kind}:${described.target}`, label: described.label };
  }
  switch (op.kind) {
    case "setStoryField":
      return { action: "update", entity: `story.${op.field}`, label: `Set ${op.field} to "${op.value}"` };
    case "addQuality":
      return { action: "add", entity: `quality:${op.quality.key}`, label: `Add quality "${op.quality.key}" (${op.quality.type})` };
    case "updateQuality":
      return { action: "update", entity: `quality:${op.key}`, label: `Update quality "${op.key}"` };
    case "removeQuality":
      return { action: "remove", entity: `quality:${op.key}`, label: `Remove quality "${op.key}"` };
    case "addCheckpoint":
      return { action: "add", entity: `checkpoint:${op.checkpoint.id}`, label: `Add ${op.checkpoint.type} "${op.checkpoint.id}"` };
    case "updateCheckpoint":
      return { action: "update", entity: `checkpoint:${op.id}`, label: `Update checkpoint "${op.id}"` };
    case "removeCheckpoint":
      return { action: "remove", entity: `checkpoint:${op.id}`, label: `Remove checkpoint "${op.id}"` };
    case "setStartCheckpoint":
      return { action: "update", entity: `checkpoint:${op.id}`, label: `Set "${op.id}" as start` };
    case "setCheckpointSnapshot":
      return { action: "update", entity: `checkpoint:${op.id}`, label: `Set snapshot on "${op.id}"` };
    case "setCheckpointEffects":
      return { action: "update", entity: `checkpoint:${op.id}`, label: `Set effects on "${op.id}"` };
    case "addTransition":
      return { action: "add", entity: `transition:${op.transition.from}->${op.transition.to}`, label: `Add transition ${op.transition.from} → ${op.transition.to}` };
    case "updateTransition":
      return { action: "update", entity: `transition:${op.ref.from}->${op.ref.to}`, label: `Update transition ${refLabel(op.ref)}` };
    case "removeTransition":
      return { action: "remove", entity: `transition:${op.ref.from}->${op.ref.to}`, label: `Remove transition ${refLabel(op.ref)}` };
    case "setTransitionGate":
      return { action: "update", entity: `transition:${op.ref.from}->${op.ref.to}`, label: `Set gate on ${refLabel(op.ref)}` };
    case "addRosterMember":
      return { action: "add", entity: `member:${op.member.id}`, label: `Add roster member "${op.member.id}"` };
    case "updateRosterMember":
      return { action: "update", entity: `member:${op.id}`, label: `Update roster member "${op.id}"` };
    case "removeRosterMember":
      return { action: "remove", entity: `member:${op.id}`, label: `Remove roster member "${op.id}"` };
    case "setArcTemplate":
      return {
        action: "update",
        entity: "story.arc_template",
        label: op.template ? `Set dramatic shape to ${typeof op.template === "string" ? op.template : "a custom curve"}` : "Clear the dramatic shape",
      };
    case "setArcBridges":
      return { action: "update", entity: "story.arc_bridges", label: `Set ${op.bridges.length} thread bridge(s)` };
    case "setRequirements":
      return {
        action: "update",
        entity: "story.requirements",
        label: `Require ${[...(op.requirements.personas ?? []), ...(op.requirements.members ?? []), ...(op.requirements.lorebooks ?? [])].join(", ") || "nothing"}`,
      };
    case "setStagecraft":
      return { action: "update", entity: "story.stagecraft", label: op.stagecraft.lorebooks.length ? `Let the curator edit ${op.stagecraft.lorebooks.join(", ")}` : "Give the curator no lorebooks" };
    case "setLoreSelect":
      return { action: "update", entity: "story.lore_select", label: op.loreSelect.lorebooks.length ? `Lore-select may pick from ${op.loreSelect.lorebooks.join(", ")}` : "No lore-select books" };
    case "setSceneRead":
      return { action: "update", entity: "story.scene_read", label: op.sceneRead.locations?.length ? `Scene places: ${op.sceneRead.locations.join(", ")}` : "No scene places" };
    default:
      return { action: "update", entity: "unknown", label: "Unknown change" };
  }
};

export interface ProposalDiffItem extends OpDescription {
  index: number;
  op: ProposalOp;
}

export interface ProposalDiff {
  items: ProposalDiffItem[];
  added: ProposalDiffItem[];
  changed: ProposalDiffItem[];
  removed: ProposalDiffItem[];
  provisioning: ProposalDiffItem[];
}

// `items` stays draft-only: provisioning is reviewed on its own cards and is deliberately outside
// bulk accept (spec addendum §Story wizard — "applied per-op by explicit review").
export const diffProposal = (ops: ProposalOp[]): ProposalDiff => {
  const all: ProposalDiffItem[] = ops.map((op, index) => ({ index, op, ...describeOp(op) }));
  const items = all.filter((item) => item.action !== "provision");
  return {
    items,
    added: items.filter((item) => item.action === "add"),
    changed: items.filter((item) => item.action === "update"),
    removed: items.filter((item) => item.action === "remove"),
    provisioning: all.filter((item) => item.action === "provision"),
  };
};
