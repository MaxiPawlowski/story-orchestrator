import { agendaStepKey, type NormalizedStoryV2, type PrimitiveValue } from "@engine/index";
import { isRecord } from "@utils/guards";

export const PROPOSAL_RING_CAP = 40;
export const MEANWHILE_PASS_CAP = 64;
export const MEANWHILE_MIN_GAP = 8;
export const PROPOSAL_STATUSES = ["proposed", "accepted", "applied", "rejected"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];
export const MEANWHILE_ACCEPT_MODES = ["review", "off"] as const;
export type MeanwhileAcceptMode = (typeof MEANWHILE_ACCEPT_MODES)[number];
export const DEFAULT_MEANWHILE_ACCEPT_MODE: MeanwhileAcceptMode = "review";

export interface ProposalLanding {
  boundary: number;
  messageId: number;
}

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
  appliedAt?: ProposalLanding;
}

export interface MeanwhilePass extends ProposalLanding {
  reason: string;
}

export interface AgendaProposalsState {
  proposals: MeanwhileProposal[];
  passes: MeanwhilePass[];
}

export const createAgendaProposals = (): AgendaProposalsState => ({ proposals: [], passes: [] });

export const isMeanwhileAcceptMode = (value: unknown): value is MeanwhileAcceptMode => MEANWHILE_ACCEPT_MODES.some((mode) => mode === value);

const readWindow = (value: unknown): MeanwhileProposal["sourceWindow"] | null =>
  (isRecord(value) && Number.isInteger(value.from) && Number.isInteger(value.to) ? { from: value.from as number, to: value.to as number } : null);

const readLanding = (value: unknown): ProposalLanding | null =>
  (isRecord(value) && Number.isInteger(value.boundary) && Number.isInteger(value.messageId) ? { boundary: value.boundary as number, messageId: value.messageId as number } : null);

const readProposal = (value: unknown): MeanwhileProposal | null => {
  if (!isRecord(value)) return null;
  const window = readWindow(value.sourceWindow);
  const text = (key: string) => (typeof value[key] === "string" ? (value[key] as string) : null);
  const status = PROPOSAL_STATUSES.find((entry) => entry === value.status);
  const [id, memberId, agendaId, body, reason] = ["id", "memberId", "agendaId", "text", "reason"].map(text);
  if (!id || !memberId || !agendaId || !body || reason === null || !window || !status || !Number.isInteger(value.boundary)) return null;
  const decision = text("decision");
  const landing = readLanding(value.appliedAt);
  if (status === "applied" && !landing) return null;
  return {
    id, memberId, agendaId, text: body, public: false, reason, sourceWindow: window, boundary: value.boundary as number, status,
    ...(decision ? { decision } : {}), ...(status === "applied" && landing ? { appliedAt: landing } : {}),
  };
};

const readPass = (value: unknown): MeanwhilePass | null => {
  const landing = readLanding(value);
  return landing && isRecord(value) && typeof value.reason === "string" ? { ...landing, reason: value.reason } : null;
};

export const sanitizeAgendaProposals = (value: unknown): AgendaProposalsState | undefined => {
  if (!isRecord(value) || !Array.isArray(value.proposals)) return undefined;
  return {
    proposals: value.proposals.map(readProposal).filter((entry): entry is MeanwhileProposal => entry !== null).slice(-PROPOSAL_RING_CAP),
    passes: (Array.isArray(value.passes) ? value.passes : []).map(readPass).filter((entry): entry is MeanwhilePass => entry !== null).slice(-MEANWHILE_PASS_CAP),
  };
};

const unland = (proposal: MeanwhileProposal): MeanwhileProposal => {
  const next: MeanwhileProposal = { ...proposal, status: "accepted" };
  delete next.appliedAt;
  return next;
};

export const rollbackAgendaProposals = (state: AgendaProposalsState, messageId: number): AgendaProposalsState => {
  const kept = state.proposals.filter((proposal) => proposal.sourceWindow.to < messageId);
  const proposals = kept.map((proposal) => (proposal.appliedAt && proposal.appliedAt.messageId >= messageId ? unland(proposal) : proposal));
  const passes = state.passes.filter((pass) => pass.messageId < messageId);
  const changed = kept.length !== state.proposals.length || proposals.some((proposal, index) => proposal !== kept[index]) || passes.length !== state.passes.length;
  return changed ? { proposals, passes } : state;
};

export const landAcceptedProposals = (state: AgendaProposalsState, at: ProposalLanding): AgendaProposalsState => {
  if (!state.proposals.some((proposal) => proposal.status === "accepted")) return state;
  return { ...state, proposals: state.proposals.map((proposal) => (proposal.status === "accepted" ? { ...proposal, status: "applied", appliedAt: { ...at } } : proposal)) };
};

export const recordMeanwhilePass = (state: AgendaProposalsState, pass: MeanwhilePass): AgendaProposalsState =>
  ({ ...state, passes: [...state.passes, pass].slice(-MEANWHILE_PASS_CAP) });

export const decideProposal = (state: AgendaProposalsState, id: string, status: "accepted" | "rejected", reason = ""): AgendaProposalsState | null => {
  const proposal = state.proposals.find((entry) => entry.id === id && entry.status === "proposed");
  if (!proposal) return null;
  return { ...state, proposals: state.proposals.map((entry) => (entry === proposal ? { ...entry, status, ...(reason ? { decision: reason } : {}) } : entry)) };
};

export const landedMeanwhile = (state: AgendaProposalsState | undefined, memberId: string): string[] =>
  (state?.proposals ?? []).filter((proposal) => proposal.status === "applied" && proposal.memberId === memberId).map((proposal) => proposal.text);

export const hasOpenAgenda = (story: NormalizedStoryV2 | null, values: Readonly<Record<string, PrimitiveValue>>): boolean =>
  (story?.life?.members ?? []).some((member) => member.agenda.some((agenda) => {
    const done = Number(values[agendaStepKey(member.id, agenda.id)] ?? 0);
    return done < agenda.steps.length || agenda.steps.at(-1)?.repeat === true;
  }));

export interface MeanwhileDueInput {
  mode: MeanwhileAcceptMode;
  boundary: number;
  openAgenda: boolean;
}

export const meanwhileDue = (state: AgendaProposalsState | undefined, input: MeanwhileDueInput): boolean => {
  if (input.mode === "off" || !input.openAgenda) return false;
  if (state?.proposals.some((proposal) => proposal.status === "proposed")) return false;
  const last = state?.passes.at(-1);
  return !last || input.boundary - last.boundary >= MEANWHILE_MIN_GAP;
};
