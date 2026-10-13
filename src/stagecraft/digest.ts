import { viewForOp } from "./scope";
import {
  CURATOR_DIGEST_FULL_LIMIT, CURATOR_DIGEST_INDEX_LIMIT, CURATOR_DIGEST_MIN_ENTRIES,
  type CuratorDigest, type CuratorEntryView, type CuratorOpRecord, type CuratorPlan, type CuratorScope, type WiCuratorOp,
} from "./types";

export const TITLE_ONLY_REFUSAL = "only the title of this entry was shown";

type DigestContext = Pick<CuratorScope, "checkpointName" | "objective" | "canon" | "openArcs"> & { extra?: string[] };

const escapeTerm = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const termsOf = (entry: CuratorEntryView) =>
  [...new Set([entry.comment.split(" - ")[0], ...entry.keys].map((term) => term.trim().toLowerCase()).filter((term) => term.length >= 3))];

const hitsIn = (entry: CuratorEntryView, context: string) =>
  termsOf(entry).filter((term) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeTerm(term)}($|[^\\p{L}\\p{N}])`, "u").test(context)).length;

export const digestApplies = (entries: CuratorEntryView[]): boolean => entries.length >= CURATOR_DIGEST_MIN_ENTRIES;

export function selectCuratorDigest(entries: CuratorEntryView[], scope: DigestContext): CuratorDigest | null {
  if (!digestApplies(entries)) return null;
  const context = [scope.checkpointName, scope.objective, scope.canon, ...scope.openArcs, ...(scope.extra ?? [])].join("\n").toLowerCase();
  const scored = entries.map((entry, index) => ({ entry, index, hits: hitsIn(entry, context) }));
  const picked = new Set(scored.filter((row) => row.hits > 0).sort((left, right) => right.hits - left.hits || left.index - right.index).slice(0, CURATOR_DIGEST_FULL_LIMIT).map((row) => row.entry));
  const rest = entries.filter((entry) => !picked.has(entry));
  const unlisted = rest.slice(CURATOR_DIGEST_INDEX_LIMIT);
  const hidden = new Set(unlisted);
  return {
    full: entries.filter((entry) => picked.has(entry)), titleOnly: rest.slice(0, CURATOR_DIGEST_INDEX_LIMIT), unlisted,
    listed: entries.filter((entry) => !hidden.has(entry)),
  };
}

export const digestVocabulary = (digest: CuratorDigest): CuratorEntryView[] => digest.listed;

const isEdit = (op: { kind: string }) => op.kind === "rewrite" || op.kind === "patch";

export function refuseTitleOnlyEdits(plan: CuratorPlan, digest: CuratorDigest): CuratorPlan {
  const hidden = new Set(digest.titleOnly);
  const vocabulary = digestVocabulary(digest);
  const dropped = [...plan.dropped];
  const refused = [...(plan.refused ?? [])];
  const records: CuratorOpRecord[] = [];
  for (const record of plan.records) {
    const op = record.op as WiCuratorOp;
    const entry = op.kind === "create" ? undefined : viewForOp(vocabulary, op);
    if (!entry || !hidden.has(entry)) {
      records.push(record);
      continue;
    }
    if (isEdit(op)) {
      dropped.push(`${op.kind}: "${op.comment}": ${TITLE_ONLY_REFUSAL}`);
      refused.push(op);
      continue;
    }
    records.push({ ...record, seen: "title" });
  }
  return { ...plan, records, dropped, refused };
}

export const titleOnlyEditRefusal = (record: CuratorOpRecord): string | null =>
  record.seen === "title" && isEdit(record.op) && "comment" in record.op ? `"${record.op.comment}": ${TITLE_ONLY_REFUSAL}` : null;
