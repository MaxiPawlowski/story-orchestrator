import { fnv1a } from "@runtime/hash";
import { isRecord } from "@utils/guards";
import type { E0ChatRow } from "./e0Pool";
import { WITNESS_LABELS_FORMAT, type WitnessLabel, type WitnessLabelSet, type WitnessLabelSpan } from "./witness/score";

export const WITNESS_LABEL_RULES = {
  window: 12,
  writer: "opencode:openai/gpt-6.1-sol",
  checker: "claude-code:claude -p",
  labWriter: "lab:authored-before-the-sp9-run",
} as const;

export type WitnessAudience = string[] | "unknown";

export interface WitnessDraftSpan {
  from: string;
  heard: WitnessAudience;
}

export interface WitnessDraft {
  messageId: number;
  present: string[];
  heard: WitnessAudience;
  spans?: WitnessDraftSpan[];
}

export interface WitnessLabelSession {
  session: string;
  rows: E0ChatRow[];
  members: string[];
  window: number[];
  written: WitnessDraft[] | null;
  checked: WitnessDraft[] | null;
}

export interface WitnessLabelMerge {
  set: WitnessLabelSet;
  counts: { written: number; unchecked: number; invalid: number; agreed: number; disagreed: number };
  invalid: Array<{ id: string; reason: string }>;
}

const spoken = (rows: readonly E0ChatRow[]) => rows.filter((row) => !row.isSystem && row.text.trim());

export function sessionMembers(rows: readonly E0ChatRow[]): string[] {
  const seen: string[] = [];
  spoken(rows).filter((row) => !row.isUser && row.name.trim()).forEach((row) => {
    if (!seen.includes(row.name.trim())) seen.push(row.name.trim());
  });
  return seen;
}

export function witnessWindow(rows: readonly E0ChatRow[], size: number = WITNESS_LABEL_RULES.window): number[] {
  const said = spoken(rows);
  const start = Math.max(0, Math.floor((said.length - size) / 2));
  return said.slice(start, start + size).map((row) => row.id);
}

const speakerOf = (row: E0ChatRow) => `${row.name || "?"}${row.isUser ? " (player)" : ""}`;

const RUBRIC = [
  "Rules:",
  "- present: the members physically in the scene when the message happens.",
  "- A member in the scene hears ordinary speech and sees visible action, whether addressed or not.",
  "- Whispers, asides, private notes and inner thought reach only the members the text says they reach.",
  "- A member not in the scene perceives nothing. The speaker always perceives their own message.",
  "- heard: the members who perceived the whole message first-hand, or \"unknown\" when the text cannot tell.",
  "- If parts of one message reach different audiences (for example dialogue to the room plus a whispered aside, or speech plus private thought),"
    + " set \"mixed\": true and give spans instead of heard: each span starts with its exact first 4-8 words copied from the message (\"from\") and has its own heard.",
  "- Use member names exactly as listed. The player is not a member.",
];

const LABEL_SHAPE = "{\"messageId\": <id>, \"present\": [<names>], \"heard\": [<names>] | \"unknown\"}, "
  + "{\"messageId\": <id>, \"present\": [<names>], \"mixed\": true, \"spans\": [{\"from\": \"<exact first words>\", \"heard\": [<names>] | \"unknown\"}]}";

const transcriptTo = (rows: readonly E0ChatRow[], last: number, scenes?: ReadonlyMap<number, string>) => spoken(rows).filter((row) => row.id <= last)
  .map((row) => `[${row.id}]${scenes?.get(row.id) ? ` {scene ${scenes.get(row.id)}}` : ""} ${speakerOf(row)}: ${row.text.trim()}`).join("\n\n");

const opening = (scenes?: ReadonlyMap<number, string>) =>
  "Below is a group roleplay chat transcript. Every message starts with its message id in brackets, then the speaker; \"(player)\" marks the human player's turns."
    + (scenes ? " {scene X} marks which scene the message belongs to." : "");

export function witnessLabelPrompt(rows: readonly E0ChatRow[], members: readonly string[], window: readonly number[], scenes?: ReadonlyMap<number, string>): string {
  return [
    opening(scenes),
    `The characters (members) are: ${members.join(", ")}. For each message listed under LABEL, decide which members perceived it first-hand.`,
    ...RUBRIC,
    "Answer with exactly one JSON object and nothing else:",
    `{"labels": [${LABEL_SHAPE}]}`,
    "",
    `LABEL: ${window.join(", ")}`,
    "",
    "TRANSCRIPT",
    transcriptTo(rows, Math.max(...window), scenes),
  ].join("\n");
}

export interface AdjudicationItem {
  messageId: number;
  a: WitnessDraft;
  b: WitnessDraft;
}

export const adjudicationOrder = (key: string, first: WitnessDraft, second: WitnessDraft): [WitnessDraft, WitnessDraft] =>
  (parseInt(fnv1a(key), 16) % 2 === 0 ? [first, second] : [second, first]);

const showDraft = (draft: WitnessDraft) => JSON.stringify({ present: draft.present, ...(draft.spans?.length ? { mixed: true, spans: draft.spans } : { heard: draft.heard }) });

export function adjudicationPrompt(rows: readonly E0ChatRow[], members: readonly string[], window: readonly number[], items: readonly AdjudicationItem[], scenes?: ReadonlyMap<number, string>): string {
  return [
    opening(scenes),
    `The characters (members) are: ${members.join(", ")}. Two labellers disagreed about which members perceived some messages first-hand.`
      + " For each message under DISPUTED, read the transcript and give your own label under the rules below. You may agree with Label A, Label B, or neither."
      + " If the transcript does not let you decide, answer {\"messageId\": <id>, \"undecided\": true}.",
    ...RUBRIC,
    "Answer with exactly one JSON object and nothing else:",
    `{"verdicts": [${LABEL_SHAPE}, {"messageId": <id>, "undecided": true}]}`,
    "",
    "DISPUTED",
    ...items.map((item) => `- message ${item.messageId}: Label A ${showDraft(item.a)}; Label B ${showDraft(item.b)}`),
    "",
    "TRANSCRIPT",
    transcriptTo(rows, Math.max(...window), scenes),
  ].join("\n");
}

export function readAdjudication(raw: Record<string, unknown> | null, members: readonly string[]): Map<number, WitnessDraft | "undecided"> {
  const rows = raw && Array.isArray(raw.verdicts) ? raw.verdicts : [];
  const out = new Map<number, WitnessDraft | "undecided">();
  const decided = rows.filter((row) => isRecord(row) && Number.isInteger(row.messageId) && row.undecided !== true);
  rows.forEach((row) => {
    if (isRecord(row) && Number.isInteger(row.messageId) && row.undecided === true) out.set(row.messageId as number, "undecided");
  });
  readWitnessDrafts({ labels: decided }, members).drafts.forEach((draft) => out.set(draft.messageId, draft));
  return out;
}

export function applyAdjudication(
  set: WitnessLabelSet, rows: readonly E0ChatRow[], verdicts: ReadonlyMap<number, WitnessDraft | "undecided">, adjudicator: string, structuralPresence?: ReadonlyMap<number, readonly string[]>,
): { set: WitnessLabelSet; counts: { adjudicated: number; decided: number; unknown: number; unresolved: number } } {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const counts = { adjudicated: 0, decided: 0, unknown: 0, unresolved: 0 };
  const labels = set.labels.map((label): WitnessLabel => {
    if (!label.review || label.review.agreed) return label;
    counts.adjudicated += 1;
    const review = { ...label.review, adjudicator, adjudicated: true };
    const verdict = verdicts.get(label.messageId);
    const row = byId.get(label.messageId);
    const presentOf = (draft: WitnessDraft | null): string[] => {
      if (!structuralPresence) return draft ? draft.present : label.present;
      const heard = draft && !draft.spans?.length && draft.heard !== "unknown" ? draft.heard : [];
      return [...new Set([...(structuralPresence.get(label.messageId) ?? []).filter((name) => set.members.includes(name)), ...heard])].sort();
    };
    if (verdict && verdict !== "undecided" && row) {
      const built = labelFromDraft({ ...verdict, present: presentOf(verdict) }, row, review);
      if (typeof built !== "string") {
        counts[built.heard === "unknown" && !built.spans?.length ? "unknown" : "decided"] += 1;
        return built;
      }
      counts.unresolved += 1;
    }
    counts.unknown += 1;
    return { messageId: label.messageId, present: verdict && verdict !== "undecided" ? presentOf(verdict) : presentOf(null), heard: "unknown", review };
  });
  return { set: { ...set, labels }, counts };
}

const names = (value: unknown, members: readonly string[]): string[] | null => {
  if (!Array.isArray(value)) return null;
  const resolved = value.map((entry) => (typeof entry === "string" ? members.find((member) => member.toLowerCase() === entry.trim().toLowerCase()) ?? null : null));
  return resolved.every((entry): entry is string => entry !== null) ? [...new Set(resolved)].sort() : null;
};

const audience = (value: unknown, members: readonly string[]): WitnessAudience | null => (value === "unknown" ? "unknown" : names(value, members));

export function readWitnessDrafts(raw: Record<string, unknown> | null, members: readonly string[]): { drafts: WitnessDraft[]; problems: Array<{ messageId: number | null; reason: string }> } {
  const rows = raw && Array.isArray(raw.labels) ? raw.labels : [];
  const drafts: WitnessDraft[] = [];
  const problems: Array<{ messageId: number | null; reason: string }> = [];
  for (const row of rows) {
    if (!isRecord(row) || !Number.isInteger(row.messageId)) {
      problems.push({ messageId: null, reason: "malformed label" });
      continue;
    }
    const messageId = row.messageId as number;
    const present = names(row.present, members);
    if (!present) {
      problems.push({ messageId, reason: "present names a non-member" });
      continue;
    }
    if (row.mixed === true) {
      const spans = Array.isArray(row.spans) ? row.spans.map((span) => (isRecord(span) && typeof span.from === "string" ? { from: span.from, heard: audience(span.heard, members) } : null)) : [];
      if (!spans.length || spans.some((span) => !span || span.heard === null)) {
        problems.push({ messageId, reason: "mixed label with a malformed span" });
        continue;
      }
      drafts.push({ messageId, present, heard: "unknown", spans: spans as WitnessDraftSpan[] });
      continue;
    }
    const heard = audience(row.heard, members);
    if (!heard) {
      problems.push({ messageId, reason: "heard names a non-member" });
      continue;
    }
    drafts.push({ messageId, present, heard });
  }
  return { drafts, problems };
}

const sameSet = (left: WitnessAudience, right: WitnessAudience): boolean =>
  (left === "unknown" || right === "unknown" ? left === right : left.length === right.length && left.every((member) => right.includes(member)));

export function sameAudience(left: WitnessDraft, right: WitnessDraft, comparePresent: boolean): boolean {
  if (comparePresent && !sameSet(left.present, right.present)) return false;
  const leftSpans = left.spans ?? [];
  const rightSpans = right.spans ?? [];
  if (leftSpans.length || rightSpans.length) return leftSpans.length === rightSpans.length && leftSpans.every((span, index) => sameSet(span.heard, rightSpans[index].heard));
  return sameSet(left.heard, right.heard);
}

export function resolveDraftSpans(text: string, spans: readonly WitnessDraftSpan[]): WitnessLabelSpan[] | null {
  const starts = spans.map((span) => {
    const anchor = span.from.trim();
    const at = anchor ? text.indexOf(anchor) : -1;
    return at >= 0 && text.indexOf(anchor, at + 1) < 0 ? at : -1;
  });
  if (starts.some((at) => at < 0)) return null;
  if (starts.some((at, index) => index > 0 && at <= starts[index - 1])) return null;
  return spans.map((span, index) => ({ span: [starts[index], index + 1 < starts.length ? starts[index + 1] : text.length], heard: span.heard }));
}

export function labelFromDraft(draft: WitnessDraft, row: E0ChatRow, review: WitnessLabel["review"]): WitnessLabel | string {
  if (draft.spans?.length) {
    const spans = resolveDraftSpans(row.text, draft.spans);
    if (!spans) return "a span anchor is not an exact unique substring in order";
    return { messageId: draft.messageId, present: draft.present, heard: "unknown", spans, review };
  }
  return { messageId: draft.messageId, present: draft.present, heard: draft.heard, review };
}

export function mergeWitnessSession(session: WitnessLabelSession, writer: string, checker: string, comparePresent = true): WitnessLabelMerge {
  const counts = { written: 0, unchecked: 0, invalid: 0, agreed: 0, disagreed: 0 };
  const invalid: Array<{ id: string; reason: string }> = [];
  const labels: WitnessLabel[] = [];
  const byId = new Map(session.rows.map((row) => [row.id, row]));
  for (const messageId of session.window) {
    const id = `${session.session}#${messageId}`;
    const written = session.written?.find((draft) => draft.messageId === messageId) ?? null;
    if (!written) {
      counts.invalid += 1;
      invalid.push({ id, reason: "writer gave no valid label" });
      continue;
    }
    counts.written += 1;
    const checked = session.checked?.find((draft) => draft.messageId === messageId) ?? null;
    if (!checked) {
      counts.unchecked += 1;
      continue;
    }
    const row = byId.get(messageId) as E0ChatRow;
    const agreed = sameAudience(written, checked, comparePresent);
    const label = labelFromDraft(written, row, { writer, checker, agreed });
    if (typeof label === "string") {
      counts.invalid += 1;
      invalid.push({ id, reason: label });
      continue;
    }
    counts[agreed ? "agreed" : "disagreed"] += 1;
    labels.push(label);
  }
  return { set: { format: WITNESS_LABELS_FORMAT, set: session.session, synthetic: false, members: [...session.members], labels }, counts, invalid };
}

export interface LabWitnessRow {
  index: number;
  scene: string;
  speaker: string;
  text: string;
  heard: string[];
  presence: string[];
}

export interface LabWitness {
  session: Omit<WitnessLabelSession, "written" | "checked">;
  written: WitnessDraft[];
  scenes: Map<number, string>;
}

export function labWitnessSession(rows: readonly LabWitnessRow[], members: readonly string[]): LabWitness {
  const chat: E0ChatRow[] = rows.map((row) => ({ id: row.index, name: row.speaker === "player" ? "Player" : row.speaker, isUser: row.speaker === "player", text: row.text }));
  const written = rows.map((row) => {
    const heard = row.heard.filter((name) => members.includes(name)).sort();
    const present = [...new Set([...row.presence.filter((name) => members.includes(name)), ...heard])].sort();
    return { messageId: row.index, present, heard };
  });
  return {
    session: { session: "lab/witness-f4", rows: chat, members: [...members], window: rows.map((row) => row.index) },
    written,
    scenes: new Map(rows.map((row) => [row.index, row.scene])),
  };
}
