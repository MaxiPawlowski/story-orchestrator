import { CUE_PRIORITY } from "../cueSchema";
import { echoHold, type StoryEcho } from "../echoSchema";
import type { NormalizedStory, PrimitiveValue } from "../schema";
import { dueRank } from "./due";
import { echoDefinition, echoWaitReason, type EchoAt, type EchoEvent, type EchoesState, type EchoGap, type EchoRefusal, type EchoStepResult, type EchoWait } from "./echoes";
import type { OfferCandidate, OfferReceipt } from "./offers";

type Values = Readonly<Record<string, PrimitiveValue>>;

export const echoWindow = (event: Pick<EchoEvent, "landedAt">, echo: Pick<StoryEcho, "hold">): { from: number; to: number } => {
  const from = event.landedAt?.boundary ?? 0;
  return { from, to: from + echoHold(echo) - 1 };
};

export const echoCandidate = (event: EchoEvent, echo: StoryEcho): OfferCandidate => ({
  key: event.offerId ?? `echo:${event.occurrenceId}`, defRev: event.revision, source: { kind: "echo", echoId: event.echoId, occurrenceId: event.occurrenceId },
  recipient: event.recipient, lane: "may", priority: CUE_PRIORITY.echo, order: dueRank(event.due), text: echo.cue, copy: "echo",
  window: echoWindow(event, echo), spend: "once", gap: false,
});

export const echoCandidates = (story: Pick<NormalizedStory, "echoes">, state: EchoesState | undefined, recipient: string): OfferCandidate[] =>
  (state?.events ?? []).flatMap((event) => {
    if (event.status !== "landed" || event.recipient !== recipient) return [];
    const echo = echoDefinition(story, event);
    return echo ? [echoCandidate(event, echo)] : [];
  });

export type EchoLifecycle = "scheduled" | "due" | "waiting" | "landed-to-channel" | "offered" | "cancelled" | "expired" | "lapsed";

export interface EchoAuthorRow {
  occurrenceId: string;
  echoId: string;
  recipient: string;
  source: string;
  state: EchoLifecycle;
  detail: string;
}

export interface EchoAuthorView {
  rows: EchoAuthorRow[];
  gaps: EchoGap[];
}

export interface EchoViewInput {
  story: NormalizedStory;
  state: EchoesState | undefined;
  values: Values;
  at: EchoAt;
  clock: number | null;
  enabled: readonly string[];
  refuse: (text: string, recipient: string) => EchoRefusal | null;
  receipts: readonly OfferReceipt[];
}

const WAIT_COPY: Record<EchoWait, string> = {
  when: "its when gate does not hold",
  recipient: "the recipient is not in the scene",
  secret: "the cue restates a secret kept from this audience",
  "unknown-name": "the cue names someone or somewhere the player has not met",
  capacity: "other echoes landed first",
};

const dueText = (event: EchoEvent): string => ("boundary" in event.due ? `turn ${event.due.boundary}` : `story time ${event.due.part}`);

const sourceText = (event: EchoEvent): string => `${event.source.kind} ${event.source.id}${event.source.to ? ` -> ${event.source.to}` : ""} at turn ${event.source.boundary}`;

const isReached = (event: EchoEvent, input: EchoViewInput): boolean =>
  input.at.boundary > event.source.boundary && ("boundary" in event.due ? event.due.boundary <= input.at.boundary : input.clock !== null && event.due.part <= input.clock);

const lifecycle = (event: EchoEvent, input: EchoViewInput): Pick<EchoAuthorRow, "state" | "detail"> => {
  if (event.status === "landed") {
    const receipt = input.receipts.find((row) => row.key === event.offerId && row.defRev === event.revision);
    if (receipt) return { state: "offered", detail: `reached ${event.recipient} in message ${receipt.messageId}` };
    return { state: "landed-to-channel", detail: `offer ${event.offerId ?? ""} from turn ${event.landedAt?.boundary ?? "?"}` };
  }
  if (event.status !== "scheduled") return { state: event.status, detail: `at turn ${event.closedAt?.boundary ?? "?"}` };
  if (!isReached(event, input)) return { state: "scheduled", detail: `due ${dueText(event)}` };
  const echo = echoDefinition(input.story, event);
  const reason = echo ? echoWaitReason(input, event, echo) : null;
  return reason ? { state: "waiting", detail: WAIT_COPY[reason] } : { state: "due", detail: `due ${dueText(event)}, lands at the next turn it has room` };
};

export const echoAuthorView = (input: EchoViewInput): EchoAuthorView => ({
  rows: (input.state?.events ?? []).map((event) => ({
    occurrenceId: event.occurrenceId, echoId: event.echoId, recipient: event.recipient, source: sourceText(event), ...lifecycle(event, input),
  })),
  gaps: input.state?.gaps ?? [],
});

export const echoJournal = (result: Pick<EchoStepResult, "scheduled" | "landed" | "waiting" | "cancelled" | "expired" | "gaps">): { summary: string; note: string } | null => {
  const counts: Array<[number, string]> = [
    [result.landed.length, "landed to channel"], [result.waiting.length, "waiting"], [result.expired.length, "expired"], [result.cancelled.length, "cancelled"],
  ];
  const shown = counts.filter(([count]) => count > 0);
  if (!result.landed.length && !result.expired.length && !result.cancelled.length && !result.scheduled.length && !result.gaps.length) return null;
  const summary = `${shown.length ? shown.map(([count, word]) => `${count} echo(es) ${word}`).join(", ") : `${result.scheduled.length} echo(es) scheduled`}`;
  const note = [
    ...result.scheduled.map((event) => `${event.echoId}: scheduled for ${event.recipient}, due ${dueText(event)}`),
    ...result.landed.map((event) => `${event.echoId}: landed to channel for ${event.recipient} (${event.offerId})`),
    ...result.waiting.map(({ event, reason }) => `${event.echoId}: waiting, ${WAIT_COPY[reason]}`),
    ...result.expired.map((event) => `${event.echoId}: expired`),
    ...result.cancelled.map((event) => `${event.echoId}: cancelled`),
    ...result.gaps.map((gap) => `turns ${gap.from}-${gap.to} not scanned (${gap.reason === "log" ? "older than the kept history" : "check records evicted"})`),
  ].join("\n");
  return { summary, note };
};
