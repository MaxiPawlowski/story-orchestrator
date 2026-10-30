import type { NormalizedStory, NpcReplyEffect, PrimitiveValue } from "@engine/index";
import { skipPlan, type SkipDueEvent, type SkipPlan } from "@pacing/skipAhead";
import type { WriteResult } from "@utils/writeResult";
import { SKIP_COPY, type SkipTeller } from "./skipGate";
import type { SpeechRequest, SpeechReservation } from "./speechLedger";

export interface SkipRunInput {
  story: NormalizedStory;
  values: Readonly<Record<string, PrimitiveValue>>;
  boundary: number;
  events: readonly SkipDueEvent[];
  teller: SkipTeller;
  entry: string;
}

export interface SkipRunDeps {
  stillOwns: () => boolean;
  source: () => SpeechRequest["source"];
  reserve: (request: SpeechRequest) => SpeechReservation | null;
  settle: (reservation: SpeechReservation | null, messageId: number | null) => void;
  speak: (reply: NpcReplyEffect) => Promise<WriteResult & { direction?: string }>;
  rendered: (member: string) => number | null;
  recordCue: (line: { messageId: number; member: string; text: string }) => void;
  journal: (summary: string, note: string) => void;
  persist: () => void;
}

export type SkipOutcome = { ok: true; messageId: number; plan: SkipPlan } | { ok: false; reason: string; plan?: SkipPlan };

export const skipReply = (teller: SkipTeller, text: string): NpcReplyEffect => ({ trigger: "afterSpeak", member: teller.name, kind: "llm", instruction: text });

export const skipNote = (plan: SkipPlan): string => [
  plan.span ? `until ${plan.span.label}` : "to the next scene (this story has no clock)",
  plan.due ? `stops early: a ${plan.due.kind} falls due ${plan.due.at === "next-reply" ? "on this reply" : "at that point"}` : "",
].filter(Boolean).join("; ");

export async function runSkip(input: SkipRunInput, deps: SkipRunDeps): Promise<SkipOutcome> {
  const plan = skipPlan({ story: input.story, values: input.values, boundary: input.boundary, events: input.events });
  const reservation = deps.reserve({
    origin: "skip", member: input.teller.name, generated: true, source: deps.source(), entry: input.entry, recipient: "scene", instruction: plan.text, yieldAfter: true,
  });
  let fired: WriteResult & { direction?: string };
  try { fired = await deps.speak(skipReply(input.teller, plan.text)); }
  catch (error) {
    deps.settle(reservation, null);
    throw error;
  }
  if (!deps.stillOwns()) {
    deps.settle(reservation, null);
    return { ok: false, reason: SKIP_COPY.moved, plan };
  }
  const messageId = fired.ok ? deps.rendered(input.teller.name) : null;
  deps.settle(reservation, messageId);
  if (!fired.ok) return { ok: false, reason: fired.reason, plan };
  if (messageId === null) return { ok: false, reason: `${input.teller.name} did not answer`, plan };
  if (fired.direction) deps.recordCue({ messageId, member: input.teller.name, text: fired.direction });
  deps.journal(SKIP_COPY.journal, skipNote(plan));
  deps.persist();
  return { ok: true, messageId, plan };
}
