import type { ProposalBase } from "./staleProposal";
import type { CardReadBackRecord } from "@utils/cardReadBack";
import type { Chapter, RosterPolish, RosterView, StoryPlayer } from "@engine/index";
import type { ProposalOp } from "../types";
import type { PoseAgentOp } from "./poseOps";
import type { GameAgentOp } from "./gameOps";

export type AgentOnlyOp =
  | { kind: "setFeatures"; features: import("@engine/featurePolicy").StoryFeatures }
  | { kind: "setHouseRules"; rules: string[] }
  | { kind: "setPlayer"; player: StoryPlayer }
  | { kind: "setChapters"; chapters: Chapter[]; assign: Record<string, string> }
  | { kind: "setRosterDrive"; id: string; drive: string }
  | { kind: "setRosterView"; id: string; view: RosterView }
  | { kind: "setCheckpointMotive"; id: string; member: string; motive: string }
  | { kind: "setAppearance"; id: string; appearance: string }
  | { kind: "setMemberPolish"; id: string; polish: RosterPolish | null }
  | GameAgentOp
  | PoseAgentOp;

export type AgentOp = ProposalOp | AgentOnlyOp;

export const AGENT_MODES = ["review", "auto-draft"] as const;
export type AgentMode = (typeof AGENT_MODES)[number];

export type AgentToolFamily = "read" | "edit" | "simulate" | "lookup" | "provision";

export type AgentRouteId = "local" | "harness";

export interface AgentToolCall {
  tool: string;
  args: Record<string, unknown>;
  argsError?: string;
}

export type AgentStepStatus = "observed" | "review" | "replaced" | "pending" | "accepted" | "rejected" | "applied" | "failed" | "refused";

export interface AgentStep {
  id: number;
  at: string;
  route: AgentRouteId;
  thought?: string;
  call: AgentToolCall;
  family: AgentToolFamily | null;
  status: AgentStepStatus;
  op?: AgentOp;
  base?: ProposalBase;
  observation: string;
  reason?: string;
  check?: string;
  replaces?: number;
  notes?: string[];
  readBack?: CardReadBackRecord;
  firstTryValid: boolean;
  repaired: boolean;
}

export interface AgentBudget {
  maxSteps: number;
  maxTokens: number;
  usedTokens: number;
}

export type AgentStatus = "planning" | "awaiting-plan" | "running" | "awaiting-author" | "done" | "stopped" | "budget";

export interface AgentNote {
  role: "author" | "agent";
  text: string;
  at: string;
  onceAt?: number;
}

export interface AgentSession {
  version: 1;
  mode: AgentMode;
  goal: string;
  plan: string[];
  status: AgentStatus;
  steps: AgentStep[];
  notes: AgentNote[];
  budget: AgentBudget;
  summary?: string;
  stopReason?: string;
  fallback?: string;
}

export type AgentReply =
  | { kind: "plan"; plan: string[] }
  | { kind: "call"; thought?: string; call: AgentToolCall }
  | { kind: "done"; summary: string };

export interface AgentLookup {
  characters: () => string[];
  lorebooks: () => string[];
  groups: () => string[];
  backgrounds: () => string[];
}

export const emptyLookup = (): AgentLookup => ({ characters: () => [], lorebooks: () => [], groups: () => [], backgrounds: () => [] });
