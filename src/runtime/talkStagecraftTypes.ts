import type { TalkDecisionSource } from "@talk/index";
import type { CreatedEntry, CuratorDecline, CuratorPassAudit, CuratorProposalRecord, StagecraftAcceptMode } from "@stagecraft/index";
import type { MeanwhileAcceptMode } from "./agendaProposals";

export interface TalkDecisionAudit {
  at: string;
  messageId: number;
  checkpointId: string;
  chosenRosterId: string | null;
  chosenName: string | null;
  source: TalkDecisionSource;
  latencyMs: number;
  /** Which voice in a chained turn this was; 0 or absent for the first (or only) speaker. */
  chainStep?: number;
  judge?: { confidence: number; via: "choice" | "composite" };
}

export interface TalkRuntimeState {
  enabled: boolean;
  decisions: TalkDecisionAudit[];
}

// `curatorEnabled` is the capability flag (default off until a real run earns it);
// `acceptMode` decides what happens to a proposal: review = wait for the author, auto = apply at the
// next boundary, off = record and journal it but never write.
export interface StagecraftSettings {
  curatorEnabled: boolean;
  acceptMode: StagecraftAcceptMode;
  wardenEnabled: boolean;
  wardenAcceptMode: StagecraftAcceptMode;
  agencyAcceptMode?: StagecraftAcceptMode;
  meanwhileAcceptMode?: MeanwhileAcceptMode;
  livingEnabled?: boolean;
  branchingEnabled?: boolean;
  prefetchEnabled?: boolean;
  createEnabled: boolean;
  createRequireMeasured: boolean;
}

export interface StagecraftRuntimeState {
  settings: StagecraftSettings;
  proposals: CuratorProposalRecord[];
  declines?: CuratorDecline[];
  lastPass: CuratorPassAudit | null;
  lastRunBoundary: number;
  lastError: string | null;
  created?: CreatedEntry[];
  lastCreatePass?: CuratorPassAudit | null;
  lastCreateBoundary?: number;
}
