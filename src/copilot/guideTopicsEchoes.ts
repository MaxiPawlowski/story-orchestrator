import type { GuideTopic } from "./guideTopics";

export const ECHO_TOPICS = {
  echoes: {
    title: "Delayed echoes",
    fields: "echoes[], id, after, transition, quest, milestone, check, outcome, delay, parts, boundaries, when, cancel_when, expires, to, cue, hold",
    text: "echoes [{id, after {transition \"a->b\"}|{quest, to done|failed}|{milestone}|{check, outcome}, delay {boundaries|parts: [min,max]} (parts need clock), "
      + "when?, cancel_when?, expires (default 6 turns / 4 parts after due), to (cast id or narrator), cue (200), hold 2 (max 6)}] (16). Due: recheck when, "
      + "recipient enabled, no secret; lands as one echo cue (priority 20), max 2 a turn; once per chat. Cue only: no gate key, no model call.",
  },
} as const satisfies Record<string, GuideTopic>;

export const ECHO_DIAGNOSTIC_TOPICS = {
  "echo-speaks-for-player": "echoes", "echo-names-unknown-entity": "echoes", "echo-gate-holds-never": "echoes",
} as const;
