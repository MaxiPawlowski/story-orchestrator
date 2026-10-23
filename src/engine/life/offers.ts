import { CUE_MEMBER_GAP, OFFERS_PER_GENERATION } from "../cueSchema";
import type { NormalizedStory, PrimitiveValue } from "../schema";
import { isRecord } from "@utils/guards";

export interface RaiseOccurrence {
  chatId: string;
  messageId: number;
  revision: string;
  member: string;
  topicId: string;
}

export type OfferSource =
  | { kind: "cue"; member: string; cueId: string }
  | { kind: "norm"; normId: string; member: string }
  | { kind: "topic"; member: string; topicId: string; tier: number; occurrence: RaiseOccurrence }
  | { kind: "echo"; echoId: string; occurrenceId: string };

export type OfferLane = "must" | "may";
export type OfferCopy = "react" | "must" | "topic" | "echo";
export type OfferSpend = "once" | { max: number } | { cooldown: number };

export interface OfferWindow {
  from: number;
  to: number | null;
}

export interface OfferCandidate {
  key: string;
  defRev: string;
  source: OfferSource;
  recipient: string;
  lane: OfferLane;
  priority: number;
  order: number;
  text: string;
  copy: OfferCopy;
  window: OfferWindow;
  spend: OfferSpend;
  gap: boolean;
}

export interface OfferReceipt {
  key: string;
  defRev: string;
  source: OfferSource;
  recipient: string;
  chatId: string;
  messageId: number;
  revision: string;
  boundary: number;
  textHash: string;
  gap?: true;
}

export type OfferLapseReason = "window-ended" | "held-secret" | "unknown-entity" | "recipient-away" | "recipient-disabled";

export interface OfferLapse {
  key: string;
  recipient: string;
  at: number;
  reason: OfferLapseReason;
  defRev: string;
  source: OfferSource;
}

export interface OfferContext {
  story: NormalizedStory;
  values: Readonly<Record<string, PrimitiveValue>>;
  boundary: number;
  recipient: string;
  chatId: string;
  latestPlayer: { messageId: number; revision: string; text: string } | null;
  receipts: readonly OfferReceipt[];
}

export type OfferProvider = (ctx: OfferContext) => OfferCandidate[];

export interface OfferEvidence {
  receipts: readonly OfferReceipt[];
  consumed: readonly string[];
}

export interface CuesState {
  receipts: OfferReceipt[];
  lapses: OfferLapse[];
  consumed: string[];
}

export const CUE_RECEIPTS_CAP = 300;
export const CUE_LAPSES_CAP = 300;

export const ECHO_HEADER = "Coming back now, already decided by earlier events (bring it into this reply through the world or the people in it; never decide what the player does, says or feels):";

export const CUE_COPY: Record<OfferCopy, (text: string) => string> = {
  react: (text) => `If it fits, you may react to: ${text}. React as yourself; the player's actions and feelings are theirs.`,
  must: (text) => `When it fits, you mean to bring this up: ${text}. Say it as yourself; the player's actions and feelings are theirs.`,
  topic: (text) => `The player asked you about this directly. If it fits, you may tell them: ${text}. Answer as yourself; the player's actions and feelings are theirs.`,
  echo: (text) => `${ECHO_HEADER}\n- ${text}`,
};

export const offerLine = (candidate: Pick<OfferCandidate, "copy" | "text">): string => {
  const text = CUE_COPY[candidate.copy](candidate.text.trim().replace(/[.!?]+$/, ""));
  return candidate.copy === "echo" ? text : `- ${text}`;
};

const SOURCE_RANK: Record<OfferSource["kind"], number> = { topic: 3, echo: 2, norm: 1, cue: 0 };

export const compareOffers = (left: OfferCandidate, right: OfferCandidate): number => {
  if (left.lane !== right.lane) return left.lane === "must" ? -1 : 1;
  if (left.priority !== right.priority) return right.priority - left.priority;
  const rank = SOURCE_RANK[right.source.kind] - SOURCE_RANK[left.source.kind];
  if (rank) return rank;
  if (left.order !== right.order) return left.order - right.order;
  return left.key < right.key ? -1 : left.key > right.key ? 1 : 0;
};

export const occurrenceKey = (occurrence: RaiseOccurrence): string =>
  [occurrence.chatId, occurrence.messageId, occurrence.revision, occurrence.member, occurrence.topicId].join("|");

export const consumedOf = (receipts: readonly OfferReceipt[]): string[] =>
  receipts.flatMap((receipt) => (receipt.source.kind === "topic" ? [occurrenceKey(receipt.source.occurrence)] : []));

export const sameOffer = (receipt: Pick<OfferReceipt, "key" | "defRev">, candidate: Pick<OfferCandidate, "key" | "defRev">): boolean =>
  receipt.key === candidate.key && receipt.defRev === candidate.defRev;

export const inWindow = (candidate: Pick<OfferCandidate, "window">, boundary: number): boolean =>
  candidate.window.from <= boundary && (candidate.window.to === null || boundary <= candidate.window.to);

export const offerSpent = (candidate: OfferCandidate, receipts: readonly OfferReceipt[], boundary: number): boolean => {
  const mine = receipts.filter((receipt) => sameOffer(receipt, candidate));
  const spend = candidate.spend;
  if (spend === "once") return mine.length > 0;
  if ("max" in spend) return mine.length >= spend.max;
  return mine.some((receipt) => boundary - receipt.boundary < spend.cooldown);
};

export const gapHeld = (candidate: OfferCandidate, receipts: readonly OfferReceipt[], boundary: number): boolean =>
  candidate.gap && candidate.lane === "may"
  && receipts.some((receipt) => receipt.gap && receipt.recipient === candidate.recipient && boundary - receipt.boundary < CUE_MEMBER_GAP);

export type OfferDrop = OfferLapseReason | "spent" | "gap" | "not-yet";

export interface RankedOffer {
  candidate: OfferCandidate;
  line: string;
}

export interface OfferSelection {
  ranked: RankedOffer[];
  dropped: Array<{ candidate: OfferCandidate; reason: OfferDrop }>;
  winner: RankedOffer | null;
  tiedWith: string[];
}

export interface SelectInput {
  candidates: readonly OfferCandidate[];
  receipts: readonly OfferReceipt[];
  boundary: number;
  recipient: "ok" | "recipient-away" | "recipient-disabled";
  refuse: (line: string, candidate: OfferCandidate) => "held-secret" | "unknown-entity" | null;
}

const dropOf = (input: SelectInput, candidate: OfferCandidate, line: string): OfferDrop | null => {
  if (input.recipient !== "ok") return input.recipient;
  if (candidate.window.from > input.boundary) return "not-yet";
  if (!inWindow(candidate, input.boundary)) return "window-ended";
  if (offerSpent(candidate, input.receipts, input.boundary)) return "spent";
  if (gapHeld(candidate, input.receipts, input.boundary)) return "gap";
  return input.refuse(line, candidate);
};

export const selectOffer = (input: SelectInput): OfferSelection => {
  const ranked: RankedOffer[] = [];
  const dropped: OfferSelection["dropped"] = [];
  [...input.candidates].sort(compareOffers).forEach((candidate) => {
    const line = offerLine(candidate);
    const reason = dropOf(input, candidate, line);
    if (reason) dropped.push({ candidate, reason });
    else ranked.push({ candidate, line });
  });
  const winner = ranked.slice(0, OFFERS_PER_GENERATION)[0] ?? null;
  const tiedWith = winner ? ranked.slice(1).filter(({ candidate }) => candidate.lane === winner.candidate.lane && candidate.priority === winner.candidate.priority
    && candidate.source.kind === winner.candidate.source.kind).map(({ candidate }) => candidate.key) : [];
  return { ranked, dropped, winner, tiedWith };
};

export const createCues = (): CuesState => ({ receipts: [], lapses: [], consumed: [] });

const isSource = (value: unknown): value is OfferSource => isRecord(value) && ["cue", "norm", "topic", "echo"].includes(String(value.kind))
  && (value.kind !== "topic" || (isRecord(value.occurrence) && typeof value.occurrence.messageId === "number"));

const isReceipt = (value: unknown): value is OfferReceipt => isRecord(value) && typeof value.key === "string" && typeof value.defRev === "string"
  && typeof value.recipient === "string" && typeof value.messageId === "number" && typeof value.revision === "string" && typeof value.boundary === "number" && isSource(value.source);

const isLapse = (value: unknown): value is OfferLapse => isRecord(value) && typeof value.key === "string" && typeof value.recipient === "string"
  && typeof value.at === "number" && typeof value.reason === "string" && typeof value.defRev === "string" && isSource(value.source);

export const sanitizeCues = (value: unknown): CuesState => {
  const receipts = isRecord(value) && Array.isArray(value.receipts) ? value.receipts.filter(isReceipt) : [];
  const lapses = isRecord(value) && Array.isArray(value.lapses) ? value.lapses.filter(isLapse) : [];
  return { receipts, lapses, consumed: consumedOf(receipts) };
};

export const withCueReceipt = (state: CuesState, receipt: OfferReceipt, floor: number | null): CuesState => {
  let receipts = [...state.receipts.filter((row) => !(sameOffer(row, receipt) && row.messageId === receipt.messageId)), receipt];
  while (receipts.length > CUE_RECEIPTS_CAP && floor !== null && receipts[0].messageId < floor) receipts = receipts.slice(1);
  return { ...state, receipts, consumed: consumedOf(receipts) };
};

export const withCueLapses = (state: CuesState, lapses: readonly OfferLapse[]): CuesState => {
  const fresh = lapses.filter((lapse) => !state.lapses.some((row) => row.key === lapse.key && row.defRev === lapse.defRev));
  return fresh.length ? { ...state, lapses: [...state.lapses, ...fresh].slice(-CUE_LAPSES_CAP) } : state;
};

export const rollbackCues = (state: CuesState, messageId: number, boundary: number): CuesState => {
  const receipts = state.receipts.filter((receipt) => receipt.messageId < messageId
    && (receipt.source.kind !== "topic" || receipt.source.occurrence.messageId < messageId));
  return { receipts, lapses: state.lapses.filter((lapse) => lapse.at <= boundary), consumed: consumedOf(receipts) };
};

export const liveCueReceipts = (receipts: readonly OfferReceipt[], revisionAt: (messageId: number) => string | null): OfferReceipt[] =>
  receipts.filter((receipt) => revisionAt(receipt.messageId) === receipt.revision
    && (receipt.source.kind !== "topic" || revisionAt(receipt.source.occurrence.messageId) === receipt.source.occurrence.revision));

export const rearmCues = (state: CuesState, revisionAt: (messageId: number) => string | null): CuesState | null => {
  const receipts = liveCueReceipts(state.receipts, revisionAt);
  return receipts.length === state.receipts.length ? null : { ...state, receipts, consumed: consumedOf(receipts) };
};

export const rebindCueReceipts = (state: CuesState, messageId: number, revision: string): CuesState =>
  ({ ...state, receipts: state.receipts.map((receipt) => (receipt.messageId === messageId ? { ...receipt, revision } : receipt)) });

export const cueEvidence = (receipts: readonly OfferReceipt[]): OfferEvidence => Object.freeze({
  receipts: Object.freeze(receipts.map((receipt) => Object.freeze({ ...receipt }))), consumed: Object.freeze(consumedOf(receipts)),
});
