import { CURATOR_MAX_TEXT, type CuratorEntryView, type WiCuratorOp, type CuratorOpRecord, type CuratorProposal } from "./types";

const normalize = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();

// The anchor is prompted as "first words || last words" but small models shorten it, so an ellipsis
// or a single phrase are read the same way.
export const splitPatchAnchor = (anchor: string): { head: string; tail: string } => {
  const parts = anchor.split(/\s*(?:\|\||\.\.\.|…)\s*/).map((part) => part.trim()).filter(Boolean);
  return { head: parts[0] ?? "", tail: parts.length > 1 ? parts[parts.length - 1] : "" };
};

// Finds `needle` in `haystack` ignoring how whitespace was typed, and reports where it really sits.
const findSpan = (haystack: string, needle: string, from = 0): { start: number; end: number } | null => {
  const wanted = normalize(needle);
  if (!wanted) return null;
  const words = wanted.split(" ").map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(words.join("\\s+"), "i");
  const match = pattern.exec(haystack.slice(from));
  return match ? { start: from + match.index, end: from + match.index + match[0].length } : null;
};

export interface PatchResult {
  ok: boolean;
  content: string;
  message?: string;
}

// Replaces the span from the first anchor word-run to the last one. A missing anchor is a failed op,
// never a silent whole-entry overwrite — the whole point of the boundary syntax.
export function applyCuratorPatch(content: string, anchor: string, replace: string): PatchResult {
  const { head, tail } = splitPatchAnchor(anchor);
  const start = findSpan(content, head);
  if (!start) return { ok: false, content, message: `the text "${head.slice(0, 40)}" is not in this entry` };
  const end = tail ? findSpan(content, tail, start.start) : start;
  if (!end) return { ok: false, content, message: `the text "${tail.slice(0, 40)}" does not follow "${head.slice(0, 40)}" in this entry` };
  // A tail anchor rarely includes the sentence's full stop, so the replacement's own one would sit
  // next to the leftover: drop the duplicate at the seam and nowhere else.
  const tailFrom = Math.max(start.end, end.end);
  const remainder = /[.!?]$/.test(replace) && content.slice(tailFrom, tailFrom + 1) === replace.slice(-1)
    ? content.slice(tailFrom + 1)
    : content.slice(tailFrom);
  return { ok: true, content: `${content.slice(0, start.start)}${replace}${remainder}` };
}

export const opTargetKey = (op: WiCuratorOp): string => `${op.lorebook.toLowerCase()}::${op.comment.toLowerCase()}`;

// What an op would do to the entry it names, decided without touching the host: the review card
// shows this, and the boundary applier writes exactly it.
export function previewCuratorOp(op: WiCuratorOp, entry: CuratorEntryView | undefined): { ok: boolean; message: string; content?: string; disabled?: boolean } {
  if (!entry) return { ok: false, message: `"${op.comment}" is not an entry in ${op.lorebook}` };
  if (op.kind === "enable") return entry.disabled ? { ok: true, message: `Switch "${entry.comment}" on`, disabled: false } : { ok: false, message: `"${entry.comment}" is already on` };
  if (op.kind === "disable") return entry.disabled ? { ok: false, message: `"${entry.comment}" is already off` } : { ok: true, message: `Switch "${entry.comment}" off`, disabled: true };
  if (op.kind === "rewrite") {
    if (op.text.length > CURATOR_MAX_TEXT) return { ok: false, message: `the replacement text is longer than ${CURATOR_MAX_TEXT} characters` };
    if (normalize(op.text) === normalize(entry.content)) return { ok: false, message: `"${entry.comment}" already reads that way` };
    return { ok: true, message: `Rewrite "${entry.comment}"`, content: op.text };
  }
  const patched = applyCuratorPatch(entry.content, op.anchor, op.replace);
  if (!patched.ok) return { ok: false, message: patched.message ?? "the patch does not apply" };
  if (normalize(patched.content) === normalize(entry.content)) return { ok: false, message: `"${entry.comment}" already reads that way` };
  return { ok: true, message: `Patch "${entry.comment}"`, content: patched.content };
}

// Rewrites and patches go first, then the on/off flips: `upsertWIEntry` re-enables whatever it
// writes, so a disable that follows a rewrite is the one order where both survive.
const ORDER: Record<WiCuratorOp["kind"], number> = { rewrite: 0, patch: 0, enable: 1, disable: 1 };

export function planCuratorProposal(proposal: CuratorProposal, entries: CuratorEntryView[]): { records: CuratorOpRecord[]; dropped: string[] } {
  const byKey = new Map(entries.map((entry) => [`${entry.lorebook.toLowerCase()}::${entry.comment.toLowerCase()}`, entry]));
  const seen = new Set<string>();
  const dropped = [...proposal.dropped];
  const records: CuratorOpRecord[] = [];
  for (const op of [...proposal.ops].sort((left, right) => ORDER[left.kind] - ORDER[right.kind])) {
    const key = `${op.kind}:${opTargetKey(op)}`;
    if (seen.has(key)) {
      dropped.push(`${op.kind}: "${op.comment}" was proposed twice`);
      continue;
    }
    seen.add(key);
    const entry = byKey.get(opTargetKey(op));
    const preview = previewCuratorOp(op, entry);
    if (!preview.ok) {
      dropped.push(`${op.kind}: ${preview.message}`);
      continue;
    }
    records.push({ op, status: "pending", message: preview.message, before: entry ? { content: entry.content, disabled: entry.disabled } : undefined });
  }
  return { records, dropped };
}
