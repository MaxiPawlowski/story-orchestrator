import { createHash } from 'node:crypto';
import { checkSequence, failingVerdict, type PromptBlockHint, type SequenceEntry, type SequencePair } from '../../../src/runtime/prefixStability.ts';
import type { PayloadCase } from './payloadGolden.mts';

export const RESTING_KEY = '(resting)';

export interface PrefixGroup {
  group: string;
  entries: SequenceEntry[];
  texts?: boolean;
}

export interface PrefixDeclaration {
  group: string;
  key?: string;
  from: string;
  to: string;
  plan: string;
  why: string;
}

export interface PrefixPairRow extends SequencePair {
  group: string;
  side: boolean;
  failing: boolean;
  declaredBy: number | null;
  excerpt?: { previous: string; next: string };
}

export interface PrefixReport {
  ok: boolean;
  problems: string[];
  pairs: PrefixPairRow[];
  failing: PrefixPairRow[];
  reported: PrefixPairRow[];
  stale: Array<{ declaration: number } & PrefixDeclaration>;
  keys: { total: number; singletons: number };
}

export const SIDE_PREFIX = 'side:';
const EXCERPT = 60;

export function payloadCaseGroup(entry: PayloadCase): PrefixGroup {
  return {
    group: entry.case,
    texts: true,
    entries: entry.captures.map((capture) => ({
      key: capture.member ?? RESTING_KEY,
      label: capture.label,
      prompt: capture.prompt,
      blocks: capture.blocks.map((block): PromptBlockHint => ({ value: block.value, position: block.position })),
    })),
  };
}

export const SIDE_KEY_CHARS = Number(process.env.SO_PREFIX_SIDE_KEY_CHARS) || 160;
const firstTurn = (prompt: string) => {
  const end = prompt.indexOf('<turn|>');
  return prompt.slice(0, end > 0 ? Math.min(end, SIDE_KEY_CHARS) : SIDE_KEY_CHARS);
};

const renderMessages = (messages: unknown[]): string => messages.map((message: any) => [`### ${message?.role ?? '?'}${message?.name ? ` (${message.name})` : ''}`, typeof message?.content === 'string' ? message.content : JSON.stringify(message?.content ?? null)].join('\n')).join('\n');

export function payloadLogGroups(rows: any[]): PrefixGroup[] {
  const byChat = new Map<string, SequenceEntry[]>();
  for (const row of rows) {
    if (!row || row.kind === 'response' || typeof row.url !== 'string' || !/generate/.test(row.url)) continue;
    const body = row.parsedBody ?? (() => { try { return typeof row.body === 'string' ? JSON.parse(row.body) : null; } catch { return null; } })();
    const prompt = typeof body?.prompt === 'string' ? body.prompt : Array.isArray(body?.messages) ? renderMessages(body.messages) : null;
    if (!prompt) continue;
    const chat = String(row.chatId ?? '(no chat)');
    const member = typeof row.draftMemberName === 'string' && row.draftMemberName ? row.draftMemberName : null;
    const loud = member !== null && body?.stream !== false;
    const key = loud ? member : `${SIDE_PREFIX}${createHash('sha1').update(firstTurn(prompt)).digest('hex').slice(0, 12)}`;
    const list = byChat.get(chat) ?? [];
    list.push({ key, label: `#${row.index ?? list.length}`, prompt });
    byChat.set(chat, list);
  }
  return [...byChat].map(([group, entries]) => ({ group, entries, texts: false }));
}

const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const DECLARATION_KEYS = new Set(['group', 'key', 'from', 'to', 'plan', 'why']);

export function validatePrefixDeclarations(doc: unknown): { declarations: PrefixDeclaration[]; problems: string[] } {
  const list = Array.isArray(doc) ? doc : doc && typeof doc === 'object' && Array.isArray((doc as any).prefix) ? (doc as any).prefix : null;
  if (!list) return { declarations: [], problems: ['prefix declarations: expected {prefix: [...]} or a list'] };
  const problems: string[] = [];
  list.forEach((entry: any, index: number) => {
    const where = `prefix[${index}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) { problems.push(`${where}: expected an object`); return; }
    for (const key of Object.keys(entry)) if (!DECLARATION_KEYS.has(key)) problems.push(`${where}: unknown key "${key}"`);
    for (const key of ['group', 'from', 'to', 'plan', 'why']) if (!nonEmpty(entry[key])) problems.push(`${where}.${key}: required non-empty string`);
    if ('key' in entry && !nonEmpty(entry.key)) problems.push(`${where}.key: expected a non-empty string`);
  });
  return { declarations: problems.length ? [] : list as PrefixDeclaration[], problems };
}

const excerptAt = (text: string, at: number) => JSON.stringify(text.slice(Math.max(0, at - 20), at + EXCERPT)).slice(1, -1);

export function prefixReport(groups: PrefixGroup[], declarations: PrefixDeclaration[] = [], options: { sideFails?: boolean } = {}): PrefixReport {
  const problems: string[] = [];
  const used = new Set<number>();
  const pairs: PrefixPairRow[] = [];
  let total = 0;
  let singletons = 0;
  for (const group of groups) {
    const counts = new Map<string, number>();
    for (const entry of group.entries) counts.set(entry.key, (counts.get(entry.key) ?? 0) + 1);
    total += counts.size;
    singletons += [...counts.values()].filter((count) => count === 1).length;
    const prompts = new Map(group.entries.map((entry) => [entry.label, entry.prompt]));
    if (prompts.size !== group.entries.length) problems.push(`${group.group}: duplicate labels`);
    for (const pair of checkSequence(group.entries)) {
      const side = pair.key.startsWith(SIDE_PREFIX);
      const declaredBy = declarations.findIndex((declaration) => declaration.group === group.group && declaration.from === pair.from && declaration.to === pair.to && (!declaration.key || declaration.key === pair.key));
      if (declaredBy >= 0) used.add(declaredBy);
      const row: PrefixPairRow = { group: group.group, ...pair, side, declaredBy: declaredBy >= 0 ? declaredBy : null, failing: failingVerdict(pair.verdict) && declaredBy < 0 && (!side || options.sideFails === true) };
      if (group.texts && pair.divergence !== null) row.excerpt = { previous: excerptAt(prompts.get(pair.from) ?? '', pair.divergence), next: excerptAt(prompts.get(pair.to) ?? '', pair.divergence) };
      pairs.push(row);
    }
  }
  const stale = declarations.flatMap((declaration, index) => (used.has(index) ? [] : [{ declaration: index, ...declaration }]));
  const failing = pairs.filter((pair) => pair.failing);
  const reported = pairs.filter((pair) => !pair.failing && pair.declaredBy === null && failingVerdict(pair.verdict));
  return { ok: !problems.length && !failing.length && !stale.length, problems, pairs, failing, reported, stale, keys: { total, singletons } };
}

const describePair = (pair: PrefixPairRow) => `${pair.group}/${pair.key} ${pair.from} -> ${pair.to}: ${pair.verdict} divergence ${pair.divergence} boundary ${pair.boundary} (${pair.source ?? 'none'})${pair.lost ? `, ${pair.lost} chars re-prefilled above it` : ''}`;

export function describePrefixReport(report: PrefixReport, declarations: PrefixDeclaration[] = []): string[] {
  const lines: string[] = report.problems.map((problem) => `PROBLEM ${problem}`);
  for (const pair of report.pairs) {
    const tag = pair.failing ? 'FAIL    ' : pair.declaredBy !== null ? 'restart ' : failingVerdict(pair.verdict) ? 'report  ' : 'ok      ';
    lines.push(`${tag} ${describePair(pair)}${pair.declaredBy !== null ? ` [${declarations[pair.declaredBy]?.plan}: ${declarations[pair.declaredBy]?.why}]` : ''}`);
    if (pair.excerpt && failingVerdict(pair.verdict)) lines.push(`  - ${pair.excerpt.previous}`, `  + ${pair.excerpt.next}`);
  }
  for (const entry of report.stale) lines.push(`STALE    declaration ${entry.declaration} (${entry.plan}, ${entry.group} ${entry.from} -> ${entry.to}) matches no consecutive pair`);
  lines.push(`keys ${report.keys.total}, seen once ${report.keys.singletons}`);
  lines.push(report.ok
    ? `prefix stability: ${report.pairs.length} pair(s), every divergence at or after the per-turn boundary or a declared restart${report.reported.length ? ` (${report.reported.length} side-pass pair(s) reported, not gated)` : ''}`
    : `prefix stability: FAIL (${report.failing.length} pair(s) above the boundary, ${report.stale.length} stale declaration(s), ${report.problems.length} problem(s))`);
  return lines;
}
