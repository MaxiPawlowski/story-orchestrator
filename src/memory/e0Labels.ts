import { fnv1a } from "@runtime/hash";
import { isRecord } from "@utils/guards";
import { E0_POOL_SIZE } from "./e0Ranking";
import { e0Collection, E0_LABELS_FORMAT, type E0ChatRow, type E0LabelQuestion, type E0LabelSet } from "./e0Pool";

export const E0_LABEL_RULES = {
  minMessages: 40,
  sharedText: 0.5,
  perSession: 5,
  copiedRun: 5,
  writer: "opencode:openai/gpt-6.1-sol",
  checker: "claude-code:claude -p",
} as const;

export interface E0SessionChat {
  session: string;
  rows: E0ChatRow[];
}

export interface E0WrittenQuestion {
  askMessageId: number;
  asker: string;
  text: string;
  gold: number[];
}

export interface E0CheckAnswer {
  answerable: boolean;
  ids: number[];
}

export interface E0LabelDraft {
  id: string;
  session: string;
  written: E0WrittenQuestion;
  check: E0CheckAnswer | null;
}

export interface E0LabelMerge {
  labels: E0LabelSet;
  counts: { written: number; invalid: number; unchecked: number; agreed: number; disagreed: number };
  invalid: Array<{ id: string; reason: string }>;
}

const spoken = (rows: readonly E0ChatRow[]) => rows.filter((row) => !row.isSystem && row.text.trim());

export function selectE0Sessions(chats: readonly E0SessionChat[], minMessages: number = E0_LABEL_RULES.minMessages): { kept: string[]; short: string[]; duplicate: string[] } {
  const seen = new Set<string>();
  const kept: string[] = [];
  const short: string[] = [];
  const duplicate: string[] = [];
  for (const chat of [...chats].sort((left, right) => spoken(right.rows).length - spoken(left.rows).length || left.session.localeCompare(right.session))) {
    const rows = spoken(chat.rows);
    if (rows.length < minMessages) {
      short.push(chat.session);
      continue;
    }
    const hashes = rows.map((row) => fnv1a(row.text.trim()));
    const shared = hashes.filter((hash) => seen.has(hash)).length / hashes.length;
    if (shared > E0_LABEL_RULES.sharedText) {
      duplicate.push(chat.session);
      continue;
    }
    hashes.forEach((hash) => seen.add(hash));
    kept.push(chat.session);
  }
  return { kept: kept.sort(), short: short.sort(), duplicate: duplicate.sort() };
}

const speaker = (row: E0ChatRow) => `${row.name || "?"}${row.isUser ? " (player)" : ""}`;

export const e0Transcript = (rows: readonly E0ChatRow[], beforeId = Number.POSITIVE_INFINITY): string =>
  spoken(rows).filter((row) => row.id < beforeId).map((row) => `[${row.id}] ${speaker(row)}: ${row.text.trim()}`).join("\n\n");

export function e0WriterPrompt(rows: readonly E0ChatRow[], per: number = E0_LABEL_RULES.perSession): string {
  return [
    "Below is a group roleplay chat transcript. Every message starts with its message id in brackets, then the speaker; \"(player)\" marks the human player's turns.",
    `Write ${per} test questions for a memory system. Each question is one the player could ask later in this chat about`
      + " what exactly a character said, promised, called someone or something, or vowed earlier. Rules:",
    "- The answer must be specific words that appear in one message (or at most two messages) of the transcript: those message ids are the gold ids.",
    "- askMessageId is the id of a (player) message where the question would be asked. It must come at least 8 messages"
      + " after the latest gold message, so the answer is no longer among the last few messages.",
    `- Do not copy ${E0_LABEL_RULES.copiedRun} or more consecutive words from the gold message into the question; name the speaker and the topic instead.`,
    "- Each question must have one clear answer in the transcript. Prefer distinct moments and distinct speakers; avoid the very first message.",
    "- English only. asker is the player's name.",
    "Answer with exactly one JSON object and nothing else:",
    "{\"questions\": [{\"askMessageId\": <id>, \"asker\": \"<player name>\", \"text\": \"<question>\", \"gold\": [<id>]}]}",
    "",
    "TRANSCRIPT",
    e0Transcript(rows),
  ].join("\n");
}

export function e0CheckerPrompt(rows: readonly E0ChatRow[], questions: ReadonlyArray<{ key: string; written: E0WrittenQuestion }>): string {
  return [
    "Below is a group roleplay chat transcript. Every message starts with its message id in brackets, then the speaker; \"(player)\" marks the human player's turns.",
    "Each question below is asked by the player at its own point in the chat (its askMessageId). For each question, consider ONLY"
      + " messages with an id lower than that question's askMessageId, and find the message or messages whose exact words answer it.",
    "answerable is false when those messages hold no exact words that answer it, or when the question is ambiguous (more than two"
      + " different moments could be meant). ids lists one or two message ids, the ones holding the exact words.",
    "Answer with exactly one JSON object and nothing else:",
    "{\"answers\": {\"<key>\": {\"answerable\": true|false, \"ids\": [<id>, ...]}}}",
    "",
    "QUESTIONS",
    ...questions.map(({ key, written }) => `- key ${key}, askMessageId ${written.askMessageId}, asked by ${written.asker || "the player"}: ${written.text}`),
    "",
    "TRANSCRIPT",
    e0Transcript(rows, Math.max(...questions.map(({ written }) => written.askMessageId))),
  ].join("\n");
}

export function e0JsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const ids = (value: unknown): number[] | null => (Array.isArray(value) && value.every((entry) => Number.isInteger(entry)) ? (value as number[]) : null);

export function readE0Written(raw: Record<string, unknown> | null): E0WrittenQuestion[] {
  const rows = raw && Array.isArray(raw.questions) ? raw.questions : [];
  return rows.flatMap((row) => {
    if (!isRecord(row) || !Number.isInteger(row.askMessageId) || typeof row.text !== "string") return [];
    const gold = ids(row.gold);
    return gold ? [{ askMessageId: row.askMessageId as number, asker: typeof row.asker === "string" ? row.asker : "", text: row.text.trim(), gold }] : [];
  });
}

export function readE0Check(raw: Record<string, unknown> | null): E0CheckAnswer | null {
  if (!raw || typeof raw.answerable !== "boolean") return null;
  return { answerable: raw.answerable, ids: ids(raw.ids) ?? [] };
}

const words = (text: string) => text.toLowerCase().replace(/[^a-z0-9']+/g, " ").trim().split(" ").filter(Boolean);

export function copiedRun(question: string, source: string, run: number = E0_LABEL_RULES.copiedRun): boolean {
  const asked = ` ${words(question).join(" ")} `;
  const said = words(source);
  for (let index = 0; index + run <= said.length; index += 1) if (asked.includes(` ${said.slice(index, index + run).join(" ")} `)) return true;
  return false;
}

export function e0WrittenProblem(rows: readonly E0ChatRow[], question: E0WrittenQuestion): string | null {
  const ask = rows.find((row) => row.id === question.askMessageId);
  if (!ask) return "asking turn is not a message";
  if (!ask.isUser) return "asking turn is not a player message";
  if (!question.text) return "empty question";
  if (question.gold.length < 1 || question.gold.length > 2) return `gold holds ${question.gold.length} ids, 1-2 allowed`;
  const collection = e0Collection(rows, question.askMessageId);
  if (collection.length < E0_POOL_SIZE) return `collection holds ${collection.length} messages, under ${E0_POOL_SIZE}`;
  const inCollection = new Set(collection.map((item) => item.id));
  if (question.gold.some((id) => !inCollection.has(id))) return "gold outside the collection (at or after the asking turn, or inside protect)";
  const gold = rows.filter((row) => question.gold.includes(row.id));
  if (gold.some((row) => copiedRun(question.text, row.text))) return `question copies ${E0_LABEL_RULES.copiedRun}+ consecutive words of its gold`;
  return null;
}

export const e0Agreed = (gold: readonly number[], check: E0CheckAnswer): boolean =>
  check.answerable && check.ids.length > 0 && check.ids.every((id) => gold.includes(id));

export function mergeE0Labels(drafts: readonly E0LabelDraft[], chats: ReadonlyMap<string, readonly E0ChatRow[]>, writer: string, checker: string): E0LabelMerge {
  const questions: E0LabelQuestion[] = [];
  const invalid: Array<{ id: string; reason: string }> = [];
  const counts = { written: drafts.length, invalid: 0, unchecked: 0, agreed: 0, disagreed: 0 };
  for (const draft of drafts) {
    const rows = chats.get(draft.session);
    const problem = rows ? e0WrittenProblem(rows, draft.written) : `no chat for session ${draft.session}`;
    if (problem) {
      counts.invalid += 1;
      invalid.push({ id: draft.id, reason: problem });
      continue;
    }
    if (!draft.check) {
      counts.unchecked += 1;
      continue;
    }
    const agreed = e0Agreed(draft.written.gold, draft.check);
    counts[agreed ? "agreed" : "disagreed"] += 1;
    const { askMessageId, asker, text, gold } = draft.written;
    questions.push({ id: draft.id, session: draft.session, askMessageId, asker, text, gold, review: { writer, checker, agreed } });
  }
  return { labels: { format: E0_LABELS_FORMAT, source: "private", questions }, counts, invalid };
}
