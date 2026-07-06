import { jaccardSimilarity } from "./similarity";
import { EPISTEMIC_TAGS, generateMemoryId, type EpistemicEntry, type EpistemicTag, type ParsedEpistemicSignal } from "./types";

export const EPISTEMIC_MIN_LENGTH = 3;
export const EPISTEMIC_DEDUP_THRESHOLD = 0.6;
export const EPISTEMIC_CAP = 80;

const PRIVATE_TAGS: EpistemicTag[] = ["knows", "suspects", "believes", "hiding"];

const normalize = (value: string): string => value.trim().toLowerCase();

export interface EpistemicSignalContext {
  boundary: number;
  messageId?: number;
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
      const superseded = { ...entry, supersededBy: marker };
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
    if ([...next, ...added].some((entry) => isDuplicate(entry, signal))) continue;
    added.push({
      id: generateMemoryId(),
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

export function activeEpistemic(entries: EpistemicEntry[]): EpistemicEntry[] {
  return entries.filter((entry) => !entry.supersededBy);
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

export function setEpistemicPinned(entries: EpistemicEntry[], id: string, pinned: boolean): EpistemicEntry[] {
  return entries.map((entry) => (entry.id === id ? { ...entry, pinned } : entry));
}

export function removeEpistemic(entries: EpistemicEntry[], id: string): EpistemicEntry[] {
  return entries.filter((entry) => entry.id !== id);
}

export function rollbackEpistemic(entries: EpistemicEntry[], messageId: number): EpistemicEntry[] {
  return entries.filter((entry) => entry.pinned || typeof entry.messageId !== "number" || entry.messageId < messageId);
}

export function capEpistemic(entries: EpistemicEntry[], cap: number = EPISTEMIC_CAP): EpistemicEntry[] {
  const trimmable = entries.filter((entry) => !entry.pinned);
  if (trimmable.length <= cap) return entries;
  const keep = new Set(trimmable.slice(-cap).map((entry) => entry.id));
  return entries.filter((entry) => entry.pinned || keep.has(entry.id));
}

export function isEpistemicTag(value: string): value is EpistemicTag {
  return (EPISTEMIC_TAGS as readonly string[]).includes(value);
}
