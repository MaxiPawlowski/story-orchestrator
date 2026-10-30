import { latestSend, renderedVoicesAfter, speechRows, wordCount, type TalkPolicy } from "@talk/index";
import { recordSpeechEvent, type SpeechEvent, type SpeechRequest, type SpeechReservation } from "./speechLedger";
import { messageRevision } from "./yourMove";

export interface SpeechBudgetDeps {
  chat: () => readonly unknown[];
  chatId: () => string;
  events: () => SpeechEvent[] | null;
  setEvents: (events: SpeechEvent[]) => void;
  policy: () => TalkPolicy | null;
  persist: () => void;
  journal?: (summary: string, note: string) => void;
}

export interface SpeechUsage {
  send: number;
  voices: number;
  attempts: number;
  budget: { voices: number; attempts: number } | null;
}

interface Held extends SpeechReservation {
  chatId: string;
}

export class SpeechBudget {
  private readonly inFlight = new Map<number, Held>();
  private nextId = 1;

  constructor(private readonly deps: SpeechBudgetDeps) {}

  private pending(send: number): Held[] {
    const chatId = this.deps.chatId();
    return [...this.inFlight.values()].filter((held) => held.send === send && held.chatId === chatId);
  }

  usage(): SpeechUsage {
    const rows = speechRows(this.deps.chat());
    const send = latestSend(rows);
    const events = (this.deps.events() ?? []).filter((event) => event.send === send);
    const entries = new Set(events.flatMap((event) => (event.origin === "entry" && event.messageId !== null ? [event.messageId] : [])));
    const scripted = new Set(events.flatMap((event) => (!event.generated && event.messageId !== null ? [event.messageId] : [])));
    const rendered = send < 0 ? [] : renderedVoicesAfter(rows, send, entries);
    const pending = this.pending(send);
    const failed = events.filter((event) => event.generated && event.messageId === null && event.origin !== "entry").length;
    return {
      send,
      voices: rendered.length + pending.length,
      attempts: rendered.filter((id) => !scripted.has(id)).length + failed + pending.filter((held) => held.request.generated).length,
      budget: this.deps.policy()?.budget ?? null,
    };
  }

  reserve(request: SpeechRequest): SpeechReservation | null {
    const usage = this.usage();
    const budget = usage.send >= 0 && request.origin !== "skip" ? usage.budget : null;
    if (budget && usage.voices >= budget.voices) return this.refuse(request, `this player message already has ${usage.voices} of its ${budget.voices} voice(s)`);
    if (budget && request.generated && usage.attempts >= budget.attempts) {
      return this.refuse(request, `this player message already used ${usage.attempts} of its ${budget.attempts} generation(s)`);
    }
    const held: Held = { id: this.nextId, send: usage.send, request, chatId: this.deps.chatId() };
    this.nextId += 1;
    this.inFlight.set(held.id, held);
    return { id: held.id, send: held.send, request };
  }

  private refuse(request: SpeechRequest, note: string): null {
    this.deps.journal?.(`${request.member}'s ${request.origin} line was held by the speech budget`, note);
    return null;
  }

  settle(reservation: SpeechReservation | null | undefined, messageId: number | null) {
    const held = reservation ? this.inFlight.get(reservation.id) : undefined;
    if (!held) return;
    this.inFlight.delete(held.id);
    if (held.chatId !== this.deps.chatId()) return;
    this.write(held.send, held.request, messageId);
  }

  recordEntry(member: string, messageId: number, generated: boolean, entry: string) {
    const send = latestSend(speechRows(this.deps.chat()));
    this.write(send, {
      origin: "entry", member, generated, source: { messageId: messageId - 1, revision: null }, entry, recipient: "scene", instruction: null, yieldAfter: false,
    }, messageId);
  }

  private write(send: number, request: SpeechRequest, messageId: number | null) {
    const row = messageId === null ? undefined : this.deps.chat()[messageId];
    const revision = messageRevision(row);
    const text = row && typeof row === "object" && typeof (row as { mes?: unknown }).mes === "string" ? (row as { mes: string }).mes : "";
    this.deps.setEvents(recordSpeechEvent(this.deps.events() ?? [], {
      send, origin: request.origin, member: request.member, generated: request.generated, entry: request.entry, recipient: request.recipient,
      instructed: Boolean(request.instruction), yieldAfter: request.yieldAfter, at: request.source.messageId, messageId,
      ...(revision ? { revision } : {}), ...(request.cause ? { cause: request.cause } : {}), ...(text ? { words: wordCount(text) } : {}),
    }));
    this.deps.persist();
  }

  yieldPending(): boolean {
    const chat = this.deps.chat();
    const rows = speechRows(chat);
    const send = latestSend(rows);
    const last = rows.reduce((found, row, index) => (row.isSystem ? found : index), -1);
    if (send < 0 || last <= send) return false;
    const revision = messageRevision(chat[last]);
    return (this.deps.events() ?? []).some((event) => event.send === send && event.yieldAfter && event.messageId === last
      && (!event.revision || !revision || event.revision.hash === revision.hash));
  }

  causeHandled(cause: string): boolean {
    const chatId = this.deps.chatId();
    return (this.deps.events() ?? []).some((event) => event.cause === cause) || [...this.inFlight.values()].some((held) => held.chatId === chatId && held.request.cause === cause);
  }

  lastAddressAt(): number {
    const events = this.deps.events() ?? [];
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index];
      if (event.origin === "address" && event.messageId !== null) return event.messageId;
    }
    return -1;
  }
}
