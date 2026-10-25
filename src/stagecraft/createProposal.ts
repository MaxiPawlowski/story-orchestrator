import type { NormalizedStory } from "@engine/index";
import { parseCreateLines, validateCreate, type CreateCandidateContext, type CreateVerdict } from "./createCandidate";
import { capRefusal, hiddenTitleRefusal } from "./createPlan";
import { protectedRefusal } from "./curatorTiers";
import { previewCuratorOp } from "./proposal";
import type { CreateCuratorOp, CuratorOpRecord, CuratorPlan, WiCuratorOp } from "./types";

export interface CreatePlanOptions {
  story: NormalizedStory | null;
  cap: number;
  used: number;
  declined: WiCuratorOp[];
}

const toOp = (candidate: { lorebook: string; comment: string; keys: string[]; content: string }): CreateCuratorOp =>
  ({ kind: "create", lorebook: candidate.lorebook, comment: candidate.comment, keys: candidate.keys, text: candidate.content });

const titleKey = (op: { lorebook: string; comment: string }) => `${op.lorebook.toLowerCase()}::${op.comment.toLowerCase()}`;

const createRefusal = (op: CreateCuratorOp, verdict: CreateVerdict, options: CreatePlanOptions, seen: { proposed: boolean; declined: boolean; full: boolean }): string | null => {
  const preview = previewCuratorOp(op, undefined);
  const checks: Array<string | null | undefined> = [
    verdict.ok ? null : verdict.reason ?? "refused",
    hiddenTitleRefusal(options.story, op.lorebook, op.comment),
    seen.proposed ? `"${op.comment}" was proposed twice` : null,
    seen.declined ? `"${op.comment}" was declined earlier` : null,
    protectedRefusal(op, ""),
    preview.ok ? null : preview.message,
    seen.full ? capRefusal(options.cap) : null,
  ];
  return checks.find((check): check is string => Boolean(check)) ?? null;
};

export function planCreateProposal(raw: string, context: CreateCandidateContext, options: CreatePlanOptions): CuratorPlan {
  const declined = new Set(options.declined.filter((op) => op.kind === "create").map(titleKey));
  const records: CuratorOpRecord[] = [];
  const dropped: string[] = [];
  const refused: WiCuratorOp[] = [];
  const titles = new Set<string>();
  const refuse = (op: CreateCuratorOp, reason: string) => {
    dropped.push(reason);
    refused.push(op);
  };
  for (const candidate of parseCreateLines(raw)) {
    const op = toOp(candidate);
    const verdict = validateCreate(candidate, context);
    const title = titleKey(op);
    const reason = createRefusal(op, verdict, options, { proposed: titles.has(title), declined: declined.has(title), full: options.used + records.length >= options.cap });
    if (reason) refuse(op, reason);
    else records.push({ op, status: "pending", message: previewCuratorOp(op, undefined).message, nearDups: verdict.nearDups, created: { keys: op.keys } });
    titles.add(title);
  }
  return { records, dropped, refused };
}
