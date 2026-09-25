import { stripChannelNoise } from "@extraction/parse";
import { CURATOR_MAX_OPS, CURATOR_MAX_TEXT, PATCH_ANCHOR_SEPARATOR, type CuratorEntryView, type WiCuratorOp, type CuratorOpKind, type CuratorProposal } from "./types";
import { entryRef } from "./scope";

const TAG_PATTERN = /^\[?(enable|disable|rewrite|patch|why)]?\s*:?\s*(.*)$/i;

const splitParts = (value: string): string[] =>
  value.split(PATCH_ANCHOR_SEPARATOR).map((part) => part.trim()).filter((part, index) => index === 0 || part.length > 0);

const cap = (value: string) => value.slice(0, CURATOR_MAX_TEXT).trim();

const unquote = (value: string) => value.replace(/^["'“”]+|["'“”]+$/g, "").trim();

const ENTRY_REF = /^#(\d+(?:\.\d+)?)(?![\d.])/;

const REASON_SEPARATOR = /\s\|\s/;

// Titles are a closed vocabulary: the entry the model named has to be one the prompt listed, and it
// is that entry's lorebook that gets written — never a book the model asks for.
const findEntry = (entries: CuratorEntryView[], named: string): { entry?: CuratorEntryView; reason: string } => {
  const text = unquote(named);
  const ref = ENTRY_REF.exec(text);
  if (ref) {
    const entry = entries.find((candidate) => entryRef(candidate, entries) === `#${ref[1]}`);
    return { entry, reason: `#${ref[1]} is not an entry this story owns` };
  }
  const wanted = text.toLowerCase();
  const matches = wanted ? entries.filter((entry) => entry.comment.trim().toLowerCase() === wanted) : [];
  if (matches.length > 1) return { reason: `ambiguous: ${matches.length} entries titled "${text.slice(0, 60)}"` };
  return { entry: matches[0], reason: `"${text.slice(0, 60)}" is not an entry this story owns` };
};

const readOp = (kind: CuratorOpKind, rest: string, entries: CuratorEntryView[]): { op?: WiCuratorOp; dropped?: string } => {
  const parts = splitParts(rest);
  const named = parts[0] ?? "";
  const whole = findEntry(entries, named);
  const beforeReason = named.split(REASON_SEPARATOR)[0];
  const { entry, reason } = whole.entry || beforeReason === named ? whole : { ...findEntry(entries, beforeReason), reason: whole.reason };
  if (!entry) return { dropped: `${kind}: ${reason}` };
  const target = { lorebook: entry.lorebook, comment: entry.comment, ...(entry.uid !== undefined ? { uid: entry.uid } : {}) };
  if (kind === "enable" || kind === "disable") return { op: { kind, ...target } };
  if (kind === "rewrite") {
    const text = cap(parts.slice(1).join(` ${PATCH_ANCHOR_SEPARATOR} `));
    return text ? { op: { kind: "rewrite", ...target, text } } : { dropped: `rewrite: "${entry.comment}" came with no replacement text` };
  }
  // Four parts is the prompted shape (title | first | last | replacement); three is the common
  // small-model shortening, where the whole anchor arrives as one phrase.
  const anchor = parts.length >= 4 ? `${parts[1]} ${PATCH_ANCHOR_SEPARATOR} ${parts[2]}` : parts[1] ?? "";
  const replace = cap(parts.length >= 4 ? parts.slice(3).join(` ${PATCH_ANCHOR_SEPARATOR} `) : parts[2] ?? "");
  if (!anchor || !replace) return { dropped: `patch: "${entry.comment}" needs an anchor and a replacement` };
  return { op: { kind: "patch", ...target, anchor, replace } };
};

// Strict about shape, tolerant about noise — the same bargain the extractor parser strikes.
export function parseCuratorResponse(raw: string, entries: CuratorEntryView[]): CuratorProposal {
  const ops: WiCuratorOp[] = [];
  const dropped: string[] = [];
  let summary = "";
  for (const line of stripChannelNoise(raw ?? "").split(/\r?\n/)) {
    const trimmed = line.trim().replace(/^[-*]\s+/, "");
    if (!trimmed || trimmed.toUpperCase() === "NONE") continue;
    const match = TAG_PATTERN.exec(trimmed);
    if (!match) continue;
    const kind = match[1].toLowerCase();
    if (kind === "why") {
      summary = summary || match[2].trim();
      continue;
    }
    if (ops.length >= CURATOR_MAX_OPS) {
      dropped.push(`over the ${CURATOR_MAX_OPS}-change cap: ${trimmed.slice(0, 60)}`);
      continue;
    }
    const result = readOp(kind as CuratorOpKind, match[2], entries);
    if (result.op) ops.push(result.op);
    else if (result.dropped) dropped.push(result.dropped);
  }
  return { summary: summary || (ops.length ? `${ops.length} World Info change(s)` : "no change needed"), ops, dropped };
}
