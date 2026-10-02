import {
  CURATOR_MAX_TEXT, contentShownInPart, isNoteOp, type CuratorEntryView, type CuratorOp, type CuratorOpRecord,
  type CuratorPlan, type CuratorProposal, type CuratorProposalRecord, type StagecraftAcceptMode, type WiCuratorOp,
} from "./types";
import { findSpanFuzzy } from "./fuzzy";
import { viewForOp } from "./scope";

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
    if (contentShownInPart(entry.content)) return { ok: false, message: "only part of this entry was shown; propose a [patch]" };
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

const opText = (op: WiCuratorOp) => (op.kind === "rewrite" ? op.text : op.kind === "patch" ? `${op.anchor} => ${op.replace}` : "");

export const declineKey = (op: WiCuratorOp): string => `${op.kind}:${opTargetKey(op)}:${normalize(opText(op))}`;

export const declinedOps = (proposals: CuratorProposalRecord[], checkpointId: string, sinceBoundary: number, options: { rejected?: boolean } = {}): WiCuratorOp[] =>
  proposals
    .filter((record) => record.curator === "wi" && record.checkpointId === checkpointId && record.boundary >= sinceBoundary)
    .flatMap((record) => [
      ...(options.rejected === false ? [] : record.ops.filter((entry) => entry.status === "rejected" && !isNoteOp(entry.op)).map((entry) => entry.op as WiCuratorOp)),
      ...(record.refused ?? []).filter((op) => !isNoteOp(op)),
    ]);

export const decidedOp = (entry: CuratorOpRecord, status: "accepted" | "rejected", op?: CuratorOp): CuratorOp => {
  const chosen = op ?? entry.op;
  if (status !== "accepted" || !entry.fuzzy || chosen.kind !== "patch" || entry.op.kind !== "patch" || chosen.anchor !== entry.op.anchor) return chosen;
  return { ...chosen, anchor: entry.fuzzy.anchor };
};

const nearMatch = (op: WiCuratorOp, entry: CuratorEntryView | undefined): CuratorOpRecord | null => {
  if (op.kind !== "patch" || !entry) return null;
  const found = findSpanFuzzy(entry.content, op.anchor);
  if (!found) return null;
  const exact = previewCuratorOp({ ...op, anchor: found.anchor }, entry);
  const marker = applyCuratorPatch(entry.content, found.anchor, "\u0000").content.indexOf("\u0000");
  if (!exact.ok || marker !== found.start) return null;
  const fuzzy = { anchor: found.anchor, span: entry.content.slice(found.start, found.end), score: Math.round(found.score * 100) / 100 };
  return { op, status: "pending", message: `${exact.message} (near match, ${Math.round(found.score * 100)}%)`, before: beforeImage(entry), fuzzy };
};

const beforeImage = (entry: CuratorEntryView) => ({ content: entry.content, disabled: entry.disabled, ...(entry.uid !== undefined ? { uid: entry.uid } : {}) });

export function planCuratorProposal(
  proposal: CuratorProposal,
  entries: CuratorEntryView[],
  options: { mode?: StagecraftAcceptMode; declined?: WiCuratorOp[] } = {},
): CuratorPlan {
  const declined = new Set((options.declined ?? []).map(declineKey));
  const seen = new Set<string>();
  const dropped = [...proposal.dropped];
  const refused: WiCuratorOp[] = [];
  const records: CuratorOpRecord[] = [];
  for (const op of [...proposal.ops].sort((left, right) => ORDER[left.kind] - ORDER[right.kind])) {
    const key = `${op.kind}:${opTargetKey(op)}`;
    if (seen.has(key)) {
      dropped.push(`${op.kind}: "${op.comment}" was proposed twice`);
      refused.push(op);
      continue;
    }
    seen.add(key);
    if (declined.has(declineKey(op))) {
      dropped.push(`${op.kind}: "${op.comment}" was declined earlier`);
      refused.push(op);
      continue;
    }
    const entry = viewForOp(entries, op);
    const preview = previewCuratorOp(op, entry);
    const near = !preview.ok && options.mode === "review" ? nearMatch(op, entry) : null;
    if (near) {
      records.push(near);
      continue;
    }
    if (!preview.ok) {
      dropped.push(`${op.kind}: ${preview.message}`);
      refused.push(op);
      continue;
    }
    records.push({ op, status: "pending", message: preview.message, before: entry ? beforeImage(entry) : undefined });
  }
  return { records, dropped, refused };
}
