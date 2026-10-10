import { isRecord } from "@utils/guards";
import { createDivergenceState, createLivingState, type DirectorProposal, type DivergenceState, type LivingOp, type LivingRuntimeState } from "./types";

const OP_KINDS = ["add-checkpoint", "add-transition", "add-stub", "add-quality", "add-chapter"];
const STATUSES = ["proposed", "accepted", "applied", "rejected", "withdrawn", "failed"];

const isOp = (value: unknown): value is LivingOp => isRecord(value) && typeof value.id === "string" && typeof value.proposalId === "string"
  && typeof value.boundary === "number" && Number.isFinite(value.boundary) && typeof value.messageId === "number" && OP_KINDS.includes(String(value.kind));

const isProposal = (value: unknown): value is DirectorProposal => isRecord(value) && typeof value.id === "string" && STATUSES.includes(String(value.status))
  && typeof value.epoch === "string" && typeof value.frontierId === "string" && Array.isArray(value.ops) && Array.isArray(value.issues);

const sanitizeDivergence = (value: unknown): DivergenceState | undefined => {
  if (!isRecord(value)) return undefined;
  const base = createDivergenceState();
  return {
    ...base,
    checkpointId: typeof value.checkpointId === "string" ? value.checkpointId : null,
    streak: typeof value.streak === "number" && Number.isFinite(value.streak) ? value.streak : 0,
    lastBoundary: typeof value.lastBoundary === "number" && Number.isFinite(value.lastBoundary) ? value.lastBoundary : -1,
    branchedFrom: Array.isArray(value.branchedFrom) ? value.branchedFrom.filter((id): id is string => typeof id === "string") : [],
  };
};

export const sanitizeLivingState = (value: unknown): LivingRuntimeState | undefined => {
  if (!isRecord(value)) return undefined;
  const base = createLivingState();
  const authored = isRecord(value.authored) && isRecord(value.authored.raw) && typeof value.authored.hash === "string"
    ? { raw: value.authored.raw, hash: value.authored.hash } : null;
  const lastPass = isRecord(value.lastPass) && typeof value.lastPass.boundary === "number" && typeof value.lastPass.frontierId === "string" && typeof value.lastPass.at === "string"
    ? { boundary: value.lastPass.boundary, frontierId: value.lastPass.frontierId, at: value.lastPass.at } : null;
  const divergence = sanitizeDivergence(value.divergence);
  return {
    ...base,
    authored,
    folded: Array.isArray(value.folded) ? value.folded.filter(isOp) : [],
    ops: Array.isArray(value.ops) ? value.ops.filter(isOp) : [],
    proposals: Array.isArray(value.proposals) ? value.proposals.filter(isProposal) : [],
    epochBumps: typeof value.epochBumps === "number" && Number.isFinite(value.epochBumps) ? value.epochBumps : 0,
    passes: typeof value.passes === "number" && Number.isFinite(value.passes) ? value.passes : 0,
    lastPass,
    ...(divergence ? { divergence } : {}),
  };
};
