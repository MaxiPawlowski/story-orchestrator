import { parseStoryOrThrow, StoryEngine, type ApplyQueueEntry, type BoundaryLogEntry, type NormalizedStory, type PrimitiveValue } from "../../src/engine";
import { playerRowRevision } from "../../src/extraction/playerSpan";
import { deriveRefs } from "../../src/runtime/consequences";
import type { EffectKind, EffectRef } from "../../src/runtime/recapPort";

const extractor = (key: string, rubric: string, extra: Record<string, unknown> = {}) => ({ key, type: "bool", source: "extractor", rubric, ...extra });
const choice = (key: string, values: string[], extra: Record<string, unknown> = {}) => ({ key, type: "enum", values, source: "extractor", rubric: `Which ${key}?`, ...extra });
const code = (key: string) => ({ key, type: "int", source: "code", rubric: `Counted ${key}.` });
const leaf = (q: string, v: PrimitiveValue, op = "==") => ({ q, op, v });
const place = (id: string, chapter: string | null, playerName: string | null, start = false) => ({
  id, name: `${id} beat`, objective: `Play ${id}.`, type: "anchor", ...(start ? { start: true } : {}), ...(chapter ? { chapter } : {}), ...(playerName ? { player_name: playerName } : {}),
});

export const POSTING_RAW: Record<string, any> = {
  id: "recap-posting", title: "The Posting", description: "Recap fixture: transitions.",
  qualities: [
    choice("posting_choice", ["taken", "refused"], {
      commit_evidence: { taken: "\\b(take|accept)\\b", refused: "\\b(refuse|decline)\\b" }, player_action: { taken: "took the posting", refused: "turned the posting down" },
    }),
    extractor("gate_open", "Is the gate open?"),
    extractor("alarm_raised", "Was the alarm raised?"),
    choice("watch_state", ["set", "unset"], { commit_evidence: { set: "\\b(set|post)\\b" }, player_action: { set: "set the watch" } }),
    { key: "fee_paid", type: "int", source: "extractor", rubric: "How much was paid?", commit_evidence: "\\b(pay|offer)\\b" },
    choice("signal_fire", ["lit", "dark"], { commit_evidence: { lit: "\\blight\\b" }, player_action: { lit: "lit the signal" } }),
    choice("cellar_door", ["open", "shut"], { commit_evidence: { open: "\\bopen\\b" }, player_action: { open: "opened the door" } }),
    extractor("calm_mood", "Is everyone calm?"),
    choice("bell_state", ["rung", "silent"], { commit_evidence: { rung: "\\bring\\b" }, player_action: { rung: "rang the bell" } }),
    code("tally_count"),
  ],
  chapters: [{ id: "one", title: "Act One", player_title: "The Board" }, { id: "two", title: "Act Two", player_title: "The Road", final: true }],
  checkpoints: [
    place("board", "one", "The Job Board", true), place("gate", "one", "The Gatehouse"), place("road", "two", "The North Road"),
    place("yard", "one", "The Yard"), place("hall", "one", "The Hall"), place("liv_camp", "one", "The Camp"), place("cellar", "one", null),
    place("tower", "one", "The Tower"),
  ],
  transitions: [
    { from: "board", to: "gate", priority: 5, gate: leaf("posting_choice", "taken"), recap: { because: "Because you took the posting, the gatehouse let you in." } },
    { from: "board", to: "road", priority: 4, gate: { any: [leaf("alarm_raised", true), leaf("posting_choice", "refused")] } },
    { from: "board", to: "yard", priority: 3, gate: { all: [leaf("gate_open", true), leaf("watch_state", "set")] } },
    { from: "board", to: "hall", priority: 2, gate: { all: [leaf("fee_paid", 10, ">="), leaf("fee_paid", 20, "<=")] }, recap: { text: "The hall opened its doors.", because: "Because you paid, the hall opened its doors." } },
    { from: "board", to: "liv_camp", priority: 1, gate: leaf("signal_fire", "lit") },
    { from: "board", to: "cellar", priority: 0, gate: leaf("cellar_door", "open"), recap: "The cellar held a secret." },
    { from: "board", to: "tower", priority: -1, gate: { all: [{ not: leaf("calm_mood", true) }, leaf("bell_state", "rung")] } },
    { from: "gate", to: "road", priority: 1, gate: leaf("alarm_raised", true) },
  ],
  roster: [],
};
export const POSTING = parseStoryOrThrow(POSTING_RAW);

export const WELL_RAW: Record<string, any> = {
  id: "recap-well", title: "The Well", description: "Recap fixture: quests.",
  qualities: [
    extractor("keeper_met", "Has the keeper been met?", { commit_evidence: "\\b(greet|meet)\\b", player_action: { true: "greeted the keeper" } }),
    choice("water_state", ["drawn", "spilled"], { commit_evidence: { drawn: "\\b(draw|haul)\\b", spilled: "\\bspill\\b" }, player_action: { drawn: "drew the water" } }),
    choice("well_state", ["full", "dry"]),
    extractor("rope_mended", "Is the rope mended?"),
    code("luck_count"),
  ],
  checkpoints: [place("square", null, "The Square", true), place("cistern", null, "The Hidden Cistern")],
  transitions: [{ from: "square", to: "cistern", priority: 1, gate: leaf("luck_count", 99, ">=") }],
  quests: [
    {
      id: "keeper", title: "The Keeper's Errand", visible_when: leaf("keeper_met", true), done_when: leaf("water_state", "drawn"), failed_when: leaf("well_state", "dry"),
      recap: { done: { text: "The keeper thanked you.", because: "Because you drew the water, the keeper thanked you." } },
    },
    { id: "rope", title: "Mend the Rope", done_when: { any: [leaf("rope_mended", true), leaf("luck_count", 3, ">=")] } },
    { id: "deep", title: "The Deep Well", visible_when: leaf("keeper_met", true), done_when: { all: [leaf("water_state", "drawn"), leaf("rope_mended", true)] } },
    { id: "cistern", title: "Secrets of the Cistern", visible_when: leaf("luck_count", 50, ">="), done_when: leaf("luck_count", 60, ">=") },
  ],
  milestones: [
    { id: "first-sip", title: "First Sip", when: leaf("water_state", "drawn") },
    { id: "hidden-spring", title: "The Hidden Spring", secret: true, when: leaf("luck_count", 40, ">=") },
  ],
  roster: [],
};
export const WELL = parseStoryOrThrow(WELL_RAW);

export const OATH_RAW: Record<string, any> = {
  id: "recap-oath", title: "The Oath", description: "Recap fixture: milestones and a chapter crossing.",
  qualities: [
    choice("oath_state", ["sworn", "broken"], { commit_evidence: { sworn: "\\b(swear|vow)\\b", broken: "\\bbreak\\b" }, player_action: { sworn: "swore the oath" } }),
    code("rank_level"),
    extractor("banner_raised", "Is the banner raised?", { commit_evidence: "\\b(raise|lift)\\b", player_action: { true: "raised the banner" } }),
    extractor("storm_broke", "Did the storm break?"),
    { key: "trust_score", type: "int", source: "extractor", rubric: "How much trust?" },
  ],
  chapters: [{ id: "vows", title: "Vows", player_title: "The Vows" }, { id: "war", title: "War", player_title: "The War", final: true }],
  checkpoints: [place("chapel", "vows", "The Chapel", true), place("keep", "vows", "The Keep"), place("field", "war", "The Field")],
  transitions: [
    { from: "chapel", to: "keep", priority: 2, gate: leaf("banner_raised", true), recap: "The keep's doors opened." },
    { from: "chapel", to: "field", priority: 1, gate: leaf("storm_broke", true) },
    { from: "keep", to: "field", priority: 1, gate: leaf("storm_broke", true) },
  ],
  milestones: [
    { id: "sworn", title: "Sworn", when: leaf("oath_state", "sworn"), recap: { because: "Because you swore it, the order counts you as its own." } },
    { id: "veteran", title: "Veteran", when: { all: [leaf("oath_state", "sworn"), leaf("rank_level", 2, ">=")] } },
    { id: "trusted", title: "Trusted Blade", secret: true, when: leaf("trust_score", 5, ">=") },
    { id: "either", title: "Either Way", when: { any: [leaf("oath_state", "broken"), leaf("storm_broke", true)] } },
  ],
  roster: [],
};
export const OATH = parseStoryOrThrow(OATH_RAW);

export const STORIES = { posting: POSTING, well: WELL, oath: OATH } as const;
export type StoryKey = keyof typeof STORIES;

export interface Write {
  q: string;
  v: PrimitiveValue;
  player?: boolean;
  code?: boolean;
  spanAt?: number;
}

export type ChatRow = { is_user: boolean; mes: string; name: string };

export const chatFor = (line: string): ChatRow[] => [
  { is_user: false, mes: "The clerk slides a notice across the table.", name: "Clerk" },
  { is_user: true, mes: line, name: "You" },
  { is_user: false, mes: "The clerk nods and stamps it.", name: "Clerk" },
];

export const spanFor = (chat: readonly ChatRow[], messageId = 1) => ({
  messageId, revision: playerRowRevision(chat[messageId]) ?? "not-a-player-line", span: [0, chat[messageId]?.mes.length ?? 0] as [number, number],
});

export const entryOf = (writes: readonly Write[], chat: readonly ChatRow[]): ApplyQueueEntry => {
  const span = (write: Write) => (write.player ? { playerSpan: spanFor(chat, write.spanAt ?? 1) } : {});
  if (writes.every((write) => write.code)) return { source: "mechanical", blackboardVersionSum: 0, deltas: writes.map((write) => ({ q: write.q, v: write.v, ...span(write) })) };
  return { source: "extractor", origin: "audit-fixture", blackboardVersionSum: 0, deltas: writes.map((write) => ({ q: write.q, v: write.v, source: "extractor" as const, ...span(write) })) };
};

export interface Played {
  story: NormalizedStory;
  engine: StoryEngine;
  chat: ChatRow[];
  entry: BoundaryLogEntry;
  refs: EffectRef[];
}

export const playBoundaries = (story: NormalizedStory, boundaries: ReadonlyArray<ReadonlyArray<readonly Write[]>>, chat: ChatRow[]): Played => {
  const engine = new StoryEngine({ now: () => 0 });
  engine.loadStory(story);
  let refs: EffectRef[] = [];
  boundaries.forEach((groups, index) => {
    groups.forEach((group) => engine.enqueue(entryOf(group, chat)));
    const last = index === boundaries.length - 1;
    engine.commitBoundary(last ? { lastMessageId: chat.length - 1, chatLength: chat.length } : { lastMessageId: 0, chatLength: 1 });
    refs = [...refs, ...deriveRefs(story, engine.stateLog.at(-1) as BoundaryLogEntry)];
  });
  return { story, engine, chat, entry: engine.stateLog.at(-1) as BoundaryLogEntry, refs };
};

export interface AttributionCase {
  id: string;
  story: StoryKey;
  setup?: Write[][];
  writes: Write[][];
  target: { kind: EffectKind; id: string };
  player: boolean;
  adversarial?: string;
  edit?: boolean;
}

const w = (q: string, v: PrimitiveValue, flags: Partial<Write> = {}): Write => ({ q, v, ...flags });
const p = (q: string, v: PrimitiveValue, flags: Partial<Write> = {}): Write => ({ q, v, player: true, ...flags });
const T = (id: string) => ({ kind: "transition" as const, id });
const Q = (id: string) => ({ kind: "quest" as const, id });
const M = (id: string) => ({ kind: "milestone" as const, id });

export const ATTRIBUTION_CASES: AttributionCase[] = [
  { id: "P1 single-leaf commitment", story: "posting", writes: [[p("posting_choice", "taken")]], target: T("board->gate#0"), player: true },
  { id: "P2 same value read from an NPC line in the player's window", story: "posting", writes: [[w("posting_choice", "taken")]], target: T("board->gate#0"), player: false, adversarial: "coincidental write" },
  { id: "P3 mechanical write with a forged span", story: "posting", writes: [[p("posting_choice", "taken", { code: true })]], target: T("board->gate#0"), player: false, adversarial: "code write" },
  { id: "P4 player write overwritten by an NPC read", story: "posting", writes: [[p("posting_choice", "taken")], [w("posting_choice", "taken")]], target: T("board->gate#0"), player: false, adversarial: "overwrite" },
  { id: "P5 NPC refusal reversed by the player", story: "posting", writes: [[w("posting_choice", "refused")], [p("posting_choice", "taken")]], target: T("board->gate#0"), player: true, adversarial: "reversal" },
  { id: "P6 priority race with the alarm", story: "posting", writes: [[p("posting_choice", "taken"), w("alarm_raised", true)]], target: T("board->gate#0"), player: false, adversarial: "priority race" },
  { id: "P7 alarm raised by the world (any gate)", story: "posting", writes: [[w("alarm_raised", true)]], target: T("board->road#0"), player: false, adversarial: "NPC-caused" },
  { id: "P8 player refusal through an any gate", story: "posting", writes: [[p("posting_choice", "refused")]], target: T("board->road#0"), player: true, adversarial: "any gate" },
  { id: "P9 refusal and alarm together (redundant any operands)", story: "posting", writes: [[p("posting_choice", "refused"), w("alarm_raised", true)]], target: T("board->road#0"), player: false, adversarial: "redundant any operand" },
  { id: "P10 watch set last, gate opened earlier", story: "posting", setup: [[w("gate_open", true)]], writes: [[p("watch_state", "set")]], target: T("board->yard#0"), player: true },
  { id: "P11 gate opened last by the world, watch set earlier", story: "posting", setup: [[p("watch_state", "set")]], writes: [[w("gate_open", true)]], target: T("board->yard#0"), player: false, adversarial: "already-satisfied operand" },
  { id: "P12 both all operands turn together", story: "posting", writes: [[w("gate_open", true), p("watch_state", "set")]], target: T("board->yard#0"), player: false, adversarial: "multi-operand tie" },
  { id: "P13 fee paid inside a range gate on one key", story: "posting", writes: [[p("fee_paid", 15)]], target: T("board->hall#0"), player: true },
  { id: "P14 fee read from the clerk's line", story: "posting", writes: [[w("fee_paid", 15)]], target: T("board->hall#0"), player: false, adversarial: "coincidental write" },
  { id: "P15 signal lit into a director checkpoint", story: "posting", writes: [[p("signal_fire", "lit")]], target: T("board->liv_camp#0"), player: false, adversarial: "living director" },
  { id: "P16 bell rung behind a not gate", story: "posting", writes: [[p("bell_state", "rung")]], target: T("board->tower#0"), player: true, adversarial: "gate shape" },
  { id: "P17 commitment whose message was edited", story: "posting", writes: [[p("posting_choice", "taken")]], target: T("board->gate#0"), player: false, adversarial: "edited evidence", edit: true },
  { id: "P18 commitment beside an unrelated code count", story: "posting", writes: [[p("posting_choice", "taken")], [w("tally_count", 3, { code: true })]], target: T("board->gate#0"), player: true },
  { id: "P19 span pointing at the clerk's message", story: "posting", writes: [[p("posting_choice", "taken", { spanAt: 2 })]], target: T("board->gate#0"), player: false, adversarial: "span not a player line" },
  { id: "P20 alarm after the posting was taken", story: "posting", setup: [[p("posting_choice", "taken")]], writes: [[w("alarm_raised", true)]], target: T("gate->road#0"), player: false, adversarial: "NPC-caused" },
  { id: "W1 water drawn for a visible quest", story: "well", setup: [[w("keeper_met", true)]], writes: [[p("water_state", "drawn")]], target: Q("keeper"), player: true },
  { id: "W2 water drawn per an NPC line", story: "well", setup: [[w("keeper_met", true)]], writes: [[w("water_state", "drawn")]], target: Q("keeper"), player: false, adversarial: "coincidental write" },
  { id: "W3 quest shows and closes in one turn", story: "well", writes: [[w("keeper_met", true), p("water_state", "drawn")]], target: Q("keeper"), player: false, adversarial: "multi-operand tie" },
  { id: "W4 player greets the keeper", story: "well", writes: [[p("keeper_met", true)]], target: Q("keeper"), player: true },
  { id: "W5 keeper met in narration", story: "well", writes: [[w("keeper_met", true)]], target: Q("keeper"), player: false, adversarial: "NPC-caused" },
  { id: "W6 the well runs dry", story: "well", setup: [[w("keeper_met", true)]], writes: [[w("well_state", "dry")]], target: Q("keeper"), player: false, adversarial: "NPC-caused" },
  { id: "W7 rope mended through an any gate", story: "well", writes: [[w("rope_mended", true)]], target: Q("rope"), player: false, adversarial: "any gate" },
  { id: "W8 luck counted in code", story: "well", writes: [[w("luck_count", 3, { code: true })]], target: Q("rope"), player: false, adversarial: "code write" },
  { id: "W9 water drawn last for the deep well", story: "well", setup: [[w("keeper_met", true), w("rope_mended", true)]], writes: [[p("water_state", "drawn")]], target: Q("deep"), player: true },
  { id: "W10 rope mended last for the deep well", story: "well", setup: [[w("keeper_met", true)], [p("water_state", "drawn")]], writes: [[w("rope_mended", true)]], target: Q("deep"), player: false, adversarial: "already-satisfied operand" },
  { id: "W11 first sip", story: "well", writes: [[p("water_state", "drawn")]], target: M("first-sip"), player: true },
  { id: "W12 first sip per the narrator", story: "well", writes: [[w("water_state", "drawn")]], target: M("first-sip"), player: false, adversarial: "coincidental write" },
  { id: "W13 water drawn, message edited", story: "well", setup: [[w("keeper_met", true)]], writes: [[p("water_state", "drawn")]], target: Q("keeper"), player: false, adversarial: "edited evidence", edit: true },
  { id: "W14 spill reversed by an NPC read", story: "well", setup: [[w("keeper_met", true)]], writes: [[p("water_state", "spilled")], [w("water_state", "drawn")]], target: Q("keeper"), player: false, adversarial: "overwrite" },
  { id: "W15 done already, shown by the world", story: "well", setup: [[p("water_state", "drawn")]], writes: [[w("keeper_met", true)]], target: Q("keeper"), player: false, adversarial: "already-satisfied gate" },
  { id: "W16 water drawn as the well runs dry", story: "well", setup: [[w("keeper_met", true)]], writes: [[p("water_state", "drawn"), w("well_state", "dry")]], target: Q("keeper"), player: false, adversarial: "competing outcome" },
  { id: "O1 oath sworn", story: "oath", writes: [[p("oath_state", "sworn")]], target: M("sworn"), player: true },
  { id: "O2 oath sworn per a witness", story: "oath", writes: [[w("oath_state", "sworn")]], target: M("sworn"), player: false, adversarial: "coincidental write" },
  { id: "O3 oath and rank together", story: "oath", writes: [[p("oath_state", "sworn")], [w("rank_level", 2, { code: true })]], target: M("veteran"), player: false, adversarial: "multi-operand tie" },
  { id: "O4 oath sworn last for veteran", story: "oath", setup: [[w("rank_level", 2, { code: true })]], writes: [[p("oath_state", "sworn")]], target: M("veteran"), player: true },
  { id: "O5 rank counted last for veteran", story: "oath", setup: [[p("oath_state", "sworn")]], writes: [[w("rank_level", 2, { code: true })]], target: M("veteran"), player: false, adversarial: "code write" },
  { id: "O6 secret trust earned by the world", story: "oath", writes: [[w("trust_score", 5)]], target: M("trusted"), player: false, adversarial: "NPC-caused" },
  { id: "O7 storm through an any gate", story: "oath", writes: [[w("storm_broke", true)]], target: M("either"), player: false, adversarial: "any gate" },
  { id: "O8 oath broken through an any gate", story: "oath", writes: [[p("oath_state", "broken")]], target: M("either"), player: true, adversarial: "any gate" },
  { id: "O9 banner raised (authored text wins)", story: "oath", writes: [[p("banner_raised", true)]], target: T("chapel->keep#0"), player: true },
  { id: "O10 banner raised per a soldier", story: "oath", writes: [[w("banner_raised", true)]], target: T("chapel->keep#0"), player: false, adversarial: "coincidental write" },
  { id: "O11 banner raised as the storm breaks", story: "oath", writes: [[p("banner_raised", true), w("storm_broke", true)]], target: T("chapel->keep#0"), player: false, adversarial: "priority race" },
  { id: "O12 storm carries the story into the next chapter", story: "oath", writes: [[w("storm_broke", true)]], target: T("chapel->field#0"), player: false, adversarial: "NPC-caused" },
  { id: "O13 banner raised, message edited", story: "oath", writes: [[p("banner_raised", true)]], target: T("chapel->keep#0"), player: false, adversarial: "edited evidence", edit: true },
  { id: "O14 broken oath reversed by the player", story: "oath", setup: [[w("oath_state", "broken")]], writes: [[p("oath_state", "sworn")]], target: M("sworn"), player: true },
];

export const LINES: Record<StoryKey, string[]> = {
  posting: ["We take the posting, and we ride at dawn.", "I accept the job. Pay me when it is done."],
  well: ["I greet the keeper and haul the water up.", "We draw the water for her."],
  oath: ["I swear the oath and raise the banner.", "I vow it, on my name."],
};
