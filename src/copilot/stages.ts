import { COPILOT_STAGES, type CopilotStage, type ProposalOp, type ProposalOpKind } from "./types";

export const STAGE_OPS: Record<CopilotStage, readonly ProposalOpKind[]> = {
  qualities: ["setStoryField", "addQuality", "updateQuality", "removeQuality"],
  checkpoints: ["addCheckpoint", "updateCheckpoint", "setStartCheckpoint", "setCheckpointSnapshot"],
  transitions: ["addTransition", "updateTransition", "setTransitionGate"],
  effects: ["setCheckpointEffects", "addRosterMember", "updateRosterMember", "removeRosterMember", "setRequirements", "setStagecraft", "setSceneRead", "setLoreSelect", "setArcTemplate", "setArcBridges", "setStoryField"],
  provisioning: ["createCharacterCard", "createStoryLorebook", "upsertLorebookEntry", "createGroup"],
};

export const stageOnlyEmitLine = (stage: CopilotStage): string => `Only emit ${STAGE_OPS[stage].join("/")} ops.`;

export const defersReachability = (stage: CopilotStage | undefined): boolean =>
  stage !== undefined && COPILOT_STAGES.indexOf(stage) < COPILOT_STAGES.indexOf("transitions");

export const isStageOp = (stage: CopilotStage, kind: ProposalOpKind): boolean => STAGE_OPS[stage].includes(kind);

const allowedBy = (kind: ProposalOpKind): string => {
  const owners = COPILOT_STAGES.filter((stage) => isStageOp(stage, kind));
  return owners.length ? `the ${owners.join(" or ")} stage allows it` : "no wizard stage proposes it";
};

export const stageOpIssue = (stage: CopilotStage, op: ProposalOp, index: number): string | null =>
  isStageOp(stage, op.kind) ? null : `ops.${index}: ${op.kind} is not allowed in the ${stage} stage; ${allowedBy(op.kind)}`;

export const stageOpIssues = (stage: CopilotStage, ops: ProposalOp[]): string[] =>
  ops.flatMap((op, index) => stageOpIssue(stage, op, index) ?? []);
