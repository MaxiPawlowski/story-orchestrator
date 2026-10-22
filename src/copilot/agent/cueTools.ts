const GATE = "{q, op: ==|!=|>=|<=|>|<|in, v} | {all: gate[]} | {any: gate[]} | {not: gate}";

const req = (type: "string" | "object" | "array", doc: string) => ({ type, required: true, doc });

export const CUE_EDIT_TOOLS = {
  setCue: {
    backedBy: "setCue",
    doc: "Create or replace one remark or reaction cue of a cast member: a short line it is handed privately, at most once per reply, when the gate holds. "
      + "Write what the member noticed, never what the player does or feels. Read the cues guide first.",
    args: {
      member: req("string", "member id"),
      cue: req("object", `{id (slug, '-' not '_'), kind: remark|reaction, when: ${GATE} (a reaction: an event), cue (160 characters), lane?: may|must, priority?, window? (reaction), `
        + `repeat?: {cooldown}, landed_when?: ${GATE} (must only, required), max_offers? (must, 1-5)}`),
    },
  },
  removeCue: { backedBy: "removeCue", doc: "Remove one cue of a cast member.", args: { member: req("string", "member id"), id: req("string", "cue id") } },
  setTopic: {
    backedBy: "setTopic",
    doc: "Create or replace one topic of a cast member: when the player asks that member by name about one of its keys, the next tier is offered. Read the topics guide first.",
    args: {
      member: req("string", "member id"),
      topic: req("object", `{id (slug), keys: [1-8 words the player says, never a cast name], tiers: 1-3 [{cue, when?: ${GATE}}] (shallow to deep), priority?}`),
    },
  },
  removeTopic: { backedBy: "removeTopic", doc: "Remove one topic of a cast member.", args: { member: req("string", "member id"), id: req("string", "topic id") } },
  setNorm: {
    backedBy: "setNorm",
    doc: "Create or replace one social norm: when an event breaks it, each listed witness who is present gets a reaction cue. No score. Read the norms guide first.",
    args: {
      norm: req("object", `{id (slug), label (yours only), broken_when: ${GATE} (an event), noticed_by: [member id], cue (160 characters), priority?, checkpoints?: [checkpoint id]}`),
    },
  },
  removeNorm: { backedBy: "removeNorm", doc: "Remove one social norm.", args: { id: req("string", "norm id") } },
} as const;

export const ECHO_EDIT_TOOLS = {
  setEchoes: {
    backedBy: "setEchoes",
    composes: ["addEcho", "updateEcho", "removeEcho"] as Array<"addEcho" | "updateEcho" | "removeEcho">,
    doc: "Replace the story's delayed echoes (the full list): after an event and a delay, if the story still fits, one cast member or the narrator is handed one short cue. "
      + "Once per chat, cue only, no model call. Write what comes back, never what the player does or feels. Read the echoes guide first.",
    args: {
      echoes: req("array", `[{id (slug), after: {transition: "from->to"} | {quest, to: done|failed} | {milestone} | {check, outcome}, delay: {boundaries|parts: [min, max]}, `
        + `to (member id or narrator), cue (200 characters), when?: ${GATE}, cancel_when?: ${GATE}, expires?: {boundaries|parts: n}, hold?: 1-6}]`),
    },
  },
} as const;
