import { jaccardSimilarity } from "./similarity";
import { isLive, keepPinnedFrom, provenance as provenanceOf, type ProvenanceSource } from "./provenance";
import { EPISTEMIC_TAGS, generateMemoryId, type EpistemicEntry, type EpistemicTag, type ParsedEpistemicSignal } from "./types";

export const EPISTEMIC_MIN_LENGTH = 3;
export const EPISTEMIC_DEDUP_THRESHOLD = 0.6;
export const EPISTEMIC_CAP = 80;
export const EPISTEMIC_SUBJECT_CAP = 12;
export const AFFIRMATION_CAP = 32;

const PRIVATE_TAGS: EpistemicTag[] = ["knows", "suspects", "believes", "hiding", "intends"];

const normalize = (value: string): string => value.trim().toLowerCase();

// Every row a pass writes says where it came from, so a consumer can tell a live
// claim from one whose source message was rolled back.
function withProvenance(ctx: EpistemicSignalContext, pass: string) {
  return {
    provenance: provenanceOf({
      source: ctx.source ?? "extractor",
      messageId: ctx.messageId ?? -1,
      boundary: ctx.boundary,
      pass: ctx.pass ?? pass,
    }),
  };
}

export interface EpistemicSignalContext {
  boundary: number;
  messageId?: number;
  /** Which pass wrote it, e.g. "epistemic-pass" or "shared-read". */
  pass?: string;
  /** Where the claim came from. Everything the extraction pipeline writes is extractor-sourced. */
  source?: ProvenanceSource;
}

export interface ApplyEpistemicSignalsResult {
  entries: EpistemicEntry[];
  added: EpistemicEntry[];
  retired: EpistemicEntry[];
}

function isDuplicate(existing: EpistemicEntry, signal: ParsedEpistemicSignal): boolean {
  if (existing.supersededBy) return false;
  if (existing.tag !== signal.tag) return false;
  if (normalize(existing.subject) !== normalize(signal.subject)) return false;
  if (signal.tag === "hiding" && normalize(existing.hiddenFrom ?? "") !== normalize(signal.hiddenFrom ?? "")) return false;
  return jaccardSimilarity(existing.content, signal.content) >= EPISTEMIC_DEDUP_THRESHOLD;
}

export function applyEpistemicSignals(
  entries: EpistemicEntry[],
  signals: ParsedEpistemicSignal[],
  ctx: EpistemicSignalContext,
  retireIds: string[] = [],
): ApplyEpistemicSignalsResult {
  const retireSet = new Set(retireIds);
  const marker = `retired@${ctx.boundary}`;
  const retired: EpistemicEntry[] = [];
  const next = entries.map((entry) => {
    if (retireSet.has(entry.id) && !entry.supersededBy) {
      const superseded = { ...entry, supersededBy: marker, retiredAt: { messageId: ctx.messageId ?? entry.messageId ?? 0, boundary: ctx.boundary } };
      retired.push(superseded);
      return superseded;
    }
    return { ...entry };
  });

  const added: EpistemicEntry[] = [];
  for (const signal of signals) {
    const content = signal.content.trim();
    if (content.length < EPISTEMIC_MIN_LENGTH) continue;
    const subject = signal.subject.trim();
    if (!subject) continue;
    const same = [...next, ...added].find((entry) => isDuplicate(entry, signal));
    if (same && signal.tag === "intends" && typeof ctx.messageId === "number" && ctx.messageId > (same.affirmedAt?.at(-1)?.messageId ?? same.messageId ?? -1)) {
      same.affirmedAt = [...(same.affirmedAt ?? []), { messageId: ctx.messageId, boundary: ctx.boundary }].slice(-AFFIRMATION_CAP);
    }
    if (same) continue;
    added.push({
      id: generateMemoryId(),
      ...withProvenance(ctx, `epistemic:${signal.tag}`),
      subject,
      tag: signal.tag,
      content,
      ...(signal.tag === "hiding" && signal.hiddenFrom ? { hiddenFrom: signal.hiddenFrom.trim() } : {}),
      createdAt: ctx.boundary,
      ...(typeof ctx.messageId === "number" ? { messageId: ctx.messageId } : {}),
    });
  }

  return { entries: [...next, ...added], added, retired };
}

// A quarantined row (its source message was rolled back, or a conflict it is part of
// is unresolved) is not knowledge any more. It stays in the store so the author can see and
// reconfirm it, and it reaches no prompt until then.
export function activeEpistemic(entries: EpistemicEntry[]): EpistemicEntry[] {
  return entries.filter((entry) => !entry.supersededBy && isLive(entry));
}

export function epistemicForSubject(entries: EpistemicEntry[], names: string[]): EpistemicEntry[] {
  const targets = new Set(names.map(normalize).filter(Boolean));
  return activeEpistemic(entries).filter((entry) => targets.has(normalize(entry.subject)));
}

const TAG_PHRASING: Record<EpistemicTag, string> = {
  knows: "You know",
  suspects: "You suspect",
  believes: "You believe",
  unaware: "You are unaware that",
  hiding: "You are concealing",
  intends: "You intend",
};

export function renderPrivateEpistemicBlock(entries: EpistemicEntry[], names: string[]): string {
  const mine = epistemicForSubject(entries, names).filter((entry) => PRIVATE_TAGS.includes(entry.tag));
  if (!mine.length) return "";
  const lines: string[] = [];
  for (const tag of PRIVATE_TAGS) {
    for (const entry of mine.filter((candidate) => candidate.tag === tag)) {
      const prefix = entry.tag === "hiding" && entry.hiddenFrom ? `${TAG_PHRASING.hiding} from ${entry.hiddenFrom}` : TAG_PHRASING[entry.tag];
      lines.push(`- ${prefix}: ${entry.content}`);
    }
  }
  return ["Your private knowledge (stay in character — never narrate what you conceal or do not know):", ...lines].join("\n");
}

const ATTRIBUTED_TAGS: EpistemicTag[] = ["knows", "suspects", "believes", "unaware", "hiding", "intends"];

export function attributedEpistemicLine(subject: string, entry: EpistemicEntry): string {
  switch (entry.tag) {
    case "knows": return `- ${subject} knows: ${entry.content}`;
    case "suspects": return `- ${subject} suspects ${entry.content}`;
    case "believes": return `- ${subject} believes ${entry.content}`;
    case "unaware": return `- ${subject} is unaware that ${entry.content}`;
    case "hiding": return entry.hiddenFrom ? `- ${subject} is concealing from ${entry.hiddenFrom}: ${entry.content}` : `- ${subject} is concealing: ${entry.content}`;
    case "intends": return `- ${subject} intends: ${entry.content}`;
  }
}

// One solo narrator voices every roster member, so a merged second-person block told it
// "You are concealing" one member's secret while "You know" another's. Each line names its subject.
export function renderAttributedEpistemicBlock(entries: EpistemicEntry[], names: string[]): string {
  const active = activeEpistemic(entries);
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const name of names) {
    const key = normalize(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const theirs = active.filter((entry) => normalize(entry.subject) === key);
    for (const tag of ATTRIBUTED_TAGS) {
      for (const entry of theirs.filter((candidate) => candidate.tag === tag)) lines.push(attributedEpistemicLine(name.trim(), entry));
    }
  }
  if (!lines.length) return "";
  return ["What each character privately knows (voice each character accordingly — a character acts only on what they know, and never reveal what one of them conceals):", ...lines].join("\n");
}

export function renderSoloEpistemicBlock(entries: EpistemicEntry[], names: string[]): string {
  const distinct = new Set(names.map(normalize).filter(Boolean));
  return distinct.size > 1 ? renderAttributedEpistemicBlock(entries, names) : renderPrivateEpistemicBlock(entries, names);
}

export function setEpistemicPinned(entries: EpistemicEntry[], id: string, pinned: boolean): EpistemicEntry[] {
  return entries.map((entry) => (entry.id === id ? { ...entry, pinned } : entry));
}

export function removeEpistemic(entries: EpistemicEntry[], id: string): EpistemicEntry[] {
  return entries.filter((entry) => entry.id !== id);
}

// Two things go: the beliefs the removed messages introduced, and the
// retirements those messages performed — a reveal rolled back must un-retire what it retired.
//
// A pinned row is KEPT as a record but its source is gone, so it is quarantined
// (`validity: "source-removed"`) and every consumer filters it out until the author reconfirms it.
// Keeping it injected instead — the old behaviour — put a private fact whose evidence had been
// edited away in front of the character it was meant to conceal from.
export function rollbackEpistemic(entries: EpistemicEntry[], messageId: number): EpistemicEntry[] {
  return entries
    .flatMap((entry) => keepPinnedFrom(entry, messageId))
    .map((entry) => {
      const affirmed = entry.affirmedAt?.filter((stamp) => stamp.messageId < messageId);
      const { affirmedAt: _stamps, ...bare } = entry;
      const kept = !affirmed || affirmed.length === entry.affirmedAt?.length ? entry : affirmed.length ? { ...entry, affirmedAt: affirmed } : bare;
      if (!kept.retiredAt || kept.retiredAt.messageId < messageId) return kept;
      const { supersededBy: _by, retiredAt: _at, ...rest } = kept;
      return rest;
    });
}

// Each character keeps its newest entries, so one talkative subject cannot fill the private block
// (or the whole store) with scene detail; pinned entries never count against either cap.
const knowledgeKey = (content: string) => content.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

// Models ignore "asymmetry only" and hand every character present the same [knows] line about the
// scene. Such a fact is the scene itself, not private knowledge: dropped when three or more
// characters, or every character present, get it in one batch, unless another line in the batch
// marks someone as unaware of it, suspecting, believing or hiding it.
export function dropCommonKnowledge(signals: ParsedEpistemicSignal[], present: string[]): ParsedEpistemicSignal[] {
  const everyone = new Set(present.map(normalize));
  const knowers = new Map<string, Set<string>>();
  const contested = new Set<string>();
  for (const signal of signals) {
    const key = knowledgeKey(signal.content);
    if (signal.tag !== "knows") { contested.add(key); continue; }
    const subjects = knowers.get(key) ?? new Set<string>();
    subjects.add(normalize(signal.subject));
    knowers.set(key, subjects);
  }
  const common = new Set([...knowers].filter(([key, subjects]) =>
    !contested.has(key) && (subjects.size >= 3 || (everyone.size >= 2 && [...everyone].every((name) => subjects.has(name))))).map(([key]) => key));
  return signals.filter((signal) => signal.tag !== "knows" || !common.has(knowledgeKey(signal.content)));
}

export function capEpistemic(entries: EpistemicEntry[], cap: number = EPISTEMIC_CAP, subjectCap: number = EPISTEMIC_SUBJECT_CAP): EpistemicEntry[] {
  const perSubject = new Map<string, number>();
  const keep = new Set<string>();
  for (const entry of [...entries].reverse()) {
    if (entry.pinned) continue;
    const subject = normalize(entry.subject);
    const count = perSubject.get(subject) ?? 0;
    if (count >= subjectCap || keep.size >= cap) continue;
    perSubject.set(subject, count + 1);
    keep.add(entry.id);
  }
  return entries.filter((entry) => entry.pinned || keep.has(entry.id));
}

export function isEpistemicTag(value: string): value is EpistemicTag {
  return (EPISTEMIC_TAGS as readonly string[]).includes(value);
}
