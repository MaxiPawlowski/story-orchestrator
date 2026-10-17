import { PRESENT_P } from "@judge/policy";
import { buildSceneReadRequest, readScene, type SceneReadInput } from "@judge/scene";
import type { JudgeAnswer, JudgeRequest } from "@judge/types";
import { fnv1a } from "@runtime/hash";
import { isRecord } from "@utils/guards";
import { armD, E0_CHOICE_CALLS, E0_PROTECT, type E0Candidate, type E0ChoiceCall } from "./e0Ranking";
import { e0WrittenProblem, E0_LABEL_RULES } from "./e0Labels";
import { e0Collection, e0Query, type E0ChatRow, type E0LabelQuestion, type E0VectorProvider } from "./e0Pool";
import { RECALL_MINIMUMS } from "./recall/score";
import { RECALL_POOL_SIZE, RECALL_TOKEN_CAP, RECALL_TOP_K, recallTokens } from "./recall/select";

export const VR62_LABELS_FORMAT = "so-vr62-labels/1";
export const VR62_POOL_FORMAT = "so-vr62-pool/1";
export const VR62_SCENES_FORMAT = "so-vr62-scenes/1";

export const VR62_RULES = {
  positives: 3,
  exclusions: 3,
  topUpEach: 2,
  poolSize: RECALL_POOL_SIZE,
  candidates: 8,
  topK: RECALL_TOP_K,
  sceneWindow: 8,
  presentP: PRESENT_P,
  writer: E0_LABEL_RULES.writer,
  checker: E0_LABEL_RULES.checker,
} as const;

export const VR62_FLOORS = { vr1: 0.7, vr2: 0, vr3P95: RECALL_TOKEN_CAP, slack: 1e-9 } as const;
export const VR62_MINIMUMS = RECALL_MINIMUMS;

export type Vr62Kind = "positive" | "exclusion";

export interface Vr62Written {
  askMessageId: number;
  member: string;
  text: string;
  gold: number[];
  witnessed: boolean;
}

export interface Vr62Check {
  answerable: boolean;
  ids: number[];
  memberWitnessed: boolean | null;
}

export interface Vr62Question {
  id: string;
  session: string;
  askMessageId: number;
  member: string;
  kind: Vr62Kind;
  text: string;
  gold: number[];
  nonce?: string;
  review: { writer: string; checker: string; agreed: boolean };
}

export interface Vr62LabelSet {
  format: typeof VR62_LABELS_FORMAT;
  source: "private" | "synthetic";
  questions: Vr62Question[];
}

const spoken = (rows: readonly E0ChatRow[]) => rows.filter((row) => !row.isSystem && row.text.trim());
const speaker = (row: E0ChatRow) => `${row.name || "?"}${row.isUser ? " (player)" : ""}`;
const transcript = (rows: readonly E0ChatRow[], beforeId = Number.POSITIVE_INFINITY) =>
  spoken(rows).filter((row) => row.id < beforeId).map((row) => `[${row.id}] ${speaker(row)}: ${row.text.trim()}`).join("\n\n");

export function vr62WriterPrompt(rows: readonly E0ChatRow[], members: readonly string[], positives: number = VR62_RULES.positives, exclusions: number = VR62_RULES.exclusions): string {
  return [
    "Below is a group roleplay chat transcript. Every message starts with its message id in brackets, then the speaker; \"(player)\" marks the human player's turns.",
    `The characters (members) are: ${members.join(", ")}.`,
    "Write test questions for a memory system that gives one character (the drafted member) the exact past words it may know. Each question is one the player"
      + " could ask later in this chat about what exactly someone said, promised, called someone or something, or vowed earlier; the drafted member is the character expected to answer.",
    `Write ${positives} questions where the drafted member perceived the answer first-hand (witnessed: true), and ${exclusions} where the drafted member did NOT`
      + " perceive it (witnessed: false): the member was not in that scene, or the words were a whisper, aside, private note or thought that did not reach the member.",
    "Rules:",
    "- The answer must be specific words that appear in one message (or at most two messages) of the transcript: those message ids are the gold ids.",
    "- askMessageId is the id of a (player) message where the question would be asked. It must come at least 8 messages after the latest gold message.",
    `- Do not copy ${E0_LABEL_RULES.copiedRun} or more consecutive words from the gold message into the question; name the speaker and the topic instead.`,
    "- member is one of the members above, spelled exactly. For witnessed: false, the member must not be the speaker of any gold message.",
    "- A member in the scene hears ordinary speech whether addressed or not; a member not in the scene perceives nothing.",
    "- Each question must have one clear answer in the transcript. Prefer distinct moments and distinct members; avoid the very first message. English only.",
    "Answer with exactly one JSON object and nothing else:",
    "{\"questions\": [{\"askMessageId\": <id>, \"member\": \"<member>\", \"text\": \"<question>\", \"gold\": [<id>], \"witnessed\": true|false}]}",
    "",
    "TRANSCRIPT",
    transcript(rows),
  ].join("\n");
}

export function vr62CheckerPrompt(rows: readonly E0ChatRow[], members: readonly string[], questions: ReadonlyArray<{ key: string; written: Vr62Written }>): string {
  return [
    "Below is a group roleplay chat transcript. Every message starts with its message id in brackets, then the speaker; \"(player)\" marks the human player's turns.",
    `The characters (members) are: ${members.join(", ")}.`,
    "Each question below is asked by the player at its own point in the chat (its askMessageId), and a named member is expected to answer. For each question, consider"
      + " ONLY messages with an id lower than that question's askMessageId, and find the message or messages whose exact words answer it.",
    "answerable is false when those messages hold no exact words that answer it, or when the question is ambiguous (more than two different moments could be meant)."
      + " ids lists one or two message ids, the ones holding the exact words.",
    "memberWitnessed: did the named member perceive those messages first-hand? A member in the scene hears ordinary speech whether addressed or not; whispers, asides,"
      + " private notes and inner thought reach only whom the text says; a member not in the scene perceives nothing; a speaker perceives their own message.",
    "Answer with exactly one JSON object and nothing else:",
    "{\"answers\": {\"<key>\": {\"answerable\": true|false, \"ids\": [<id>, ...], \"memberWitnessed\": true|false}}}",
    "",
    "QUESTIONS",
    ...questions.map(({ key, written }) => `- key ${key}, askMessageId ${written.askMessageId}, member ${written.member}: ${written.text}`),
    "",
    "TRANSCRIPT",
    transcript(rows, Math.max(...questions.map(({ written }) => written.askMessageId))),
  ].join("\n");
}

const intIds = (value: unknown): number[] | null => (Array.isArray(value) && value.every((entry) => Number.isInteger(entry)) ? (value as number[]) : null);

export function readVr62Written(raw: Record<string, unknown> | null): Vr62Written[] {
  const rows = raw && Array.isArray(raw.questions) ? raw.questions : [];
  return rows.flatMap((row) => {
    if (!isRecord(row) || !Number.isInteger(row.askMessageId) || typeof row.text !== "string" || typeof row.member !== "string" || typeof row.witnessed !== "boolean") return [];
    const gold = intIds(row.gold);
    return gold ? [{ askMessageId: row.askMessageId as number, member: row.member.trim(), text: row.text.trim(), gold, witnessed: row.witnessed }] : [];
  });
}

export function readVr62Check(raw: Record<string, unknown> | null): Vr62Check | null {
  if (!raw || typeof raw.answerable !== "boolean") return null;
  return { answerable: raw.answerable, ids: intIds(raw.ids) ?? [], memberWitnessed: typeof raw.memberWitnessed === "boolean" ? raw.memberWitnessed : null };
}

export function vr62WrittenProblem(rows: readonly E0ChatRow[], members: readonly string[], written: Vr62Written): string | null {
  const e0 = e0WrittenProblem(rows, { askMessageId: written.askMessageId, asker: "", text: written.text, gold: written.gold });
  if (e0) return e0;
  if (!members.includes(written.member)) return "member is not a session member";
  if (!written.witnessed && rows.some((row) => written.gold.includes(row.id) && row.name.trim() === written.member)) return "exclusion gold is the member's own message";
  return null;
}

export const vr62Agreed = (written: Vr62Written, check: Vr62Check): boolean =>
  check.answerable && check.ids.length > 0 && check.ids.every((id) => written.gold.includes(id)) && check.memberWitnessed === written.witnessed;

export interface Vr62Draft {
  id: string;
  session: string;
  written: Vr62Written;
  check: Vr62Check | null;
}

export function mergeVr62Labels(drafts: readonly Vr62Draft[], chats: ReadonlyMap<string, { rows: readonly E0ChatRow[]; members: readonly string[] }>, nonce: () => string, writer: string = VR62_RULES.writer, checker: string = VR62_RULES.checker) {
  const questions: Vr62Question[] = [];
  const invalid: Array<{ id: string; reason: string }> = [];
  const counts = { written: drafts.length, invalid: 0, unchecked: 0, agreed: 0, disagreed: 0 };
  for (const draft of drafts) {
    const chat = chats.get(draft.session);
    const problem = chat ? vr62WrittenProblem(chat.rows, chat.members, draft.written) : `no chat for session ${draft.session}`;
    if (problem) {
      counts.invalid += 1;
      invalid.push({ id: draft.id, reason: problem });
      continue;
    }
    if (!draft.check) {
      counts.unchecked += 1;
      continue;
    }
    const agreed = vr62Agreed(draft.written, draft.check);
    counts[agreed ? "agreed" : "disagreed"] += 1;
    const kind: Vr62Kind = draft.written.witnessed ? "positive" : "exclusion";
    const { askMessageId, member, text, gold } = draft.written;
    questions.push({ id: draft.id, session: draft.session, askMessageId, member, kind, text, gold, ...(kind === "exclusion" ? { nonce: nonce() } : {}), review: { writer, checker, agreed } });
  }
  const labels: Vr62LabelSet = { format: VR62_LABELS_FORMAT, source: "private", questions };
  return { labels, counts, invalid };
}

export function readVr62Labels(raw: unknown): { source: Vr62LabelSet["source"]; questions: Vr62Question[]; dropped: { disagreed: number; invalid: number } } {
  if (!isRecord(raw) || raw.format !== VR62_LABELS_FORMAT) throw new Error(`labels: format must be ${VR62_LABELS_FORMAT}`);
  const source = raw.source === "synthetic" ? "synthetic" : "private";
  const rows = (Array.isArray(raw.questions) ? raw.questions : []) as Vr62Question[];
  const valid = rows.filter((row) => isRecord(row) && typeof row.id === "string" && (row.kind === "positive" || row.kind === "exclusion") && Array.isArray(row.gold));
  const reviewed = valid.filter((row) => source === "synthetic" || (row.review && row.review.writer && row.review.writer !== row.review.checker));
  return {
    source,
    questions: reviewed.filter((row) => source === "synthetic" || row.review.agreed),
    dropped: { disagreed: reviewed.filter((row) => source !== "synthetic" && !row.review.agreed).length, invalid: rows.length - reviewed.length },
  };
}

export interface Vr62LogEntry {
  lastMessageId: number;
  before: string | null;
  after: string | null;
}

export interface Vr62SessionContext {
  session: string;
  storyTitle: string;
  player: string;
  members: string[];
  roles: Record<string, string>;
  checkpoints: Record<string, { name: string; objective: string }>;
  log: Vr62LogEntry[];
  startCheckpoint: string | null;
  epistemic: Array<{ tag: string; messageId: number }>;
}

export function checkpointAt(context: Pick<Vr62SessionContext, "log" | "startCheckpoint">, messageId: number): string | null {
  const sorted = [...context.log].sort((left, right) => left.lastMessageId - right.lastMessageId);
  const last = sorted.filter((entry) => entry.lastMessageId <= messageId).at(-1);
  return last?.after ?? sorted[0]?.before ?? context.startCheckpoint;
}

export function secretScenes(context: Vr62SessionContext, lastAsk: number): string[] {
  const keys = context.epistemic.filter((row) => (row.tag === "hiding" || row.tag === "unaware") && row.messageId <= lastAsk)
    .map((row) => `${context.session}:${checkpointAt(context, row.messageId) ?? "?"}`);
  return [...new Set(keys)].sort();
}

export function vr62Minimums(questions: readonly Vr62Question[], scenes: readonly string[]) {
  const positives = questions.filter((question) => question.kind === "positive").length;
  const exclusions = questions.filter((question) => question.kind === "exclusion").length;
  const askers = new Set(questions.map((question) => question.member)).size;
  const sessions = new Set(questions.map((question) => question.session)).size;
  const counts = { positives, exclusions, askers, secretScenes: scenes.length, sessions };
  const met = {
    positives: positives >= VR62_MINIMUMS.positives, exclusions: exclusions >= VR62_MINIMUMS.exclusions, askers: askers >= VR62_MINIMUMS.askers,
    secretScenes: scenes.length >= VR62_MINIMUMS.secretScenes, sessions: sessions >= VR62_MINIMUMS.sessions,
  };
  return { counts, met, ok: Object.values(met).every(Boolean) };
}

export const memberKey = (members: readonly string[], name: string): string => `m${members.indexOf(name)}`;

export function sceneInputAt(context: Vr62SessionContext, rows: readonly E0ChatRow[], messageId: number): SceneReadInput {
  const checkpoint = checkpointAt(context, messageId);
  const known = checkpoint ? context.checkpoints[checkpoint] : undefined;
  const window = spoken(rows).filter((row) => row.id <= messageId).slice(-VR62_RULES.sceneWindow)
    .map((row) => ({ speaker: row.isUser ? context.player : row.name, text: row.text.trim() }));
  return {
    storyTitle: context.storyTitle,
    checkpointName: known?.name ?? "",
    objective: known?.objective ?? "",
    cast: context.members.map((name) => ({ rosterId: memberKey(context.members, name), name, ...(context.roles[name] ? { role: context.roles[name] } : {}) })),
    player: context.player,
    window,
    families: { sceneBreak: false, tracker: true, lookahead: false },
  };
}

export const sceneRequestAt = (context: Vr62SessionContext, rows: readonly E0ChatRow[], messageId: number): JudgeRequest => buildSceneReadRequest(sceneInputAt(context, rows, messageId));

export interface Vr62SceneRecord {
  present: Record<string, number> | null;
  fallback: string | null;
  model: string | null;
  latencyMs: number;
  inputTokens: number;
  cached: boolean;
}

export function sceneRecordFrom(context: Vr62SessionContext, rows: readonly E0ChatRow[], messageId: number, answer: { answers: Record<string, JudgeAnswer> | null; fallback?: string | null; model?: string | null; latencyMs: number; usage?: { input_tokens?: number }; cached?: boolean }): Vr62SceneRecord {
  const input = sceneInputAt(context, rows, messageId);
  const read = answer.answers ? readScene(answer.answers, input) : null;
  const present = read?.present ? Object.fromEntries(context.members.flatMap((name) => {
    const p = read.present?.[memberKey(context.members, name)];
    return typeof p === "number" ? [[name, p] as const] : [];
  })) : null;
  return { present: present && Object.keys(present).length ? present : null, fallback: answer.fallback ?? (answer.answers ? null : "no-answer"), model: answer.model ?? null, latencyMs: answer.latencyMs, inputTokens: answer.usage?.input_tokens ?? 0, cached: answer.cached === true };
}

export const sceneKey = (session: string, messageId: number) => `${session}#${messageId}`;

export interface Vr62Candidate {
  messageId: number;
  speaker: string;
  textHash: string;
  text: string;
  stRank: number;
}

export interface Vr62PoolQuestion {
  id: string;
  session: string;
  askMessageId: number;
  member: string;
  kind: Vr62Kind;
  gold: number[];
  query: string;
  candidates: Vr62Candidate[];
  latencyMs: number | null;
}

export interface Vr62Pool {
  format: typeof VR62_POOL_FORMAT;
  source: Vr62LabelSet["source"];
  provider: string;
  topK: number;
  protect: number;
  questions: Vr62PoolQuestion[];
  refused: Array<{ id: string; reason: string }>;
}

export async function buildVr62Pool(labels: ReturnType<typeof readVr62Labels>, chats: ReadonlyMap<string, readonly E0ChatRow[]>, provider: E0VectorProvider): Promise<Vr62Pool> {
  const questions: Vr62PoolQuestion[] = [];
  const refused: Array<{ id: string; reason: string }> = [];
  for (const question of labels.questions) {
    const rows = chats.get(question.session);
    if (!rows) {
      refused.push({ id: question.id, reason: `no chat for session ${question.session}` });
      continue;
    }
    const collection = e0Collection(rows, question.askMessageId);
    if (collection.length < VR62_RULES.candidates) {
      refused.push({ id: question.id, reason: `collection holds ${collection.length} messages, under ${VR62_RULES.candidates}` });
      continue;
    }
    const asE0: E0LabelQuestion = { id: question.id, session: question.session, askMessageId: question.askMessageId, asker: "", text: question.text, gold: question.gold, review: null };
    const query = e0Query(rows, asE0);
    const answer = await provider.query(collection, query, VR62_RULES.poolSize, 0);
    const ids = Array.isArray(answer) ? answer : answer.ids;
    const byId = new Map(rows.map((row) => [row.id, row]));
    const candidates = ids.map((id, stRank) => {
      const row = byId.get(id);
      return { messageId: id, speaker: row ? (row.isUser ? "" : row.name) : "", textHash: fnv1a(row?.text ?? ""), text: row?.text ?? "", stRank };
    });
    questions.push({ id: question.id, session: question.session, askMessageId: question.askMessageId, member: question.member, kind: question.kind, gold: question.gold, query, candidates, latencyMs: Array.isArray(answer) ? null : answer.latencyMs });
  }
  return { format: VR62_POOL_FORMAT, source: labels.source, provider: provider.id, topK: VR62_RULES.poolSize, protect: E0_PROTECT, questions, refused };
}

export type Vr62Filter = (question: Vr62PoolQuestion, candidate: Vr62Candidate) => boolean;

export const presenceFilter = (scenes: Readonly<Record<string, Vr62SceneRecord>>): Vr62Filter => (question, candidate) =>
  candidate.speaker === question.member || (scenes[sceneKey(question.session, candidate.messageId)]?.present?.[question.member] ?? 0) >= VR62_RULES.presentP - VR62_FLOORS.slack;

export const noFilter: Vr62Filter = () => true;

export const filteredCandidates = (question: Vr62PoolQuestion, filter: Vr62Filter): Vr62Candidate[] =>
  question.candidates.filter((candidate) => filter(question, candidate)).slice(0, VR62_RULES.candidates);

export const needsChoice = (candidates: readonly Vr62Candidate[]) => candidates.length > VR62_RULES.topK;

const asE0Candidate = (candidate: Vr62Candidate, stRank: number): E0Candidate => ({ messageId: candidate.messageId, textHash: candidate.textHash, text: candidate.text, stRank, bands: [] });

export function vr62Top(question: Vr62PoolQuestion, candidates: readonly Vr62Candidate[], calls: readonly E0ChoiceCall[] | undefined): { top: number[]; calls: number; latencyMs: number; inputTokens: number } | { refused: string } {
  if (!needsChoice(candidates)) return { top: candidates.map((candidate) => candidate.messageId), calls: 0, latencyMs: 0, inputTokens: 0 };
  const ranked = armD({ id: question.id, askMessageId: question.askMessageId, query: question.query, gold: question.gold, candidates: candidates.map(asE0Candidate) }, calls);
  if ("refused" in ranked) return ranked;
  return { top: ranked.order.slice(0, VR62_RULES.topK), calls: ranked.calls, latencyMs: ranked.latencyMs ?? 0, inputTokens: ranked.inputTokens };
}

export function renderBlock(question: Vr62PoolQuestion, top: readonly number[]): string {
  const byId = new Map(question.candidates.map((candidate) => [candidate.messageId, candidate]));
  return top.map((id) => {
    const candidate = byId.get(id);
    return `${candidate?.speaker || "Player"} said: "${(candidate?.text ?? "").trim()}"`;
  }).join("\n");
}

const nonceLine = (block: string, question: Vr62Question, top: readonly number[]): string =>
  (question.nonce && top.some((id) => question.gold.includes(id)) ? `${block}\n[${question.nonce}]` : block);

const ratio = (hits: number, of: number) => ({ hits, of, rate: of ? hits / of : null });

const p95 = (values: readonly number[]): number | null => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)] : null;
};

export function scoreVr62(labels: ReturnType<typeof readVr62Labels>, pool: Vr62Pool, scenes: Readonly<Record<string, Vr62SceneRecord>>, recorded: Readonly<Record<string, E0ChoiceCall[]>>, scenesOk: readonly string[], filter: Vr62Filter = presenceFilter(scenes)) {
  const byId = new Map(labels.questions.map((question) => [question.id, question]));
  const pooled = pool.questions.filter((question) => byId.has(question.id));
  const minimums = vr62Minimums(pooled.map((question) => byId.get(question.id) as Vr62Question), scenesOk);
  const refused: Array<{ id: string; reason: string }> = [];
  const outcomes = pooled.flatMap((question) => {
    const label = byId.get(question.id) as Vr62Question;
    const candidates = filteredCandidates(question, filter);
    const ranked = vr62Top(question, candidates, recorded[question.id]);
    if ("refused" in ranked) {
      refused.push({ id: question.id, reason: ranked.refused });
      return [];
    }
    const block = nonceLine(renderBlock(question, ranked.top), label, ranked.top);
    const unfiltered = question.candidates.slice(0, VR62_RULES.topK).map((candidate) => candidate.messageId);
    return [{
      id: question.id, kind: question.kind, member: question.member,
      inPool: question.candidates.some((candidate) => question.gold.includes(candidate.messageId)),
      goldKept: candidates.some((candidate) => question.gold.includes(candidate.messageId)),
      hit: ranked.top.some((id) => question.gold.includes(id)),
      nonce: Boolean(label.nonce && block.includes(label.nonce)),
      unfilteredHit: unfiltered.some((id) => question.gold.includes(id)),
      candidates: candidates.length, top: ranked.top.length, tokens: recallTokens(block), calls: ranked.calls, latencyMs: ranked.latencyMs, inputTokens: ranked.inputTokens,
    }];
  });
  const positives = outcomes.filter((outcome) => outcome.kind === "positive");
  const exclusions = outcomes.filter((outcome) => outcome.kind === "exclusion");
  const vr1 = ratio(positives.filter((outcome) => outcome.hit).length, positives.length);
  const vr2 = { nonceLines: exclusions.filter((outcome) => outcome.nonce).length, exclusions: exclusions.length };
  const vr3 = { p95: p95(outcomes.map((outcome) => outcome.tokens)), max: Math.max(0, ...outcomes.map((outcome) => outcome.tokens)), cap: VR62_FLOORS.vr3P95 };
  const pooledSceneKeys = new Set(pooled.flatMap((question) => question.candidates.map((candidate) => sceneKey(question.session, candidate.messageId))));
  const sceneRows = [...pooledSceneKeys].map((key) => scenes[key]);
  const floors = {
    vr1: vr1.rate === null ? null : vr1.rate >= VR62_FLOORS.vr1 - VR62_FLOORS.slack,
    vr2: vr2.nonceLines === VR62_FLOORS.vr2,
    vr3: vr3.p95 === null ? null : vr3.p95 <= VR62_FLOORS.vr3P95,
  };
  const status = !minimums.ok ? "insufficient" : refused.length ? "incomplete" : floors.vr1 && floors.vr2 ? "pass" : "fail";
  return {
    minimums,
    counts: { pooled: pooled.length, poolRefused: pool.refused.length, scored: outcomes.length, refused: refused.length, positives: positives.length, exclusions: exclusions.length },
    vr1,
    vr2,
    vr3,
    poolRecall: ratio(outcomes.filter((outcome) => outcome.inPool).length, outcomes.length),
    presence: {
      positivesGoldKept: ratio(positives.filter((outcome) => outcome.goldKept).length, positives.length),
      exclusionsGoldDropped: ratio(exclusions.filter((outcome) => !outcome.goldKept).length, exclusions.length),
      sceneReads: { messages: pooledSceneKeys.size, missing: sceneRows.filter((row) => !row).length, failed: sceneRows.filter((row) => row && !row.present).length },
    },
    diagnosticUnfiltered: {
      positivesHit: ratio(positives.filter((outcome) => outcome.unfilteredHit).length, positives.length),
      exclusionsLeaked: exclusions.filter((outcome) => outcome.unfilteredHit).length,
    },
    cost: {
      calls: outcomes.reduce((sum, outcome) => sum + outcome.calls, 0),
      questionsRanked: outcomes.filter((outcome) => outcome.calls > 0).length,
      inputTokens: outcomes.reduce((sum, outcome) => sum + outcome.inputTokens, 0),
      latencyP95: p95(outcomes.filter((outcome) => outcome.calls > 0).map((outcome) => outcome.latencyMs)),
      sceneInputTokens: sceneRows.reduce((sum, row) => sum + (row?.inputTokens ?? 0), 0),
    },
    floors,
    verdict: { status, rGate2: status === "pass" },
    refused,
    outcomes: outcomes.map(({ id, kind, hit, nonce, goldKept, inPool, candidates, top, calls }) => ({ id, kind, hit, nonce, goldKept, inPool, candidates, top, calls })),
  };
}

export const choiceQuestions = (pool: Vr62Pool, filter: Vr62Filter) => pool.questions.flatMap((question) => {
  const candidates = filteredCandidates(question, filter);
  return needsChoice(candidates) ? [{ id: question.id, query: question.query, candidates: candidates.map((candidate) => ({ messageId: candidate.messageId, text: candidate.text })) }] : [];
});

export const VR62_CHOICE_CALLS = E0_CHOICE_CALLS;
