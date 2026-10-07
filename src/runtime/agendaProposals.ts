import { isRecord } from "@utils/guards";

export const PROPOSAL_RING_CAP = 40;
export const PROPOSAL_STATUSES = ["proposed", "accepted", "rejected"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export interface MeanwhileProposal {
  id: string;
  memberId: string;
  agendaId: string;
  text: string;
  public: false;
  reason: string;
  sourceWindow: { from: number; to: number };
  boundary: number;
  status: ProposalStatus;
  decision?: string;
}

export interface AgendaProposalsState {
  proposals: MeanwhileProposal[];
}

export const createAgendaProposals = (): AgendaProposalsState => ({ proposals: [] });

const readWindow = (value: unknown): MeanwhileProposal["sourceWindow"] | null =>
  (isRecord(value) && Number.isInteger(value.from) && Number.isInteger(value.to) ? { from: value.from as number, to: value.to as number } : null);

const readProposal = (value: unknown): MeanwhileProposal | null => {
  if (!isRecord(value)) return null;
  const window = readWindow(value.sourceWindow);
  const text = (key: string) => (typeof value[key] === "string" ? (value[key] as string) : null);
  const status = PROPOSAL_STATUSES.find((entry) => entry === value.status);
  const [id, memberId, agendaId, body, reason] = ["id", "memberId", "agendaId", "text", "reason"].map(text);
  if (!id || !memberId || !agendaId || !body || reason === null || !window || !status || !Number.isInteger(value.boundary)) return null;
  const decision = text("decision");
  return { id, memberId, agendaId, text: body, public: false, reason, sourceWindow: window, boundary: value.boundary as number, status, ...(decision ? { decision } : {}) };
};

export const sanitizeAgendaProposals = (value: unknown): AgendaProposalsState | undefined => {
  if (!isRecord(value) || !Array.isArray(value.proposals)) return undefined;
  return { proposals: value.proposals.map(readProposal).filter((entry): entry is MeanwhileProposal => entry !== null).slice(-PROPOSAL_RING_CAP) };
};

export const rollbackAgendaProposals = (state: AgendaProposalsState, messageId: number): AgendaProposalsState => {
  const kept = state.proposals.filter((proposal) => proposal.sourceWindow.to < messageId);
  return kept.length === state.proposals.length ? state : { proposals: kept };
};

export const acceptedMeanwhile = (state: AgendaProposalsState | undefined, memberId: string): string[] =>
  (state?.proposals ?? []).filter((proposal) => proposal.status === "accepted" && proposal.memberId === memberId).map((proposal) => proposal.text);
