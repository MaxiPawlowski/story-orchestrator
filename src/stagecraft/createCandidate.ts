import { stripChannelNoise } from "@extraction/parse";
import { buildWiCuratorPrompt } from "./prompt";
import { CURATOR_MAX_OPS, CURATOR_MAX_TEXT, PATCH_ANCHOR_SEPARATOR, type CuratorEntryView, type CuratorScope } from "./types";

export const CREATE_NEAR_DUP_THRESHOLD = 0.85;
export const CREATE_MIN_FACTS = 2;

export interface CreateCandidateOp {
  lorebook: string;
  comment: string;
  keys: string[];
  content: string;
}

export interface CreateCandidateContext {
  allowlist: string[];
  entries: CuratorEntryView[];
  roster: string[];
  facts: string[];
  hidden?: CuratorEntryView[];
}

export interface CreateVerdict {
  op: CreateCandidateOp;
  ok: boolean;
  reason?: string;
  nearDups: Array<{ comment: string; score: number }>;
}

const NEVER_INVENT = "- Never invent new entries, never touch anything outside the list, never write about the player's own knowledge.";
const OUTPUT_LINE = "Then one final line: [why]";

export function buildCreateCandidatePrompt(scope: CuratorScope, context: Pick<CreateCandidateContext, "facts" | "roster" | "allowlist">): string {
  const base = buildWiCuratorPrompt(scope);
  const facts = context.facts.length ? `ESTABLISHED FACTS:\n${context.facts.map((fact) => `- ${fact}`).join("\n")}` : "";
  const createLine = `[create] <lorebook> ${PATCH_ANCHOR_SEPARATOR} <new entry title> ${PATCH_ANCHOR_SEPARATOR} <key, key> ${PATCH_ANCHOR_SEPARATOR} <entry content>`;
  const createRule = [
    `- [create] only for a person, place, group or thing the ESTABLISHED FACTS state at least twice and no listed entry already covers, in one of: ${context.allowlist.join(", ")}.`,
    `- Never create an entry for ${context.roster.join(", ") || "a cast member"}, and never use their names as keys.`,
    "- Never touch anything outside the list, never write about the player's own knowledge.",
  ].join("\n");
  return base
    .replace("ENTRIES YOU MAY TOUCH (no others exist for you):", `${facts ? `${facts}\n\n` : ""}ENTRIES YOU MAY TOUCH (no others exist for you):`)
    .replace(OUTPUT_LINE, `${createLine}\n${OUTPUT_LINE}`)
    .replace(NEVER_INVENT, createRule);
}

const CREATE_PATTERN = /^\[?create]?\s*:?\s*(.*)$/i;

export function parseCreateLines(raw: string): CreateCandidateOp[] {
  const ops: CreateCandidateOp[] = [];
  for (const line of stripChannelNoise(raw ?? "").split(/\r?\n/)) {
    const match = CREATE_PATTERN.exec(line.trim().replace(/^[-*]\s+/, ""));
    if (!match || ops.length >= CURATOR_MAX_OPS) continue;
    const parts = match[1].split(PATCH_ANCHOR_SEPARATOR).map((part) => part.trim().replace(/^["'“”]+|["'“”]+$/g, ""));
    if (parts.length < 4) continue;
    const [lorebook, comment, keys, ...content] = parts;
    ops.push({ lorebook, comment, keys: keys.split(",").map((key) => key.trim()).filter(Boolean), content: content.join(` ${PATCH_ANCHOR_SEPARATOR} `).slice(0, CURATOR_MAX_TEXT).trim() });
  }
  return ops;
}

const fold = (value: string) => value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
const plain = (value: string) => fold(value).replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

const trigrams = (value: string): Set<string> => {
  const text = ` ${plain(value)} `;
  const grams = new Set<string>();
  for (let index = 0; index + 3 <= text.length; index += 1) grams.add(text.slice(index, index + 3));
  return grams;
};

export const trigramJaccard = (left: string, right: string): number => {
  const a = trigrams(left);
  const b = trigrams(right);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  a.forEach((gram) => { if (b.has(gram)) shared += 1; });
  return shared / (a.size + b.size - shared);
};

const mentions = (text: string, name: string) => {
  const needle = plain(name);
  return needle.length > 0 && ` ${plain(text)} `.includes(` ${needle} `);
};

const bare = (value: string) => plain(value).replace(/^(the|a|an) /, "");

export const hiddenTwin = (hidden: CuratorEntryView[], op: Pick<CreateCandidateOp, "comment" | "keys">): CuratorEntryView | undefined => {
  const names = [op.comment, op.keys[0] ?? ""].map(bare).filter(Boolean);
  return hidden.find((entry) => [entry.comment, ...entry.keys].map(bare).some((name) => name && names.includes(name)));
};

export const factsNaming = (facts: string[], op: Pick<CreateCandidateOp, "comment" | "keys">): number => {
  const names = [op.comment, op.keys[0] ?? ""].filter((name) => plain(name).length > 0);
  return new Set(facts.filter((fact) => names.some((name) => mentions(fact, name))).map(plain)).size;
};

export function validateCreate(op: CreateCandidateOp, context: CreateCandidateContext): CreateVerdict {
  const nearDups = context.entries
    .filter((entry) => context.allowlist.includes(entry.lorebook))
    .map((entry) => ({ comment: entry.comment, score: Math.round(trigramJaccard(`${op.comment} ${op.content}`, `${entry.comment} ${entry.content}`) * 100) / 100 }))
    .filter((match) => match.score >= CREATE_NEAR_DUP_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  const refuse = (reason: string): CreateVerdict => ({ op, ok: false, reason, nearDups });
  if (!context.allowlist.includes(op.lorebook)) return refuse(`"${op.lorebook}" is not on this story's stagecraft allowlist`);
  if (!op.comment) return refuse("a new entry needs a title");
  if (context.entries.some((entry) => entry.lorebook === op.lorebook && plain(entry.comment) === plain(op.comment))) return refuse(`"${op.comment}" already exists in ${op.lorebook}`);
  const twin = hiddenTwin(context.hidden ?? [], op);
  if (twin) return refuse(`"${op.comment}" would duplicate "${twin.comment}", which this story keeps from the curator`);
  if (!op.keys.length) return refuse(`"${op.comment}" has no keys, so it would never fire`);
  const castKey = op.keys.find((key) => context.roster.some((name) => plain(name) === plain(key) || plain(name).split(" ").includes(plain(key))));
  if (castKey) return refuse(`"${castKey}" is a cast member's name; as a key it would fire every turn`);
  if (context.roster.some((name) => plain(name) === plain(op.comment))) return refuse(`"${op.comment}" is a cast member`);
  const naming = factsNaming(context.facts, op);
  if (!naming) return refuse(`no live fact names "${op.comment}"`);
  if (naming < CREATE_MIN_FACTS) return refuse(`only one live fact names "${op.comment}"; a new entry needs ${String(CREATE_MIN_FACTS)}`);
  if (!op.content) return refuse(`"${op.comment}" has no content`);
  return { op, ok: true, nearDups };
}

export interface CreateCaseSample {
  created: number;
  valid: CreateCandidateOp[];
  refused: Array<{ comment: string; reason: string }>;
  namesEntity: boolean;
  pass: boolean;
}

export interface CreateCase {
  id: string;
  label: "propose" | "none";
  entity: string | null;
  book: string;
  roster: string[];
  entries: Array<{ uid: number; comment: string; keys: string[]; content: string }>;
  hidden?: Array<{ uid: number; comment: string; keys: string[]; content: string; why?: string }>;
  facts: string[];
  story: string;
  checkpoint: string;
  canon: string;
}

export const caseEntries = (entry: CreateCase): CuratorEntryView[] =>
  entry.entries.map((row) => ({ lorebook: entry.book, comment: row.comment, keys: row.keys, content: row.content, disabled: false, uid: row.uid }));

export const caseScope = (entry: CreateCase): CuratorScope => ({
  storyTitle: entry.story,
  checkpointName: entry.checkpoint,
  objective: "",
  canon: entry.canon,
  openArcs: [],
  entries: caseEntries(entry),
});

export const caseContext = (entry: CreateCase): CreateCandidateContext => ({
  allowlist: [entry.book], entries: caseEntries(entry), roster: entry.roster, facts: entry.facts,
  ...(entry.hidden?.length ? { hidden: entry.hidden.map((row) => ({ lorebook: entry.book, comment: row.comment, keys: row.keys, content: row.content, disabled: false, uid: row.uid })) } : {}),
});

export function scoreCreateSample(entry: CreateCase, raw: string): CreateCaseSample {
  const verdicts = parseCreateLines(raw).map((op) => validateCreate(op, caseContext(entry)));
  const valid = verdicts.filter((verdict) => verdict.ok).map((verdict) => verdict.op);
  const namesEntity = entry.entity !== null && valid.some((op) => mentions(
    op.comment,
    entry.entity as string,
  ) || mentions(entry.entity as string, op.comment) || op.keys.some((key) => mentions(key, entry.entity as string) || mentions(entry.entity as string, key)));
  return {
    created: verdicts.length,
    valid,
    refused: verdicts.filter((verdict) => !verdict.ok).map((verdict) => ({ comment: verdict.op.comment, reason: verdict.reason ?? "" })),
    namesEntity,
    pass: entry.label === "propose" ? namesEntity : valid.length === 0,
  };
}

export function createSuiteVerdict(rows: Array<{ label: "propose" | "none"; passes: boolean[] }>, floors: { propose: number; none: number }) {
  const rate = (label: "propose" | "none") => {
    const samples = rows.filter((row) => row.label === label).flatMap((row) => row.passes);
    return samples.length ? samples.filter(Boolean).length / samples.length : 0;
  };
  const propose = rate("propose");
  const none = rate("none");
  return { propose, none, ok: propose >= floors.propose && none >= floors.none };
}
