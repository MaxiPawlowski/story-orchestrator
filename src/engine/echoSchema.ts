import type { GateNode } from "./schema";

export const ECHOES_MAX = 16;
export const ECHO_CUE_MAX = 200;
export const ECHO_DELAY_MAX = 60;
export const ECHO_HOLD_DEFAULT = 2;
export const ECHO_HOLD_MAX = 6;
export const ECHO_EXPIRES_DEFAULT = { boundaries: 6, parts: 4 } as const;
export const ECHO_EXPIRES_MAX = 60;
export const ECHO_LANDINGS_PER_BOUNDARY = 2;
export const ECHO_EVENTS_CAP = 200;
export const ECHO_NARRATOR = "narrator";
export const ECHO_QUEST_ENDS = ["done", "failed"] as const;
export const ECHO_CHECK_OUTCOMES = ["success", "failure", "miss", "weak", "strong"] as const;

export type EchoQuestEnd = (typeof ECHO_QUEST_ENDS)[number];

export type EchoAfter =
  | { transition: string }
  | { quest: string; to: EchoQuestEnd }
  | { milestone: string }
  | { check: string; outcome: string };

export type EchoUnit = "parts" | "boundaries";
export type EchoDelay = { parts: [number, number] } | { boundaries: [number, number] };
export type EchoWindow = { parts: number } | { boundaries: number };

export interface StoryEcho {
  id: string;
  after: EchoAfter;
  delay: EchoDelay;
  when?: GateNode;
  cancel_when?: GateNode;
  expires?: EchoWindow;
  to: string;
  cue: string;
  hold?: number;
}

declare module "./schema" {
  interface Story {
    echoes?: StoryEcho[];
  }
}

export const echoUnit = (delay: EchoDelay): EchoUnit => ("parts" in delay ? "parts" : "boundaries");

export const echoRange = (delay: EchoDelay): [number, number] => ("parts" in delay ? delay.parts : delay.boundaries);

export const echoExpiry = (echo: Pick<StoryEcho, "delay" | "expires">): number => {
  const unit = echoUnit(echo.delay);
  const expires = echo.expires;
  if (expires && unit in expires) return (expires as Record<EchoUnit, number>)[unit];
  return ECHO_EXPIRES_DEFAULT[unit];
};

export const echoHold = (echo: Pick<StoryEcho, "hold">): number => echo.hold ?? ECHO_HOLD_DEFAULT;

export const echoSourceKind = (after: EchoAfter): "transition" | "quest" | "milestone" | "check" =>
  ("transition" in after ? "transition" : "quest" in after ? "quest" : "milestone" in after ? "milestone" : "check");

export const echoSourceId = (after: EchoAfter): string =>
  ("transition" in after ? after.transition : "quest" in after ? after.quest : "milestone" in after ? after.milestone : after.check);

export const echoSourceTo = (after: EchoAfter): string | null => ("to" in after ? after.to : "outcome" in after ? after.outcome : null);
