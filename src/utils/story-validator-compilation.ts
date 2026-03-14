import { normalizeName } from "./string";
import { TALK_CONTROL_TRIGGERS, type RegexSpec, type TalkControlReply, type TalkControlReplyContent, type TalkControlTrigger, type TransitionTrigger as StoryTransitionTrigger } from "./story-schema";
import type {
  NormalizedTalkControlCheckpoint,
  NormalizedTalkControlReply,
  NormalizedTalkControlReplyContent,
  NormalizedTransitionTrigger,
  NormalizedTriggerType,
} from "./story-validator-types";

const REGEX_FROM_SLASHES = /^\/([\s\S]*)\/([dgimsuvy]*)$/;
const TALK_CONTROL_MAX_CHARS = 4000;

const toProbability = (value: unknown): number | undefined => {
  if (value === undefined || value === null) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num) : undefined;
};

function normalizeRegexSpec(spec: RegexSpec, defaultFlags = "i"): { pattern: string; flags?: string } {
  if (typeof spec === "string") {
    const match = spec.match(REGEX_FROM_SLASHES);
    if (match) return { pattern: match[1], flags: match[2] || undefined };
    return { pattern: spec, flags: defaultFlags };
  }
  return { pattern: spec.pattern, flags: spec.flags ?? defaultFlags };
}

function compileRegex(spec: RegexSpec, where: string): RegExp {
  const { pattern, flags } = normalizeRegexSpec(spec);
  try {
    return new RegExp(pattern, flags);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid regex at ${where}: /${pattern}/${flags ?? ""} -> ${message}`);
  }
}

function compileRegexList(spec: RegexSpec | RegexSpec[] | undefined, where: string): RegExp[] {
  if (spec === undefined) return [];
  if (Array.isArray(spec)) {
    return spec.map((item, index) => compileRegex(item, `${where}[${index}]`));
  }
  return [compileRegex(spec, where)];
}

export const normalizeTalkControlReplyContent = (
  content: TalkControlReplyContent | undefined,
  maxChars = TALK_CONTROL_MAX_CHARS,
): NormalizedTalkControlReplyContent | null => {
  if (!content) return null;
  if (content.kind === "static") {
    const text = content.text?.trim();
    if (!text) return null;
    return { kind: "static", text: text.slice(0, maxChars) };
  }
  if (content.kind === "llm") {
    const instruction = content.instruction?.trim();
    if (!instruction) return null;
    return { kind: "llm", instruction };
  }
  return null;
};

export const normalizeTalkControlReply = (reply: TalkControlReply): NormalizedTalkControlReply | null => {
  if (!reply || !TALK_CONTROL_TRIGGERS.includes(reply.trigger)) return null;
  const content = normalizeTalkControlReplyContent(reply.content);
  if (!content) return null;
  const speakerId = reply.speakerId?.trim() ?? "";
  const maxTriggers = reply.maxTriggers !== undefined && Number.isFinite(reply.maxTriggers) && reply.maxTriggers >= 1
    ? Math.floor(reply.maxTriggers)
    : undefined;
  return {
    memberId: reply.memberId?.trim() ?? "",
    normalizedId: normalizeName(reply.memberId),
    speakerId,
    normalizedSpeakerId: normalizeName(speakerId),
    enabled: reply.enabled ?? true,
    trigger: reply.trigger,
    probability: toProbability(reply.probability) ?? 100,
    maxTriggers,
    content,
  };
};

export function buildTalkControlCheckpoint(replies: TalkControlReply[]): NormalizedTalkControlCheckpoint | null {
  const normalizedReplies: NormalizedTalkControlReply[] = [];
  const repliesByTrigger = new Map<TalkControlTrigger, NormalizedTalkControlReply[]>();
  for (const reply of replies) {
    const normalized = normalizeTalkControlReply(reply);
    if (!normalized) continue;
    normalizedReplies.push(normalized);
    const list = repliesByTrigger.get(normalized.trigger) ?? [];
    list.push(normalized);
    repliesByTrigger.set(normalized.trigger, list);
  }
  if (!normalizedReplies.length) return null;
  return { replies: normalizedReplies, repliesByTrigger };
}

export function normalizeTransitionTrigger(trigger: StoryTransitionTrigger, path: string): NormalizedTransitionTrigger {
  const type = (trigger.type ?? "regex") as NormalizedTriggerType;
  const id = typeof trigger.id === "string" ? trigger.id.trim() : undefined;

  if (type === "regex") {
    const regexTrigger = trigger as Extract<StoryTransitionTrigger, { type: "regex" }>;
    const regexes = compileRegexList(regexTrigger.patterns, `${path}.patterns`);
    if (!regexes.length) {
      throw new Error(`Transition trigger at ${path} produced no regex patterns`);
    }
    const condition = typeof regexTrigger.condition === "string" ? regexTrigger.condition.trim() : "";
    if (!condition) {
      throw new Error(`Regex trigger at ${path} requires a non-empty 'condition' string`);
    }
    return { id: id || undefined, type, regexes, withinTurns: undefined, condition, raw: trigger };
  }

  const timedTrigger = trigger as Extract<StoryTransitionTrigger, { type: "timed" }>;
  const normalized = Number(timedTrigger.within_turns);
  if (!Number.isFinite(normalized) || normalized < 1) {
    throw new Error(`Timed trigger at ${path} requires a positive 'within_turns' value`);
  }
  return { id: id || undefined, type, regexes: [], withinTurns: Math.floor(normalized), raw: trigger };
}
