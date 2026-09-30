import type {
  ArcBridge,
  ArcTemplate,
  Checkpoint,
  CheckpointEffects,
  GateNode,
  PrimitiveValue,
  Quality,
  RosterMember,
  StoryRequirements,
  StoryLoreSelect,
  StorySceneRead,
  StoryStagecraft,
  Transition,
  ValidationError,
} from "@engine/index";
import type { ExtractionReply } from "@extraction/modelRoute";
import type { ProvisioningOp, WizardQuestion } from "@wizard/index";
import type { Diagnostic } from "../studio/diagnostics";

export const COPILOT_STAGES = ["qualities", "checkpoints", "transitions", "effects", "provisioning"] as const;
export type CopilotStage = (typeof COPILOT_STAGES)[number];

export interface TransitionRef {
  from: string;
  to: string;
  priority?: number;
}

export type ProposalOp =
  | { kind: "setStoryField"; field: "title" | "description"; value: string }
  | { kind: "setStoryField"; field: "objective_block"; value: "auto" | "off" }
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
  | { kind: "removeRosterMember"; id: string }
  | { kind: "setArcTemplate"; template: ArcTemplate | null }
  | { kind: "setArcBridges"; bridges: ArcBridge[] }
  | { kind: "setRequirements"; requirements: StoryRequirements }
  | { kind: "setStagecraft"; stagecraft: StoryStagecraft }
  | { kind: "setSceneRead"; sceneRead: StorySceneRead }
  | { kind: "setLoreSelect"; loreSelect: StoryLoreSelect }
  | { kind: "setHouseRules"; rules: string[] }
  | ProvisioningOp;

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
  finish: ExtractionReply["finish"];
  repairPrompt?: string;
  repairResponse?: string;
  repairFinish?: ExtractionReply["finish"];
}

// `questions` is the interview variant (spec addendum §Story wizard): the copilot may ask before it
// proposes, so a thin premise stops producing invented specifics. `proposal.ops` is empty then.
export interface ProposalResult {
  stage: CopilotStage;
  proposal: Proposal;
  preview: { errors: ValidationError[]; diagnostics: Diagnostic[] };
  status: "ok" | "failed" | "questions";
  issues: string[];
  deferred?: string[];
  questions: WizardQuestion[];
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
  ownNote?: boolean;
  objectiveLine?: boolean;
  unmetGates: string[];
  upcomingAnchors: DriverAnchorStatus[];
  blackboard: Record<string, PrimitiveValue>;
  canon: string;
  recentChat: string;
}
