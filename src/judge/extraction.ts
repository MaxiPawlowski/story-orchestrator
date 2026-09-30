import { qualityAccepts, ratingLevels, type PrimitiveValue, type Quality, type QualityCriterion } from "@engine/index";
import { findNumbers, findStringCandidates } from "./numbers";
import { EXTRACTION_CONFIDENCE, EXTRACTION_LATCHING_BUMP, STALL_DIRECT_P, STALL_GENUINE_P } from "./policy";
import { choice, choiceAnswer, noul, noulAnswer, scoreAnswer, score } from "./questions";
import type { JudgeAnswer, JudgeOption, JudgeRequest } from "./types";

export const TYPED_NOT_SHOWN = "not shown";
export const TYPED_NONE = "none";
const JUDGE_FROM_TRANSCRIPT = "Judge only from what `transcript` shows.";
const MAX_CANDIDATES = 250;

export interface TypedWindowMessage {
  id: number;
  speaker: string;
  text: string;
  isUser?: boolean;
}

export interface TypedStoryContext {
  title: string;
  checkpointName: string;
  objective: string;
}

type Decoder = (answers: Record<string, JudgeAnswer>) => { value: PrimitiveValue | undefined; confidence: number; messageKey?: string } | null;

export interface TypedPlan {
  request: JudgeRequest;
  decoders: Array<{ key: string; decode: Decoder; evidenceId?: string }>;
  messageIds: Record<string, number>;
}

export interface TypedDelta {
  q: string;
  v: PrimitiveValue;
  confidence: number;
  evidence: string;
  messageId?: number;
}

const msgKey = (message: TypedWindowMessage) => `msg_${message.id}`;

const criterionText = (criterion: string | QualityCriterion): JudgeOption =>
  typeof criterion === "string" ? criterion : {
    what: criterion.what,
    ...(criterion.not_for ? { not_for: criterion.not_for } : {}),
    ...(criterion.examples?.length ? { examples: criterion.examples } : {})
  };

const choiceCriteria = (quality: Quality): Record<string, JudgeOption> => {
  const authored = quality.criteria && !("levels" in quality.criteria) ? quality.criteria as Record<string, string | QualityCriterion> : {};
  if (quality.type === "bool") {
    return {
      yes: authored.true ? criterionText(authored.true) : "The transcript shows the answer is yes",
      no: authored.false ? criterionText(authored.false) : "The transcript shows the answer is no",
      [TYPED_NOT_SHOWN]: "The transcript does not settle the question",
    };
  }
  return {
    ...Object.fromEntries((quality.values ?? []).map((value) => [value, authored[value] ? criterionText(authored[value]) : null])),
    [TYPED_NOT_SHOWN]: "The transcript does not settle this",
  };
};

const boundChoiceCriteria = (quality: Quality, window: TypedWindowMessage[]) => {
  const values = choiceCriteria(quality);
  const options = new Map<string, { value: PrimitiveValue | undefined; messageKey?: string }>();
  const criteria: Record<string, JudgeOption> = {};
  for (const [value, criterion] of Object.entries(values)) {
    if (value === TYPED_NOT_SHOWN) continue;
    for (const message of window) {
      const label = `${value} in ${msgKey(message)}`;
      options.set(label, { value: quality.type === "bool" ? value === "yes" : value, messageKey: msgKey(message) });
      criteria[label] = criterion;
    }
  }
  options.set(TYPED_NOT_SHOWN, { value: undefined });
  criteria[TYPED_NOT_SHOWN] = values[TYPED_NOT_SHOWN];
  return { criteria, options };
};

// The spike's strategies (experiments/extraction.mts planCase), one request for every hinted quality
// in scope plus one evidence choice each. Only qualities with a `read_as` hint are ever asked.
export function buildTypedPlan(qualities: Quality[], window: TypedWindowMessage[], story: TypedStoryContext): TypedPlan | null {
  const plan: TypedPlan = { request: { state: {}, questions: {} }, decoders: [], messageIds: Object.fromEntries(window.map((message) => [msgKey(message), message.id])) };
  const texts = window.map((message) => ({ id: msgKey(message), text: message.text }));
  for (const quality of qualities) {
    if (!quality.read_as || quality.source !== "extractor") continue;
    const id = `q:${quality.key}`;
    if (quality.read_as === "choice") {
      const bound = boundChoiceCriteria(quality, window);
      plan.request.questions[id] = choice(`${quality.rubric}\nChoose the value and the message in \`transcript\` that shows it.`, bound.criteria);
      plan.decoders.push({ key: quality.key, decode: (answers) => {
        const answer = choiceAnswer(answers, id);
        if (!answer) return null;
        const picked = bound.options.get(answer.choice);
        if (!picked) return null;
        return { value: picked.value, confidence: answer.confidence, ...(picked.messageKey ? { messageKey: picked.messageKey } : {}) };
      } });
    } else if (quality.read_as === "rating") {
      const levels = ratingLevels(quality);
      if (!levels) continue;
      const presence = `presence:${quality.key}`;
      plan.request.questions[presence] = noul(`Does \`transcript\` show anything that reveals or changes the answer to this question: ${quality.rubric}`);
      plan.request.questions[id] = score(`${quality.rubric}\n${JUDGE_FROM_TRANSCRIPT}`, levels.map((level) => level.label));
      plan.decoders.push({ key: quality.key, decode: (answers) => {
        const shown = noulAnswer(answers, presence);
        const answer = scoreAnswer(answers, id);
        if (shown === null || !answer) return null;
        const level = levels[Math.max(0, Math.min(levels.length - 1, Math.round(answer.score)))];
        return { value: shown < 0.5 ? undefined : level.value, confidence: Math.min(answer.confidence, Math.abs(shown - 0.5) * 2) };
      } });
    } else {
      const numeric = quality.type === "int" || quality.type === "float";
      const found = numeric
        ? findNumbers(texts).map((mention) => ({ label: `"${mention.raw}" in ${mention.messageId}`, snippet: mention.snippet, value: mention.value as PrimitiveValue, messageKey: mention.messageId }))
        : findStringCandidates(texts).map((candidate) => ({
          label: `"${candidate.raw}" in ${candidate.messageId}`,
          snippet: candidate.snippet,
          value: candidate.raw as PrimitiveValue,
          messageKey: candidate.messageId,
        }));
      const options = new Map<string, { snippet: string; value: PrimitiveValue; messageKey: string }>();
      for (const item of found.slice(0, MAX_CANDIDATES)) {
        let label = item.label;
        for (let n = 2; options.has(label); n += 1) label = `${item.label} #${n}`;
        options.set(label, { snippet: item.snippet, value: item.value, messageKey: item.messageKey });
      }
      if (!options.size) continue;
      plan.request.questions[id] = choice(`${quality.rubric}\nWhich ${numeric ? "number mention" : "span"} in \`transcript\` gives this value as it stands at the end of the ` +
        `transcript? Pick "none" if no mention gives it.`, {
        ...Object.fromEntries([...options].map(([label, item]) => [label, item.snippet])),
        [TYPED_NONE]: numeric ? "No number in the transcript gives this value" : "No span in the transcript gives this value",
      });
      plan.decoders.push({ key: quality.key, decode: (answers) => {
        const answer = choiceAnswer(answers, id);
        if (!answer) return null;
        const option = answer.choice === TYPED_NONE ? undefined : options.get(answer.choice);
        return { value: option?.value, confidence: answer.confidence, ...(option ? { messageKey: option.messageKey } : {}) };
      } });
    }
    // A choice or stated candidate already carries its message key. Only a rating still needs a
    // separate evidence choice because its value comes from a score rather than from a Choice.
    if (window.length >= 2 && quality.read_as === "rating") {
      const evidenceId = `evidence:${quality.key}`;
      plan.request.questions[evidenceId] = choice(
        `Which message in \`transcript\` shows the answer to this question: ${quality.rubric}`,
        Object.fromEntries(window.map((message) => [msgKey(message), null])),
      );
      plan.decoders[plan.decoders.length - 1].evidenceId = evidenceId;
    }
  }
  if (!plan.decoders.length) return null;
  plan.request.state = {
    story: { title: story.title, current_scene: story.checkpointName, scene_goal: story.objective },
    transcript: window.map((message) => ({ id: msgKey(message), speaker: message.speaker, text: message.text })),
  };
  return plan;
}

export const typedFloor = (quality: Pick<Quality, "latching">) => EXTRACTION_CONFIDENCE + (quality.latching ? EXTRACTION_LATCHING_BUMP : 0);

// Deltas only for answers over the floor, with the value checked exactly as the LLM read's parser
// checks it. Anything else stays with the LLM read (residual scope).
export function readTypedDeltas(answers: Record<string, JudgeAnswer>, plan: TypedPlan, qualities: Quality[], window: TypedWindowMessage[]): { deltas: TypedDelta[]; answered: string[] } {
  const byKey = new Map(qualities.map((quality) => [quality.key, quality]));
  const deltas: TypedDelta[] = [];
  const answered: string[] = [];
  for (const decoder of plan.decoders) {
    const quality = byKey.get(decoder.key);
    const read = quality ? decoder.decode(answers) : null;
    if (!quality || !read || read.confidence < typedFloor(quality)) continue;
    const picked = (decoder.evidenceId ? choiceAnswer(answers, decoder.evidenceId)?.choice : undefined) ?? read.messageKey;
    const messageId = picked !== undefined ? plan.messageIds[picked] : window.length === 1 ? window[0].id : undefined;
    const source = window.find((message) => message.id === messageId);
    if (quality.evidence_from === "world" && (!source || source.isUser)) continue;
    answered.push(decoder.key);
    if (read.value === undefined || !qualityAccepts(quality, read.value)) continue;
    deltas.push({ q: decoder.key, v: read.value, confidence: read.confidence, evidence: (source?.text ?? "judged from the window").slice(0, 160), ...(messageId !== undefined ? { messageId } : {}) });
  }
  return { deltas, answered };
}

export interface StallLeaf {
  q: string;
  rubric: string;
  type: Quality["type"];
  op: string;
  v: PrimitiveValue | PrimitiveValue[];
  world?: boolean;
}

const leafValue = (leaf: StallLeaf): PrimitiveValue | null => {
  const value = Array.isArray(leaf.v) ? (leaf.op === "in" && leaf.v.length === 1 ? leaf.v[0] : null) : leaf.v;
  return leaf.op === "==" || leaf.op === "in" ? value : null;
};

const phrase = (value: PrimitiveValue) => (typeof value === "boolean" ? (value ? "yes" : "no") : `"${value}"`);

// Phase A wording (experiments/stallLeaves.mts): one noul per unmet extractor leaf.
export function buildStallRequest(leaves: StallLeaf[], window: TypedWindowMessage[]): JudgeRequest {
  return {
    state: { transcript: window.map((message) => ({ id: msgKey(message), speaker: message.speaker, text: message.text })) },
    questions: Object.fromEntries(leaves.map((leaf, index) => {
      const value = Array.isArray(leaf.v) ? leaf.v.map(phrase).join(" or ") : phrase(leaf.v);
      const question = leaf.op === "==" || leaf.op === ">="
        ? `Does \`transcript\` show that the answer to "${leaf.rubric}" is ${value}?`
        : `Does \`transcript\` show a value for "${leaf.rubric}" that is ${leaf.op === "in" ? `one of ${value}` : `${leaf.op} ${value}`}?`;
      return [`leaf:${index}`, noul(question)];
    })),
  };
}

export const stallDirectValue = (leaf: StallLeaf, p: number): PrimitiveValue | null => {
  const value = leafValue(leaf);
  return value !== null && !leaf.world && (leaf.type === "bool" || leaf.type === "enum") && p >= STALL_DIRECT_P ? value : null;
};

export type StallVerdict =
  | { kind: "direct"; deltas: Array<{ q: string; v: PrimitiveValue; p: number }> }
  | { kind: "genuine"; maxP: number }
  | { kind: "reread"; maxP: number };

// A direct write only for an equality leaf on a bool/enum at STALL_DIRECT_P; nothing shown at all
// keeps the stall (no LLM re-read); anything in between is today's LLM reconcile read.
export function stallVerdict(answers: Record<string, JudgeAnswer> | null, leaves: StallLeaf[]): StallVerdict {
  const ps = leaves.map((_, index) => (answers ? noulAnswer(answers, `leaf:${index}`) : null));
  if (!answers || ps.some((p) => p === null)) return { kind: "reread", maxP: Math.max(0, ...ps.map((p) => p ?? 0)) };
  const deltas = leaves.flatMap((leaf, index) => {
    const value = stallDirectValue(leaf, ps[index] as number);
    return value === null ? [] : [{ q: leaf.q, v: value, p: ps[index] as number }];
  });
  const maxP = Math.max(0, ...(ps as number[]));
  if (deltas.length) return { kind: "direct", deltas };
  return maxP < STALL_GENUINE_P ? { kind: "genuine", maxP } : { kind: "reread", maxP };
}
