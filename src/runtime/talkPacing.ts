import type { TalkControl } from "@engine/index";
import { ASK_PLAYER_DIRECTION, ASK_PLAYER_TAIL, REACTION_DIRECTION, SPOTLIGHT_DIRECTION } from "@pacing/guidance";
import {
  asksPlayer, findCandidate, pickQuiet, playerTurnsAfter, quietTurns, turnsSince, type QuietCandidate, type SpeechRow, type TalkCandidate, type TalkDecisionSource, type TalkPolicy,
} from "@talk/index";
import type { SourceRevision } from "@memory/audience";
import type { SpeechOrigin, SpeechRequest, SpeechReservation } from "./speechLedger";

export interface TalkPacingHost {
  getTalkPolicy?(): TalkPolicy | null;
  getSpeechRows?(): SpeechRow[];
  getEntryStart?(): number;
  getEntryKey?(): string;
  reserveSpeech?(request: SpeechRequest): SpeechReservation | null;
  settleSpeech?(reservation: SpeechReservation, messageId: number | null): void;
  speechYielded?(): boolean;
  armDirection?(member: string, text: string): (() => void) | null;
  consequence?(): string | null;
  causeHandled?(cause: string): boolean;
  lastAddressAt?(): number;
  recordCue?(line: { messageId: number; member: string; text: string }): void;
  getPlayerName?(): string;
  getLastMessageId(): number;
  getLastMessageRevision?(): SourceRevision | null;
  random?(): (() => number) | null;
}

export interface VoicePlan {
  rosterId: string;
  name: string;
  origin: SpeechOrigin;
  direction: string | null;
  yieldAfter: boolean;
  source: TalkDecisionSource | null;
  cause?: string;
}

export interface PlanContext {
  control: TalkControl;
  candidates: TalkCandidate[];
  spoken: readonly string[];
  lastSpeaker: string | null;
}

const inList = (list: readonly string[] | null | undefined, candidate: TalkCandidate) =>
  !list || list.some((ref) => [candidate.rosterId, candidate.name].some((name) => name.trim().toLowerCase() === ref.trim().toLowerCase()));

const quiet = (candidate: TalkCandidate): QuietCandidate => ({ rosterId: candidate.rosterId, name: candidate.name, names: [candidate.name, candidate.rosterId, ...(candidate.aliases ?? [])] });

export class TalkPacing {
  constructor(private readonly host: TalkPacingHost) {}

  policy(): TalkPolicy | null { return this.host.getTalkPolicy?.() ?? null; }

  leadPreferred(): boolean { return this.policy()?.leadPreferred !== false; }

  private rows(): SpeechRow[] { return this.host.getSpeechRows?.() ?? []; }

  private entryStart(): number { return this.host.getEntryStart?.() ?? 0; }

  private pool(context: PlanContext, list: readonly string[] | null | undefined): TalkCandidate[] {
    const lead = findCandidate(context.candidates, context.control.lead)?.rosterId;
    return context.candidates.filter((candidate) => candidate.rosterId !== lead && candidate.rosterId !== context.lastSpeaker
      && !context.spoken.includes(candidate.rosterId) && inList(list, candidate));
  }

  plain(chosen: { rosterId: string; name: string }): VoicePlan {
    return { rosterId: chosen.rosterId, name: chosen.name, origin: "chain", direction: null, yieldAfter: false, source: null };
  }

  reaction(context: PlanContext): VoicePlan | null {
    const reaction = this.policy()?.reaction;
    const cause = reaction ? this.host.consequence?.() ?? null : null;
    if (!reaction || !cause || this.host.causeHandled?.(cause)) return null;
    const picked = pickQuiet(this.rows(), this.pool(context, reaction.members).map(quiet), this.entryStart(), 0, this.host.random?.() ?? undefined);
    return picked ? { rosterId: picked.rosterId, name: picked.name, origin: "reaction", direction: REACTION_DIRECTION, yieldAfter: true, source: "reaction", cause } : null;
  }

  spotlight(chosen: TalkCandidate, source: TalkDecisionSource | null, context: PlanContext): VoicePlan {
    const plan = this.plain(chosen);
    const spotlight = this.policy()?.spotlight;
    if (!spotlight || source === "mention") return plan;
    const picked = pickQuiet(this.rows(), this.pool(context, spotlight.members).map(quiet), this.entryStart(), spotlight.quietAfter, this.host.random?.() ?? undefined);
    return picked && picked.rosterId !== chosen.rosterId ? this.spotlit(picked) : plan;
  }

  firstSpotlight(chosen: TalkCandidate, source: TalkDecisionSource | null, context: PlanContext, named: boolean): VoicePlan {
    const plan = this.plain(chosen);
    const spotlight = this.policy()?.spotlight;
    const lead = findCandidate(context.candidates, context.control.lead)?.rosterId;
    if (!spotlight || named || source === "mention" || (chosen.rosterId === lead && this.leadPreferred())) return plan;
    const rows = this.rows();
    const picked = pickQuiet(rows, this.pool(context, spotlight.members).map(quiet), this.entryStart(), spotlight.quietAfter, this.host.random?.() ?? undefined);
    if (!picked || picked.rosterId === chosen.rosterId) return plan;
    return quietTurns(rows, picked.names, this.entryStart()) > quietTurns(rows, quiet(chosen).names, this.entryStart()) ? this.spotlit(picked) : plan;
  }

  private spotlit(picked: QuietCandidate): VoicePlan {
    return { rosterId: picked.rosterId, name: picked.name, origin: "spotlight", direction: SPOTLIGHT_DIRECTION, yieldAfter: false, source: "spotlight" };
  }

  private asks(row: SpeechRow, context: PlanContext): boolean {
    const player = this.host.getPlayerName?.()?.trim() ?? "";
    if (!player) return false;
    const speaker = row.speaker.trim().toLowerCase();
    const others = context.candidates.filter((candidate) => candidate.name.trim().toLowerCase() !== speaker).flatMap((candidate) => [candidate.name, ...(candidate.aliases ?? [])]);
    return asksPlayer(row.text, { player: [player], others });
  }

  addressDue(context: PlanContext): boolean {
    const address = this.policy()?.addressPlayer;
    if (!address) return false;
    const rows = this.rows();
    const lead = findCandidate(context.candidates, context.control.lead)?.name.trim().toLowerCase();
    const since = turnsSince(rows, this.entryStart(), (row) => row.speaker.trim().toLowerCase() !== lead && this.asks(row, context));
    const last = this.host.lastAddressAt?.() ?? -1;
    return since >= address.afterPlayerTurns && (last < 0 || playerTurnsAfter(rows, last) >= address.cooldown);
  }

  address(plan: VoicePlan, context: PlanContext): VoicePlan {
    const address = this.policy()?.addressPlayer;
    const candidate = context.candidates.find((entry) => entry.rosterId === plan.rosterId);
    const lead = findCandidate(context.candidates, context.control.lead)?.rosterId;
    if (!address || !candidate || plan.rosterId === lead || plan.origin === "reaction") return plan;
    if (address.by !== "relevant_member" && !inList(address.by, candidate)) return plan;
    if (!this.addressDue(context)) return plan;
    return { ...plan, origin: "address", direction: plan.direction ? `${plan.direction} ${ASK_PLAYER_TAIL}` : ASK_PLAYER_DIRECTION, yieldAfter: true };
  }

  request(plan: VoicePlan): SpeechRequest {
    return {
      origin: plan.origin, member: plan.name, generated: true,
      source: { messageId: this.host.getLastMessageId(), revision: this.host.getLastMessageRevision?.() ?? null },
      entry: this.host.getEntryKey?.() ?? "", recipient: plan.origin === "address" ? "player" : "scene", instruction: plan.direction, yieldAfter: plan.yieldAfter,
      ...(plan.cause ? { cause: plan.cause } : {}),
    };
  }

  reserve(plan: VoicePlan): { reservation: SpeechReservation | null; refused: boolean } {
    if (!this.host.reserveSpeech) return { reservation: null, refused: false };
    const reservation = this.host.reserveSpeech(this.request(plan));
    return { reservation, refused: !reservation };
  }

  arm(plan: VoicePlan): (() => void) | null {
    return plan.direction ? this.host.armDirection?.(plan.name, plan.direction) ?? null : null;
  }

  settle(reservation: SpeechReservation | null, rendered: number | null, plan: VoicePlan | null) {
    if (!reservation) return;
    this.host.settleSpeech?.(reservation, rendered);
    if (rendered !== null && plan?.direction) this.host.recordCue?.({ messageId: rendered, member: plan.name, text: plan.direction });
  }

  yielded(): boolean { return this.host.speechYielded?.() === true; }
}
