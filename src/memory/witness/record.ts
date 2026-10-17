import { fnv1a } from "@runtime/hash";
import { sameRevision, unknownWitness, type RelationValue, type SourceRevision, type WitnessLookup, type WitnessState } from "../audience";
import {
  WITNESS_READ_CAP, WITNESS_TOMBSTONE_CAP,
  type HeardList, type WitnessAudit, type WitnessClaim, type WitnessFolded, type WitnessRead, type WitnessRecordState,
} from "./types";

const covers = (range: { from: number; to: number }, messageId: number): boolean => messageId >= range.from && messageId <= range.to;

const claimFor = (read: WitnessRead, messageId: number): WitnessClaim | undefined => read.claims.find((claim) => claim.messageId === messageId);

const fold = (state: WitnessRecordState, cap: number): WitnessRecordState => {
  if (state.reads.length <= cap) return state;
  const evicted = state.reads.slice(0, state.reads.length - cap);
  const reads = state.reads.slice(-cap);
  const accepted = evicted.filter((read) => read.status === "accepted");
  const winners = new Map<number, WitnessFolded>(state.folded.map((row) => [row.claim.messageId, row]));
  accepted.forEach((read) => read.claims.forEach((claim) => winners.set(claim.messageId, { readId: read.readId, inputRange: { from: read.inputRange.from, to: read.inputRange.to }, claim })));
  return { ...state, reads, folded: [...winners.values()].sort((left, right) => left.claim.messageId - right.claim.messageId) };
};

export function acceptWitnessRead(state: WitnessRecordState, readId: string, audit: WitnessAudit, cap = WITNESS_READ_CAP): WitnessRecordState {
  if (state.reads.some((read) => read.readId === readId)) return state;
  const read: WitnessRead = { readId, status: audit.status, inputRange: audit.inputRange, claims: audit.status === "accepted" ? audit.claims : [] };
  const named = new Set(read.claims.map((claim) => claim.messageId));
  const invalidated = read.status === "accepted"
    ? state.invalidated.filter((row) => !Array.from({ length: row.to - row.from + 1 }, (_, offset) => row.from + offset).every((id) => named.has(id)))
    : state.invalidated;
  return fold({ ...state, reads: [...state.reads, read], invalidated: invalidated.slice(-WITNESS_TOMBSTONE_CAP) }, cap);
}

export interface Winner {
  claim: WitnessClaim | null;
  state: WitnessState;
}

export function winningClaim(state: WitnessRecordState, messageId: number, live?: SourceRevision | null): Winner {
  const accepted = state.reads.filter((read) => read.status === "accepted");
  for (let index = accepted.length - 1; index >= 0; index -= 1) {
    const claim = claimFor(accepted[index], messageId);
    if (claim) return live !== undefined && !sameRevision(claim.revision, live) ? { claim: null, state: "invalidated" } : { claim, state: "classified" };
  }
  const folded = state.folded.find((row) => row.claim.messageId === messageId);
  if (folded) return live !== undefined && !sameRevision(folded.claim.revision, live) ? { claim: null, state: "invalidated" } : { claim: folded.claim, state: "classified" };
  if (accepted.some((read) => covers(read.inputRange, messageId))) return { claim: null, state: "unknown" };
  const newestFailed = [...state.reads].reverse().find((read) => read.status !== "accepted" && covers(read.inputRange, messageId));
  if (newestFailed) return { claim: null, state: newestFailed.status === "outage" ? "outage" : "no-read" };
  if (state.invalidated.some((row) => covers(row, messageId))) return { claim: null, state: "invalidated" };
  const newest = Math.max(-1, ...accepted.map((read) => read.inputRange.to), ...state.folded.map((row) => row.inputRange.to));
  return { claim: null, state: messageId > newest ? "pending" : "no-read" };
}

export const witnessState = (state: WitnessRecordState, messageId: number, live?: SourceRevision | null): WitnessState => {
  const winner = winningClaim(state, messageId, live);
  return winner.state === "classified" && winner.claim && !winner.claim.mixed && winner.claim.heard.kind === "unknown" ? "unknown" : winner.state;
};

export const heardBy = (heard: HeardList, member: string): RelationValue =>
  (heard.kind === "unknown" ? "unknown" : heard.members.includes(member) ? "yes" : "no");

export function witnessLookup(state: WitnessRecordState, member: string, messageId: number, span?: [number, number], live?: SourceRevision | null): WitnessLookup {
  const winner = winningClaim(state, messageId, live);
  if (winner.state !== "classified" || !winner.claim) return unknownWitness(winner.state);
  const { claim } = winner;
  if (!claim.mixed) {
    const heard = heardBy(claim.heard, member);
    return { state: claim.heard.kind === "unknown" ? "unknown" : "classified", heard, mixed: false, insideHeardSpan: false };
  }
  const part = span ? claim.spans.find((entry) => span[0] >= entry.span[0] && span[1] <= entry.span[1]) : undefined;
  if (!part) {
    const heard: RelationValue = claim.spans[0]?.span[0] === 0 && claim.spans.every((entry) => heardBy(entry.heard, member) === "no") ? "no" : "unknown";
    return { state: "classified", heard, mixed: true, insideHeardSpan: false };
  }
  const heard = heardBy(part.heard, member);
  return { state: "classified", heard, mixed: true, insideHeardSpan: heard === "yes" };
}

export const witnessParts = (state: WitnessRecordState, member: string, messageId: number, live?: SourceRevision | null): WitnessLookup[] => {
  const winner = winningClaim(state, messageId, live);
  if (winner.state !== "classified" || !winner.claim) return [unknownWitness(winner.state)];
  const claim = winner.claim;
  if (!claim.mixed) return [witnessLookup(state, member, messageId, undefined, live)];
  const covered = claim.spans[0]?.span[0] === 0;
  return [...(covered ? [] : [unknownWitness("unknown")]),
    ...claim.spans.map((entry) => ({ state: entry.heard.kind === "unknown" ? "unknown" as const : "classified" as const, heard: heardBy(entry.heard, member), mixed: true, insideHeardSpan: false }))];
};

export const witnessRevision = (state: WitnessRecordState): string => fnv1a([
  ...state.reads.map((read) => read.readId), "|", ...state.folded.map((row) => `${row.readId}:${row.claim.messageId}`), "|", ...state.invalidated.map((row) => `${row.readId}:${row.to}`),
].join(","));
