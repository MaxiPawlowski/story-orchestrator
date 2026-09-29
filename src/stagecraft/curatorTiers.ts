import { applyCuratorPatch } from "./proposal";
import { viewForOp } from "./scope";
import type { CuratorEntryView, CuratorOpRecord, CuratorPlan, StagecraftAcceptMode, WiCuratorOp } from "./types";

const MARKER = /\{\{\/\/\s*so:(auto|protect|end)\s*\}\}/gi;

export type CuratorTier = "auto" | "review";

interface Region {
  start: number;
  end: number;
}

export interface EntryMarks {
  tier: CuratorTier;
  spans: Array<Region & { text: string }>;
  markers: Region[];
  kinds: string[];
}

const markersIn = (text: string) => [...text.matchAll(new RegExp(MARKER.source, "gi"))];

export function entryMarks(content: string): EntryMarks {
  const spans: EntryMarks["spans"] = [];
  const markers: Region[] = [];
  const kinds: string[] = [];
  let open: number | null = null;
  for (const match of markersIn(content)) {
    const kind = match[1].toLowerCase();
    const start = match.index ?? 0;
    const end = start + match[0].length;
    markers.push({ start, end });
    kinds.push(kind);
    if (kind === "protect" && open === null) open = start;
    if (kind === "end" && open !== null) {
      spans.push({ start: open, end, text: content.slice(open, end) });
      open = null;
    }
  }
  if (open !== null) spans.push({ start: open, end: content.length, text: content.slice(open) });
  return { tier: kinds.includes("auto") ? "auto" : "review", spans, markers, kinds };
}

const overlaps = (left: Region, right: Region) => left.start < right.end && left.end > right.start;

const countKinds = (kinds: string[]) => kinds.reduce((counts, kind) => counts.set(kind, (counts.get(kind) ?? 0) + 1), new Map<string, number>());

const addsMarker = (before: string[], after: string[]) => {
  const had = countKinds(before);
  return [...countKinds(after)].some(([kind, count]) => count > (had.get(kind) ?? 0));
};

const patchRegion = (content: string, anchor: string): Region | null => {
  const probe = "\u0000";
  const patched = applyCuratorPatch(content, anchor, probe);
  if (!patched.ok) return null;
  const start = patched.content.indexOf(probe);
  return { start, end: start + content.length - (patched.content.length - probe.length) };
};

export const PROTECTED_REFUSAL = "touches protected text";
export const MARKER_REFUSAL = "adds a curator marker";

export function protectedRefusal(op: WiCuratorOp, content: string): string | null {
  if (op.kind === "enable") return null;
  const marks = entryMarks(content);
  if (op.kind === "disable") return marks.spans.length ? `"${op.comment}" ${PROTECTED_REFUSAL}, so it may not be switched off` : null;
  if (op.kind === "rewrite") {
    if (addsMarker(marks.kinds, markersIn(op.text).map((match) => match[1].toLowerCase()))) return `"${op.comment}": the rewrite ${MARKER_REFUSAL}`;
    return marks.spans.every((span) => op.text.includes(span.text)) ? null : `"${op.comment}": the rewrite ${PROTECTED_REFUSAL}`;
  }
  if (markersIn(op.replace).length) return `"${op.comment}": the patch ${MARKER_REFUSAL}`;
  const region = patchRegion(content, op.anchor);
  if (!region) return null;
  const touched = [...marks.spans, ...marks.markers].some((span) => overlaps(region, span));
  return touched ? `"${op.comment}": the patch ${PROTECTED_REFUSAL}` : null;
}

export function refuseProtected(plan: CuratorPlan, entries: CuratorEntryView[]): CuratorPlan {
  const records: CuratorOpRecord[] = [];
  const dropped = [...plan.dropped];
  const refused = [...(plan.refused ?? [])];
  for (const record of plan.records) {
    const op = record.op as WiCuratorOp;
    const entry = viewForOp(entries, op);
    const probe = op.kind === "patch" && record.fuzzy ? { ...op, anchor: record.fuzzy.anchor } : op;
    const refusal = entry ? protectedRefusal(probe, entry.content) : null;
    if (refusal) {
      dropped.push(`${op.kind}: ${refusal}`);
      refused.push(op);
    } else {
      records.push(record);
    }
  }
  return { records, dropped, refused };
}

export function routeByTier(records: CuratorOpRecord[], entries: CuratorEntryView[], mode: StagecraftAcceptMode): CuratorOpRecord[] {
  return records.map((record) => {
    const entry = viewForOp(entries, record.op as WiCuratorOp);
    const auto = mode === "auto" && entry !== undefined && entryMarks(entry.content).tier === "auto";
    return auto ? { ...record, status: "accepted" as const } : record;
  });
}
