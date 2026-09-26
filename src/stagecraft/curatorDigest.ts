import { buildWiCuratorPrompt, NO_CURATOR_ENTRIES, renderCuratorEntry } from "./prompt";
import { entryRef, viewForOp } from "./scope";
import type { CuratorEntryView, CuratorOpRecord, CuratorScope, WiCuratorOp } from "./types";

export const DIGEST_MIN_ENTRIES = 40;
export const DIGEST_FULL_LIMIT = 16;
export const TITLE_ONLY_REFUSAL = "only the title of this entry was shown";

export interface CuratorDigest {
  full: CuratorEntryView[];
  titleOnly: CuratorEntryView[];
}

type DigestContext = Pick<CuratorScope, "checkpointName" | "objective" | "canon" | "openArcs">;

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const occurs = (haystack: string, term: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(term)}($|[^\\p{L}\\p{N}])`, "u").test(haystack);

const termsOf = (entry: CuratorEntryView) =>
  [...new Set([entry.comment.split(" - ")[0], ...entry.keys].map((term) => term.trim().toLowerCase()).filter((term) => term.length >= 3))];

export function digestEntries(entries: CuratorEntryView[], context: DigestContext): CuratorDigest | null {
  if (entries.length < DIGEST_MIN_ENTRIES) return null;
  const haystack = [context.checkpointName, context.objective, context.canon, ...context.openArcs].join("\n").toLowerCase();
  const picked = new Set(entries
    .map((entry, index) => ({ entry, index, hits: termsOf(entry).filter((term) => occurs(haystack, term)).length }))
    .filter((row) => row.hits > 0)
    .sort((left, right) => right.hits - left.hits || left.index - right.index)
    .slice(0, DIGEST_FULL_LIMIT)
    .map((row) => row.entry));
  return { full: entries.filter((entry) => picked.has(entry)), titleOnly: entries.filter((entry) => !picked.has(entry)) };
}

const initialOf = (entry: CuratorEntryView) => {
  const initial = entry.comment.trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(initial) ? initial : "#";
};

export function buildDigestCuratorPrompt(scope: CuratorScope, digest: CuratorDigest): string {
  const all = scope.entries;
  const full = digest.full.map((entry) => renderCuratorEntry(entry, all)).join("\n") || "(no entry matches what has happened; see the index below)";
  const groups = new Map<string, string[]>();
  digest.titleOnly.forEach((entry) => {
    const line = `${[entryRef(entry, all), `"${entry.comment}"`].filter(Boolean).join(" ")}${entry.disabled ? " [currently off]" : ""}`;
    groups.set(initialOf(entry), [...(groups.get(initialOf(entry)) ?? []), line]);
  });
  const index = [...groups].sort(([left], [right]) => left.localeCompare(right)).map(([initial, lines]) => `${initial}: ${lines.join("; ")}`).join("\n");
  const listing = `${full}\n\nOTHER ENTRIES (title only: you have not seen their content, so you may only [enable] or [disable] them):\n${index}`;
  return buildWiCuratorPrompt({ ...scope, entries: [] }).replace(NO_CURATOR_ENTRIES, () => listing);
}

export function refuseTitleOnly(plan: { records: CuratorOpRecord[]; dropped: string[] }, digest: CuratorDigest): { records: CuratorOpRecord[]; dropped: string[] } {
  const hidden = new Set(digest.titleOnly);
  const all = [...digest.full, ...digest.titleOnly];
  const dropped = [...plan.dropped];
  const records = plan.records.filter((record) => {
    const op = record.op as WiCuratorOp;
    const entry = viewForOp(all, op);
    if ((op.kind !== "rewrite" && op.kind !== "patch") || !entry || !hidden.has(entry)) return true;
    dropped.push(`${op.kind}: "${op.comment}": ${TITLE_ONLY_REFUSAL}`);
    return false;
  });
  return { records, dropped };
}
