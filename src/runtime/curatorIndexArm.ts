import { buildWiCuratorPrompt, NO_CURATOR_ENTRIES, renderCuratorEntry } from "@stagecraft/prompt";
import { entryRef, viewForOp } from "@stagecraft/scope";
import type { CuratorEntryView, CuratorPlan, CuratorScope } from "@stagecraft/types";

export const INDEX_MIN_ENTRIES = 40;
export const INDEX_FULL_LIMIT = 16;

export interface CuratorIndexArm {
  full: CuratorEntryView[];
  titleOnly: CuratorEntryView[];
  prompt: string;
  ratio: number;
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const curatorIndexArm = (scope: CuratorScope): CuratorIndexArm => {
  if (scope.entries.length < INDEX_MIN_ENTRIES) throw new Error(`the curator index arm needs at least ${INDEX_MIN_ENTRIES} entries`);
  const context = [scope.checkpointName, scope.objective, scope.canon, ...scope.openArcs].join("\n").toLowerCase();
  const scored = scope.entries.map((entry, index) => {
    const terms = [...new Set([entry.comment.split(" - ")[0], ...entry.keys].map((term) => term.trim().toLowerCase()).filter((term) => term.length >= 3))];
    return { entry, index, hits: terms.filter((term) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(term)}($|[^\\p{L}\\p{N}])`, "u").test(context)).length };
  });
  const picked = new Set(scored.filter((row) => row.hits > 0).sort((left, right) => right.hits - left.hits || left.index - right.index).slice(0, INDEX_FULL_LIMIT).map((row) => row.entry));
  const full = scope.entries.filter((entry) => picked.has(entry));
  const titleOnly = scope.entries.filter((entry) => !picked.has(entry));
  const groups = new Map<string, string[]>();
  for (const entry of titleOnly) {
    const initial = entry.comment.trim().charAt(0).toUpperCase();
    const group = /[A-Z]/.test(initial) ? initial : "#";
    const line = `${[entryRef(entry, scope.entries), `"${entry.comment}"`].filter(Boolean).join(" ")} [currently ${entry.disabled ? "off" : "on"}]`;
    groups.set(group, [...(groups.get(group) ?? []), line]);
  }
  const index = [...groups].sort(([left], [right]) => left.localeCompare(right)).map(([initial, lines]) => `${initial}: ${lines.join("; ")}`).join("\n");
  const body = full.map((entry) => renderCuratorEntry(entry, scope.entries)).join("\n") || "(no entry matches what has happened; see the index below)";
  const titleHint = "OTHER ENTRIES (title only: you have not seen their content, so you may only [disable] the ones [currently on], or [enable] one [currently off]):";
  const listing = `${body}\n\n${titleHint}\n${index}`;
  const prompt = buildWiCuratorPrompt({ ...scope, entries: [] }).replace(NO_CURATOR_ENTRIES, () => listing);
  return { full, titleOnly, prompt, ratio: prompt.length / buildWiCuratorPrompt(scope).length };
};

export const refuseIndexEdits = (plan: CuratorPlan, arm: CuratorIndexArm): CuratorPlan => {
  const hidden = new Set(arm.titleOnly);
  const all = [...arm.full, ...arm.titleOnly];
  const dropped = [...plan.dropped];
  const refused = [...(plan.refused ?? [])];
  const records = plan.records.filter((record) => {
    const op = record.op;
    if (op.kind !== "rewrite" && op.kind !== "patch") return true;
    const entry = viewForOp(all, op);
    if (!entry || !hidden.has(entry)) return true;
    dropped.push(`${op.kind}: "${op.comment}": only the title of this entry was shown`);
    refused.push(op);
    return false;
  });
  return { ...plan, records, dropped, refused };
};
