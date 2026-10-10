import { buildCanonVerifyRequest, canonSentenceDropped, readCanonVerify } from "./canonVerify";
import { ATTENTION_SCORE, HEADING_P, SCENE_TRIGGER } from "./policy";
import { choice, choiceAnswer, noul, noulAnswer, score, scoreAnswer } from "./questions";
import { buildSceneReadRequest, readScene, type SceneReadInput } from "./scene";
import type { JudgeAnswer, JudgeRequest } from "./types";
import { buildWardenRequests } from "./warden";

export const SPIKE_IDEAS = ["sceneConfirm", "canonVerify", "epistemic", "castBalance", "hop2", "attention", "picture", "adversity", "sceneKind", "idle"] as const;
export type SpikeIdea = (typeof SPIKE_IDEAS)[number];

export const SPIKE_FIXTURE: Record<SpikeIdea, string> = {
  sceneConfirm: "spike-scene-confirm",
  canonVerify: "spike-canon-verify",
  epistemic: "spike-epistemic",
  castBalance: "spike-cast-balance",
  hop2: "spike-hop2",
  attention: "spike-attention",
  picture: "spike-picture",
  adversity: "spike-n3",
  sceneKind: "spike-scene-kind",
  idle: "spike-n5",
};

export const SCENE_CONFIRM_P = SCENE_TRIGGER;
export const PICTURE_STRIKING_MIN = 2.5;
export const PICTURE_NOW_P = 0.5;
export const SCENE_KIND_P95_MS = 1500;

export interface SpikeCall {
  id: string;
  request: JudgeRequest;
}

export type SpikeAnswers = Map<string, { answers: Record<string, JudgeAnswer> | null; latencyMs: number }>;

export interface SpikeRow {
  id: string;
  label: string;
  read: string | null;
  right: boolean;
  family?: string;
}

export interface SpikeFloor {
  name: string;
  value: number | null;
  floor: number;
  op: ">=" | "<=";
  ok: boolean;
}

export interface SpikeVerdict {
  idea: SpikeIdea;
  rows: SpikeRow[];
  metrics: Record<string, number | null>;
  floors: SpikeFloor[];
  passed: boolean;
  unanswered: number;
}

const ratio = (hit: number, of: number): number | null => (of ? Number((hit / of).toFixed(4)) : null);

const floor = (name: string, value: number | null, bound: number, op: ">=" | "<=" = ">="): SpikeFloor => ({
  name, value, floor: bound, op, ok: value !== null && (op === ">=" ? value >= bound : value <= bound),
});

const verdict = (idea: SpikeIdea, rows: SpikeRow[], metrics: Record<string, number | null>, floors: SpikeFloor[], unanswered: number): SpikeVerdict => ({
  idea, rows, metrics, floors, passed: unanswered === 0 && floors.every((entry) => entry.ok), unanswered,
});

const answersOf = (answers: SpikeAnswers, id: string) => answers.get(id)?.answers ?? null;

const p95 = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
};

export interface SceneConfirmRow {
  id: string;
  hard: string;
  input: SceneReadInput;
  sceneBreak: boolean;
}

const sceneConfirmCalls = (rows: SceneConfirmRow[]): SpikeCall[] =>
  rows.map((row) => ({ id: row.id, request: buildSceneReadRequest({ ...row.input, families: { sceneBreak: true, tracker: false, lookahead: false } }) }));

export function scoreSceneConfirm(rows: SceneConfirmRow[], answers: SpikeAnswers, wholeSet: { breakRight: number; breakTotal: number; nobreakRight: number; nobreakTotal: number } | null = null): SpikeVerdict {
  const scored = rows.map((row): SpikeRow => {
    const found = answersOf(answers, row.id);
    const p = found ? readScene(found, { ...row.input, families: { sceneBreak: true, tracker: false, lookahead: false } }).sceneBreak?.p ?? null : null;
    return { id: row.id, label: row.sceneBreak ? "break" : "nobreak", read: p === null ? null : `p=${p}`, right: p !== null && p >= SCENE_CONFIRM_P === row.sceneBreak, family: row.hard };
  });
  const breaks = scored.filter((row) => row.label === "break");
  const nobreaks = scored.filter((row) => row.label === "nobreak");
  const breakRight = breaks.filter((row) => row.right).length;
  const nobreakRight = nobreaks.filter((row) => row.right).length;
  const metrics = {
    heldOutBreak: ratio(breakRight, breaks.length),
    heldOutNobreak: ratio(nobreakRight, nobreaks.length),
    wholeBreak: wholeSet ? ratio(breakRight + wholeSet.breakRight, breaks.length + wholeSet.breakTotal) : null,
    wholeNobreak: wholeSet ? ratio(nobreakRight + wholeSet.nobreakRight, nobreaks.length + wholeSet.nobreakTotal) : null,
  };
  const floors = [floor("held-out break", metrics.heldOutBreak, 0.95), floor("held-out nobreak", metrics.heldOutNobreak, 1)];
  if (wholeSet) floors.push(floor("whole-set break", metrics.wholeBreak, 0.95), floor("whole-set nobreak", metrics.wholeNobreak, 1));
  return verdict("sceneConfirm", scored, metrics, floors, scored.filter((row) => row.read === null).length);
}

export interface CanonVerifyRow {
  id: string;
  storyTitle: string;
  cast: string[];
  checkpoint: { name: string; objective: string } | null;
  arcSummaries: string[];
  facts: string[];
  sentences: Array<{ text: string; supported: boolean; trap?: string }>;
}

const canonInput = (row: CanonVerifyRow) => ({ storyTitle: row.storyTitle, cast: row.cast, checkpoint: row.checkpoint, arcSummaries: row.arcSummaries, facts: row.facts, sentences: row.sentences.map((entry) => entry.text) });

export function scoreCanonVerify(rows: CanonVerifyRow[], answers: SpikeAnswers): SpikeVerdict {
  const scored = rows.flatMap((row) => {
    const found = answersOf(answers, row.id);
    const ps = found ? readCanonVerify(found, row.sentences.length) : row.sentences.map(() => null);
    return row.sentences.map((sentence, index): SpikeRow => {
      const p = ps[index];
      return { id: `${row.id}.${index}`, label: sentence.supported ? "supported" : "unsupported", read: p === null ? null : `p=${p}`, right: p !== null && canonSentenceDropped(p) !== sentence.supported, family: sentence.trap ?? "supported" };
    });
  });
  const unsupported = scored.filter((row) => row.label === "unsupported");
  const supported = scored.filter((row) => row.label === "supported");
  const unsupportedDropped = unsupported.filter((row) => row.right).length;
  const supportedDropped = supported.filter((row) => !row.right).length;
  const metrics = {
    unsupportedDropped: ratio(unsupportedDropped, unsupported.length),
    supportedDropped: ratio(supportedDropped, supported.length),
    supportedKept: ratio(supported.length - supportedDropped, supported.length),
    unsupportedInserted: unsupported.length - unsupportedDropped,
  };
  const floors = [
    floor("J7.2 unsupported dropped", metrics.unsupportedDropped, 0.9),
    floor("J7.2 supported dropped", metrics.supportedDropped, 0.1, "<="),
  ];
  return verdict("canonVerify", scored, metrics, floors, scored.filter((row) => row.read === null).length);
}

export const draftModeFloors = (result: SpikeVerdict): SpikeFloor[] => [
  floor("J7.7 supported kept", result.metrics.supportedKept ?? null, 0.9),
  floor("J7.7 unsupported inserted", result.metrics.unsupportedInserted ?? null, 0, "<="),
];

export const EPISTEMIC_STATES = ["knows", "unaware", "suspects", "hiding"] as const;
export type EpistemicState = (typeof EPISTEMIC_STATES)[number];

export interface EpistemicRow {
  id: string;
  cast: string[];
  transcript: Array<{ speaker: string; text: string }>;
  questions: Array<{ subject: string; fact: string; label: EpistemicState }>;
}

const epistemicOptions = (subject: string) => ({
  knows: `${subject} has seen, been told or worked out that this is true, and is not keeping it from anyone present`,
  unaware: `${subject} has no way to know this: absent when it was said or shown, or never told`,
  suspects: `${subject} has a hint or a guess that this is true but has not been told or shown it`,
  hiding: `${subject} knows this and is keeping it from someone present: lying, changing the subject or concealing it`,
});

const epistemicCalls = (rows: EpistemicRow[]): SpikeCall[] => rows.map((row) => ({
  id: row.id,
  request: {
    state: { cast: row.cast, transcript: row.transcript.map((line, index) => ({ id: `msg_${index + 1}`, speaker: line.speaker, text: line.text })) },
    questions: Object.fromEntries(row.questions.map((entry, index) => [`know:${index}`, choice(`What does ${entry.subject} know about this: "${entry.fact}"? Judge from \`transcript\` only.`, epistemicOptions(entry.subject))])),
  },
}));

const choiceRows = <T extends { label: string }>(prefix: string, items: T[], found: Record<string, JudgeAnswer> | null, idOf: (index: number) => string, key: (index: number) => string, family?: (item: T) => string): SpikeRow[] =>
  items.map((item, index) => {
    const answer = found ? choiceAnswer(found, key(index)) : null;
    return { id: `${prefix}.${idOf(index)}`, label: item.label, read: answer ? `${answer.choice}@${Number(answer.confidence.toFixed(3))}` : null, right: answer?.choice === item.label, ...(family ? { family: family(item) } : {}) };
  });

export function scoreEpistemic(rows: EpistemicRow[], answers: SpikeAnswers): SpikeVerdict {
  const scored = rows.flatMap((row) => choiceRows(row.id, row.questions, answersOf(answers, row.id), (index) => String(index), (index) => `know:${index}`, (item) => item.label));
  const metrics: Record<string, number | null> = { agreement: ratio(scored.filter((row) => row.right).length, scored.length) };
  EPISTEMIC_STATES.forEach((state) => {
    const of = scored.filter((row) => row.label === state);
    metrics[state] = ratio(of.filter((row) => row.right).length, of.length);
  });
  return verdict("epistemic", scored, metrics, [floor("agreement", metrics.agreement, 0.85)], scored.filter((row) => row.read === null).length);
}

export const CAST_USES = ["under", "over", "fine"] as const;
export type CastUse = (typeof CAST_USES)[number];

export interface CastBalanceRow {
  id: string;
  player: string;
  cast: Array<{ name: string; role: string }>;
  turns: Array<{ speaker: string; text: string }>;
  labels: Record<string, CastUse>;
}

const castOptions = (name: string) => ({
  under: `${name} speaks less than the scene needs: they are addressed, or their role is needed, and they stay silent or others answer for them`,
  over: `${name} speaks more than the scene needs: answering what was put to others, crowding the scene, or talking where their role gives no reason`,
  fine: `${name} speaks about as much as the scene needs`,
});

const castCalls = (rows: CastBalanceRow[]): SpikeCall[] => rows.map((row) => ({
  id: row.id,
  request: {
    state: { player: row.player, cast: row.cast, turns: row.turns.map((line, index) => ({ id: `turn_${index + 1}`, speaker: line.speaker, text: line.text })) },
    questions: Object.fromEntries(row.cast.map((member) => [`use:${member.name}`, choice(`In \`turns\`, is ${member.name} speaking as much as the scene needs, given their role in \`cast\`?`, castOptions(member.name))])),
  },
}));

export const castShareBaseline = (row: CastBalanceRow, name: string): CastUse => {
  const spoken = row.turns.filter((turn) => turn.speaker !== row.player);
  const expected = spoken.length / Math.max(1, row.cast.length);
  const count = spoken.filter((turn) => turn.speaker === name).length;
  return count < expected * 0.5 ? "under" : count > expected * 1.75 ? "over" : "fine";
};

export function scoreCastBalance(rows: CastBalanceRow[], answers: SpikeAnswers): SpikeVerdict {
  const scored = rows.flatMap((row) => {
    const items = row.cast.map((member) => ({ name: member.name, label: row.labels[member.name] }));
    return choiceRows(row.id, items, answersOf(answers, row.id), (index) => items[index].name, (index) => `use:${items[index].name}`, (item) => item.label);
  });
  const baseline = rows.flatMap((row) => row.cast.map((member) => castShareBaseline(row, member.name) === row.labels[member.name]));
  const metrics: Record<string, number | null> = {
    agreement: ratio(scored.filter((row) => row.right).length, scored.length),
    shareBaseline: ratio(baseline.filter(Boolean).length, baseline.length),
  };
  CAST_USES.forEach((use) => {
    const of = scored.filter((row) => row.label === use);
    metrics[use] = ratio(of.filter((row) => row.right).length, of.length);
  });
  return verdict("castBalance", scored, metrics, [floor("agreement", metrics.agreement, 0.85)], scored.filter((row) => row.read === null).length);
}

export interface Hop2Row {
  id: string;
  input: SceneReadInput;
  heading: Record<string, boolean>;
}

const hop2Input = (row: Hop2Row): SceneReadInput => ({ ...row.input, families: { sceneBreak: false, tracker: false, lookahead: true } });

export function scoreHop2(rows: Hop2Row[], answers: SpikeAnswers): SpikeVerdict {
  const scored = rows.flatMap((row) => {
    const found = answersOf(answers, row.id);
    const read = found ? readScene(found, hop2Input(row)).headingTo ?? {} : {};
    return Object.entries(row.heading).map(([checkpointId, label]): SpikeRow => {
      const hops = row.input.reachable?.find((entry) => entry.id === checkpointId)?.hops ?? 1;
      const p = read[checkpointId] ?? null;
      return { id: `${row.id}.${checkpointId}`, label: `${label ? "toward" : "not"}-hop${hops}`, read: p === null ? null : `p=${p}`, right: p !== null && p >= HEADING_P === label, family: `hop${hops}` };
    });
  });
  const of = (label: string) => scored.filter((row) => row.label === label);
  const rate = (label: string) => ratio(of(label).filter((row) => row.right).length, of(label).length);
  const hop2 = scored.filter((row) => row.family === "hop2");
  const metrics = {
    hop2Accuracy: ratio(hop2.filter((row) => row.right).length, hop2.length),
    hop2Toward: rate("toward-hop2"),
    hop2Not: rate("not-hop2"),
    hop1Toward: rate("toward-hop1"),
    hop1Not: rate("not-hop1"),
  };
  const floors = [floor("hop-2 toward", metrics.hop2Toward, 0.85), floor("hop-2 not", metrics.hop2Not, 0.85)];
  return verdict("hop2", scored, metrics, floors, scored.filter((row) => row.read === null).length);
}

export interface AttentionRow {
  id: string;
  playerMessage: string;
  reply: { speaker: string; text: string };
  group: boolean;
  addressed: boolean;
  label: "ignores" | "partial" | "responds";
}

const attentionCalls = (player: string, rows: AttentionRow[]): SpikeCall[] =>
  rows.map((row) => ({ id: row.id, request: buildWardenRequests({ reply: row.reply, facts: [], agency: null, attention: { player, message: row.playerMessage }, houseRules: [] })[0] }));

export function scoreAttention(rows: AttentionRow[], answers: SpikeAnswers): SpikeVerdict {
  const scored = rows.map((row): SpikeRow & { flagged: boolean | null } => {
    const found = answersOf(answers, row.id);
    const value = found ? scoreAnswer(found, "attention")?.score ?? null : null;
    const flagged = value === null ? null : value < ATTENTION_SCORE;
    const right = flagged !== null && (row.label === "partial" ? true : flagged === (row.label === "ignores"));
    return { id: row.id, label: row.label, read: value === null ? null : `score=${Number(value.toFixed(3))}`, right, flagged, family: row.group && !row.addressed ? "unaddressed" : row.label };
  });
  const of = (label: string) => scored.filter((row) => row.label === label);
  const metrics = {
    ignoresRecall: ratio(of("ignores").filter((row) => row.flagged === true).length, of("ignores").length),
    respondsSpecificity: ratio(of("responds").filter((row) => row.flagged === false).length, of("responds").length),
    partialFlagged: ratio(of("partial").filter((row) => row.flagged === true).length, of("partial").length),
  };
  const floors = [floor("ignores recall", metrics.ignoresRecall, 0.85), floor("responds specificity", metrics.respondsSpecificity, 0.95)];
  return verdict("attention", scored.map(({ flagged: _flagged, ...row }) => row), metrics, floors, scored.filter((row) => row.read === null).length);
}

export const PICTURE_STRIKING_QUESTION = "How striking is the strongest image that `reply` shows?";
export const PICTURE_STRIKING_LEVELS = [
  "nothing to see: talk, thought or summary",
  "a plain image: an ordinary room, a person standing",
  "a clear image with some detail worth seeing",
  "a vivid image: a strong subject, action or setting",
  "a remarkable image: something a reader would want to see drawn",
] as const;
export const PICTURE_NOW_QUESTION = "Does that strongest image happen now, in the scene of `reply`, rather than being remembered, reported, imagined, dreamed or planned?";
export const PICTURE_NOW_CRITERIA = {
  true: "It happens in front of the characters at this moment",
  false: "It is a memory, a report, a dream, a plan, a story someone tells, or something imagined",
} as const;

export interface PictureRow {
  id: string;
  reply: string;
  label: "draw" | "skip";
  trap: "memory" | "plan" | "dream" | "report" | "none";
}

const pictureCalls = (rows: PictureRow[]): SpikeCall[] => rows.map((row) => ({
  id: row.id,
  request: { state: { reply: row.reply }, questions: { striking: score(PICTURE_STRIKING_QUESTION, [...PICTURE_STRIKING_LEVELS]), now: noul(PICTURE_NOW_QUESTION, { ...PICTURE_NOW_CRITERIA }) } },
}));

export function scorePicture(rows: PictureRow[], answers: SpikeAnswers): SpikeVerdict {
  const scored = rows.map((row): SpikeRow & { draw: boolean | null } => {
    const found = answersOf(answers, row.id);
    const striking = found ? scoreAnswer(found, "striking")?.score ?? null : null;
    const now = found ? noulAnswer(found, "now") : null;
    const draw = striking === null || now === null ? null : striking >= PICTURE_STRIKING_MIN && now >= PICTURE_NOW_P;
    return { id: row.id, label: row.label, read: draw === null ? null : `striking=${Number((striking ?? 0).toFixed(3))} now=${now}`, right: draw !== null && draw === (row.label === "draw"), draw, family: row.trap };
  });
  const drawn = scored.filter((row) => row.draw === true);
  const skips = scored.filter((row) => row.label === "skip");
  const metrics = {
    drawPrecision: ratio(drawn.filter((row) => row.label === "draw").length, drawn.length),
    skipRecall: ratio(skips.filter((row) => row.draw === false).length, skips.length),
    drawRecall: ratio(scored.filter((row) => row.label === "draw" && row.draw === true).length, scored.filter((row) => row.label === "draw").length),
  };
  const floors = [floor("draw precision", metrics.drawPrecision, 0.9), floor("skip recall", metrics.skipRecall, 0.85)];
  return verdict("picture", scored.map(({ draw: _draw, ...row }) => row), metrics, floors, scored.filter((row) => row.read === null).length);
}

export const ADVERSITY_QUESTION = "How badly do things go for `player` and their side in `reply`?";
export const ADVERSITY_LEVELS = [
  "nothing: nothing in the reply costs or threatens the player's side",
  "a minor snag: a small inconvenience, delay or annoyance",
  "a real setback: something goes wrong that the player's side must deal with",
  "a serious loss or danger: a real loss, injury or threat to the player's side",
  "a heavy blow: a grave loss, defeat or catastrophe for the player's side",
] as const;

export interface AdversityRow {
  id: string;
  playerName: string;
  reply: string;
  level: number;
}

const adversityCalls = (rows: AdversityRow[]): SpikeCall[] => rows.map((row) => ({
  id: row.id,
  request: { state: { player: row.playerName, reply: row.reply }, questions: { adversity: score(ADVERSITY_QUESTION, [...ADVERSITY_LEVELS]) } },
}));

const band = (value: number) => (value <= 1 ? "low" : value >= 3 ? "high" : "mid");

const levelRows = (id: string, key: string, label: number, found: Record<string, JudgeAnswer> | null): SpikeRow & { value: number | null } => {
  const value = found ? scoreAnswer(found, key)?.score ?? null : null;
  return { id: `${id}.${key}`, label: String(label), read: value === null ? null : `score=${Number(value.toFixed(3))}`, right: value !== null && Math.abs(value - label) <= 1, value, family: key };
};

const confused = (row: { label: string; value: number | null }) => {
  if (row.value === null) return false;
  const label = band(Number(row.label));
  const read = band(Math.round(row.value));
  return (label === "low" && read === "high") || (label === "high" && read === "low");
};

export function scoreAdversity(rows: AdversityRow[], answers: SpikeAnswers): SpikeVerdict {
  const scored = rows.map((row) => levelRows(row.id, "adversity", row.level, answersOf(answers, row.id)));
  const metrics = {
    withinOne: ratio(scored.filter((row) => row.right).length, scored.length),
    confusedLowHigh: scored.filter(confused).length,
  };
  const floors = [floor("level within 1", metrics.withinOne, 0.9), floor("0-1 vs 3-4 confusions", metrics.confusedLowHigh, 0, "<=")];
  return verdict("adversity", scored.map(({ value: _value, ...row }) => row), metrics, floors, scored.filter((row) => row.read === null).length);
}

export const SCENE_KINDS = {
  combat: "Fighting, attacking, defending or escaping a fight",
  conversation: "Talking with someone: asking, persuading, bargaining or confiding",
  travel: "Moving to another place or journeying",
  intimate: "A close, tender or romantic moment between characters",
  downtime: "Resting, eating, crafting, shopping or another quiet activity",
} as const;
export type SceneKind = keyof typeof SCENE_KINDS;
export const SCENE_KIND_QUESTION = "What kind of scene does `player_message` ask for next? Pick the main thing the player wants to do.";

export interface SceneKindRow {
  id: string;
  playerMessage: string;
  label: SceneKind;
  mixed: boolean;
}

const sceneKindCalls = (player: string, rows: SceneKindRow[]): SpikeCall[] => rows.map((row) => ({
  id: row.id,
  request: { state: { player, player_message: row.playerMessage }, questions: { kind: choice(SCENE_KIND_QUESTION, { ...SCENE_KINDS }) } },
}));

export function scoreSceneKind(rows: SceneKindRow[], answers: SpikeAnswers): SpikeVerdict {
  const scored = rows.map((row): SpikeRow => {
    const found = answersOf(answers, row.id);
    const answer = found ? choiceAnswer(found, "kind") : null;
    return { id: row.id, label: row.label, read: answer ? `${answer.choice}@${Number(answer.confidence.toFixed(3))}` : null, right: answer?.choice === row.label, family: row.mixed ? "mixed" : row.label };
  });
  const metrics: Record<string, number | null> = { accuracy: ratio(scored.filter((row) => row.right).length, scored.length) };
  const classes = Object.keys(SCENE_KINDS).map((kind) => {
    const of = scored.filter((row) => row.label === kind);
    metrics[kind] = ratio(of.filter((row) => row.right).length, of.length);
    return metrics[kind];
  });
  const latencies = rows.flatMap((row) => {
    const entry = answers.get(row.id);
    return entry?.answers ? [entry.latencyMs] : [];
  });
  metrics.lowestClass = classes.every((value) => value !== null) ? Math.min(...(classes as number[])) : null;
  metrics.p95LatencyMs = p95(latencies);
  const floors = [floor("accuracy", metrics.accuracy, 0.85), floor("lowest class", metrics.lowestClass, 0.75)];
  if (latencies.some((value) => value > 0)) floors.push(floor("p95 latency ms", metrics.p95LatencyMs, SCENE_KIND_P95_MS, "<="));
  return verdict("sceneKind", scored, metrics, floors, scored.filter((row) => row.read === null).length);
}

export const IDLE_CHANGE_QUESTION = "How much does `reply` change the situation?";
export const IDLE_CHANGE_LEVELS = [
  "nothing new: the scene goes on as before",
  "a small new detail or piece of news",
  "a new development the characters must respond to",
  "a major development that changes their plans",
  "the situation is transformed",
] as const;
export const IDLE_TENSION_QUESTION = "How tense is the scene in `reply`?";
export const IDLE_TENSION_LEVELS = [
  "calm: nothing is at stake right now",
  "slight unease: a small worry or friction",
  "clear tension: a conflict or a threat is present",
  "high tension: danger or confrontation is close",
  "peak: danger, violence or a showdown is happening now",
] as const;

export interface IdleRow {
  id: string;
  reply: string;
  change: number;
  tension: number;
}

const idleCalls = (rows: IdleRow[]): SpikeCall[] => rows.map((row) => ({
  id: row.id,
  request: { state: { reply: row.reply }, questions: { change: score(IDLE_CHANGE_QUESTION, [...IDLE_CHANGE_LEVELS]), tension: score(IDLE_TENSION_QUESTION, [...IDLE_TENSION_LEVELS]) } },
}));

export function scoreIdle(rows: IdleRow[], answers: SpikeAnswers): SpikeVerdict {
  const scored = rows.flatMap((row) => {
    const found = answersOf(answers, row.id);
    return [levelRows(row.id, "change", row.change, found), levelRows(row.id, "tension", row.tension, found)];
  });
  const of = (key: string) => scored.filter((row) => row.family === key);
  const metrics = {
    changeWithinOne: ratio(of("change").filter((row) => row.right).length, of("change").length),
    tensionWithinOne: ratio(of("tension").filter((row) => row.right).length, of("tension").length),
  };
  const floors = [floor("change within 1", metrics.changeWithinOne, 0.9), floor("tension within 1", metrics.tensionWithinOne, 0.9)];
  return verdict("idle", scored.map(({ value: _value, ...row }) => row), metrics, floors, scored.filter((row) => row.read === null).length);
}

export interface SpikeFixture {
  revision: number;
  player?: string;
  rows: unknown[];
}

export function spikeCalls(idea: SpikeIdea, fixture: SpikeFixture): SpikeCall[] {
  const rows = fixture.rows as never[];
  switch (idea) {
    case "sceneConfirm": return sceneConfirmCalls(rows);
    case "canonVerify": return (rows as CanonVerifyRow[]).map((row) => ({ id: row.id, request: buildCanonVerifyRequest(canonInput(row)) }));
    case "epistemic": return epistemicCalls(rows);
    case "castBalance": return castCalls(rows);
    case "hop2": return (rows as Hop2Row[]).map((row) => ({ id: row.id, request: buildSceneReadRequest(hop2Input(row)) }));
    case "attention": return attentionCalls(fixture.player ?? "", rows);
    case "picture": return pictureCalls(rows);
    case "adversity": return adversityCalls(rows);
    case "sceneKind": return sceneKindCalls(fixture.player ?? "", rows);
    case "idle": return idleCalls(rows);
  }
}

export function scoreSpike(idea: SpikeIdea, fixture: SpikeFixture, answers: SpikeAnswers): SpikeVerdict {
  const rows = fixture.rows as never[];
  switch (idea) {
    case "sceneConfirm": return scoreSceneConfirm(rows, answers);
    case "canonVerify": return scoreCanonVerify(rows, answers);
    case "epistemic": return scoreEpistemic(rows, answers);
    case "castBalance": return scoreCastBalance(rows, answers);
    case "hop2": return scoreHop2(rows, answers);
    case "attention": return scoreAttention(rows, answers);
    case "picture": return scorePicture(rows, answers);
    case "adversity": return scoreAdversity(rows, answers);
    case "sceneKind": return scoreSceneKind(rows, answers);
    case "idle": return scoreIdle(rows, answers);
  }
}
