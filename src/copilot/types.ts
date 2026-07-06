import type {
  Checkpoint,
  CheckpointEffects,
  GateNode,
  PrimitiveValue,
  Quality,
  RosterMember,
  Transition,
  ValidationError,
} from "@engine/index";
import type { Diagnostic } from "../studio/diagnostics";

export const COPILOT_STAGES = ["qualities", "checkpoints", "transitions", "effects"] as const;
export type CopilotStage = (typeof COPILOT_STAGES)[number];

export interface TransitionRef {
  from: string;
  to: string;
  priority?: number;
}

export type ProposalOp =
  | { kind: "setStoryField"; field: "title" | "description"; value: string }
  | { kind: "addQuality"; quality: Quality }
  | { kind: "updateQuality"; key: string; patch: Partial<Quality> }
  | { kind: "removeQuality"; key: string }
  | { kind: "addCheckpoint"; checkpoint: Checkpoint }
  | { kind: "updateCheckpoint"; id: string; patch: Partial<Checkpoint> }
  | { kind: "removeCheckpoint"; id: string }
  | { kind: "setStartCheckpoint"; id: string }
  | { kind: "setCheckpointSnapshot"; id: string; snapshot: Record<string, PrimitiveValue> }
  | { kind: "setCheckpointEffects"; id: string; effects: CheckpointEffects }
  | { kind: "addTransition"; transition: Transition }
  | { kind: "updateTransition"; ref: TransitionRef; patch: Partial<Transition> }
  | { kind: "removeTransition"; ref: TransitionRef }
  | { kind: "setTransitionGate"; ref: TransitionRef; gate: GateNode }
  | { kind: "addRosterMember"; member: RosterMember }
  | { kind: "updateRosterMember"; id: string; patch: Partial<RosterMember> }
  | { kind: "removeRosterMember"; id: string };

export type ProposalOpKind = ProposalOp["kind"];

export interface Proposal {
  summary: string;
  ops: ProposalOp[];
}

export interface CopilotMessage {
  role: "author" | "copilot";
  text: string;
}

export interface CopilotAudit {
  prompt: string;
  rawResponse: string;
  repairPrompt?: string;
  repairResponse?: string;
}

export interface ProposalResult {
  stage: CopilotStage;
  proposal: Proposal;
  preview: { errors: ValidationError[]; diagnostics: Diagnostic[] };
  status: "ok" | "failed";
  issues: string[];
  audit: CopilotAudit;
}

export interface Suggestion {
  title: string;
  rationale: string;
}

export interface DriverAnchorStatus {
  id: string;
  name: string;
  progress: number;
  threshold: number;
}

export interface DriverContext {
  title: string;
  activeCheckpointId: string | null;
  activeObjective: string;
  unmetGates: string[];
  upcomingAnchors: DriverAnchorStatus[];
  blackboard: Record<string, PrimitiveValue>;
  canon: string;
  recentChat: string;
}
