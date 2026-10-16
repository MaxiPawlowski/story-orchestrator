import { sameRevision, type SourceRevision, type SourceSpan, type WitnessLookup } from "./audience";

export type AddBasis =
  | { kind: "witnessed"; witness: WitnessLookup | null }
  | { kind: "told"; telling: SourceSpan; receiver: string }
  | { kind: "disclosure"; recipient: string };

export interface LiveMessage {
  revision: SourceRevision | null;
  hidden: boolean;
}

export interface AddRequest {
  member: string;
  source: SourceSpan;
  text: string;
  live: LiveMessage | null;
  basis: AddBasis | null;
  keptFrom?: (text: string) => boolean;
}

export type AddRefusal =
  | "message removed"
  | "message changed"
  | "message hidden"
  | "no positive relation"
  | "not witnessed"
  | "witness unknown"
  | "mixed message"
  | "origin of a telling"
  | "told someone else"
  | "disclosed to someone else"
  | "held secret";

export type AddVerdict = { ok: true; basis: AddBasis["kind"] } | { ok: false; reason: AddRefusal; state?: WitnessLookup["state"] };

const inside = (inner: SourceSpan, outer: SourceSpan): boolean =>
  inner.chatId === outer.chatId && inner.messageId === outer.messageId && inner.revision.hash === outer.revision.hash
  && inner.span[0] >= outer.span[0] && inner.span[1] <= outer.span[1];

const provenance = (request: AddRequest, basis: AddBasis): AddVerdict => {
  if (basis.kind === "disclosure") return basis.recipient === request.member ? { ok: true, basis: "disclosure" } : { ok: false, reason: "disclosed to someone else" };
  if (basis.kind === "told") {
    if (basis.receiver !== request.member) return { ok: false, reason: "told someone else" };
    return inside(request.source, basis.telling) ? { ok: true, basis: "told" } : { ok: false, reason: "origin of a telling" };
  }
  const witness = basis.witness;
  if (!witness || witness.state !== "classified") return { ok: false, reason: "witness unknown", state: witness?.state ?? "unknown" };
  if (witness.mixed && !witness.insideHeardSpan) return { ok: false, reason: "mixed message", state: witness.state };
  if (witness.heard === "no") return { ok: false, reason: "not witnessed", state: witness.state };
  if (witness.heard !== "yes") return { ok: false, reason: "witness unknown", state: witness.state };
  return { ok: true, basis: "witnessed" };
};

export function mayAdd(request: AddRequest): AddVerdict {
  if (!request.live) return { ok: false, reason: "message removed" };
  if (!sameRevision(request.source.revision, request.live.revision)) return { ok: false, reason: "message changed" };
  if (request.live.hidden) return { ok: false, reason: "message hidden" };
  if (!request.basis) return { ok: false, reason: "no positive relation" };
  const verdict = provenance(request, request.basis);
  if (!verdict.ok) return verdict;
  return request.keptFrom?.(request.text) ? { ok: false, reason: "held secret" } : verdict;
}

export const mayRemove = (parts: readonly WitnessLookup[]): boolean =>
  parts.length > 0 && parts.every((part) => part.state === "classified" && part.heard === "no");
