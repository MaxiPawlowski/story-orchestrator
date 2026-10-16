import type { SourceSpan } from "../audience";
import { mayAdd, type AddBasis, type AddRefusal, type AddVerdict } from "../audienceRules";
import { keptFrom, type HeldSecret } from "../heldSecrets";
import { witnessLookup } from "../witness/record";
import type { WitnessRecordState } from "../witness/types";
import { liveMessage, type RecallMessage } from "./live";

export interface RecallCandidate {
  source: SourceSpan;
  text: string;
}

export interface RecallTelling {
  receiver: string;
  telling: SourceSpan;
  origin: SourceSpan;
}

export interface RecallMember {
  id: string;
  names: string[];
}

export interface RecallEligibilityContext {
  member: RecallMember;
  chat: readonly RecallMessage[];
  witness: WitnessRecordState;
  tellings: readonly RecallTelling[];
  secrets: readonly HeldSecret[];
}

const PROVENANCE: ReadonlySet<AddRefusal> = new Set(["not witnessed", "witness unknown", "mixed message", "no positive relation"]);

const within = (inner: SourceSpan, outer: SourceSpan): boolean =>
  inner.chatId === outer.chatId && inner.messageId === outer.messageId && inner.revision.hash === outer.revision.hash
  && inner.span[0] >= outer.span[0] && inner.span[1] <= outer.span[1];

export function recallVerdict(candidate: RecallCandidate, ctx: RecallEligibilityContext): AddVerdict {
  const { source } = candidate;
  const live = liveMessage(ctx.chat, source.messageId);
  const request = (basis: AddBasis) => mayAdd({
    member: ctx.member.id, source, text: candidate.text, live, basis, keptFrom: (text) => keptFrom(text, ctx.secrets, ctx.member.names),
  });
  const witness = live ? witnessLookup(ctx.witness, ctx.member.id, source.messageId, source.span, live.revision) : null;
  const witnessed = request({ kind: "witnessed", witness });
  if (witnessed.ok || !PROVENANCE.has(witnessed.reason)) return witnessed;
  const mine = ctx.tellings.filter((entry) => entry.receiver === ctx.member.id);
  const telling = mine.find((entry) => within(source, entry.telling)) ?? mine.find((entry) => within(source, entry.origin));
  return telling ? request({ kind: "told", telling: telling.telling, receiver: ctx.member.id }) : witnessed;
}

export const isProvenanceRefusal = (verdict: AddVerdict): boolean => !verdict.ok && verdict.reason !== "held secret";
