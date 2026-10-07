export interface PayloadBlock {
  key: string;
  value: string;
  position: number | null;
  depth: number | null;
  role: number | null;
  scan: boolean | null;
}

export interface PayloadCapture {
  label: string;
  member: string | null;
  mainApi: string | null;
  promptKind: 'text' | 'chat';
  checkpoint: string | null;
  prompt: string;
  blocks: PayloadBlock[];
}

export interface PayloadCase {
  case: string;
  fixture: string;
  fixtureSha256: string;
  chatIds: string[];
  captures: PayloadCapture[];
}

export interface NormaliseRule {
  id: string;
  pattern: RegExp;
  replacement: string;
  why: string;
}

const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';

export const CHAT_ID_TOKEN = '<CHAT-ID>';

export const NORMALISE_RULES: readonly NormaliseRule[] = [
  { id: 'iso-time', pattern: /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:?\d{2})?/g, replacement: '<ISO-TIME>', why: 'message send_date and audit timestamps in ISO form' },
  { id: 'st-stamp', pattern: /\b\d{4}-\d{1,2}-\d{1,2} ?@\d{1,2}h ?\d{1,2}m ?\d{1,2}s(?: ?\d{1,3}ms)?/g, replacement: '<ST-STAMP>', why: "ST's humanizedDateTime: sandbox chat file names, and the mirror book named after one" },
  { id: 'send-date', pattern: new RegExp(`\\b(?:${MONTHS}) \\d{1,2}, \\d{4}(?: \\d{1,2}:\\d{2} ?[ap]m)?`, 'gi'), replacement: '<SEND-DATE>', why: "ST's getMessageTimeStamp and the {{date}} macro" },
  { id: 'clock', pattern: /\b\d{1,2}:\d{2}(?::\d{2})? ?[AP]M\b/g, replacement: '<CLOCK>', why: 'the {{time}} macro (moment LT)' },
  { id: 'epoch-ms', pattern: /\b1[6-9]\d{11}\b/g, replacement: '<EPOCH-MS>', why: 'Date.now() ids (group generation ids, created-at stamps)' },
  { id: 'uuid', pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, replacement: '<UUID>', why: 'crypto.randomUUID ids' },
];

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function normalise(text: string, literals: string[] = []): string {
  let out = text;
  const ordered = [...new Set(literals.filter((literal) => typeof literal === 'string' && literal.length >= 4))].sort((a, b) => b.length - a.length);
  for (const literal of ordered) out = out.replace(new RegExp(escapeRegExp(literal), 'g'), CHAT_ID_TOKEN);
  for (const rule of NORMALISE_RULES) out = out.replace(rule.pattern, rule.replacement);
  return out;
}

export function renderCapture(capture: PayloadCapture | null): string {
  if (!capture) return '';
  const lines = [
    `# capture ${capture.label}`,
    `member: ${capture.member ?? '(resting)'}`,
    `mainApi: ${capture.mainApi ?? '(unknown)'}`,
    `promptKind: ${capture.promptKind}`,
    `checkpoint: ${capture.checkpoint ?? '(none)'}`,
    '## prompt',
    capture.prompt,
  ];
  for (const block of [...capture.blocks].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))) {
    lines.push(`## block ${block.key} position=${block.position} depth=${block.depth} role=${block.role} scan=${block.scan}`, block.value);
  }
  return lines.join('\n');
}

export const renderNormalised = (capture: PayloadCapture | null, literals: string[] = []) => normalise(renderCapture(capture), literals);

export interface Hunk {
  baselineLine: number;
  removed: string[];
  added: string[];
}

const MAX_LCS_CELLS = 16_000_000;

export function lineHunks(baseline: string, candidate: string): Hunk[] {
  if (baseline === candidate) return [];
  const a = baseline === '' ? [] : baseline.split('\n');
  const b = candidate === '' ? [] : candidate.split('\n');
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA -= 1; endB -= 1; }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  if (!midA.length && !midB.length) return [{ baselineLine: start + 1, removed: [], added: [] }];
  const n = midA.length;
  const m = midB.length;
  if ((n + 1) * (m + 1) > MAX_LCS_CELLS) return [{ baselineLine: start + 1, removed: midA, added: midB }];
  const width = m + 1;
  const table = new Int32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * width + j] = midA[i] === midB[j] ? table[(i + 1) * width + j + 1] + 1 : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  const hunks: Hunk[] = [];
  let current: Hunk | null = null;
  const flush = () => { if (current && (current.removed.length || current.added.length)) hunks.push(current); current = null; };
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && midA[i] === midB[j]) { flush(); i += 1; j += 1; continue; }
    current ??= { baselineLine: start + i + 1, removed: [], added: [] };
    if (j < m && (i >= n || table[i * width + j + 1] >= table[(i + 1) * width + j])) { current.added.push(midB[j]); j += 1; }
    else { current.removed.push(midA[i]); i += 1; }
  }
  flush();
  return hunks;
}

export function firstDiffByte(a: string, b: string): number | null {
  if (a === b) return null;
  const limit = Math.min(a.length, b.length);
  for (let index = 0; index < limit; index += 1) if (a.charCodeAt(index) !== b.charCodeAt(index)) return index;
  return limit;
}

export type DeclaredPattern = string | { contains: string } | { regex: string; flags?: string };

export interface DeclaredDiff {
  case: string;
  label?: string;
  plan: string;
  owner: string;
  added?: DeclaredPattern[];
  removed?: DeclaredPattern[];
  why?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const DECLARATION_KEYS = new Set(['case', 'label', 'plan', 'owner', 'added', 'removed', 'why']);

function patternProblems(value: unknown, where: string): string[] {
  if (!Array.isArray(value)) return [`${where}: expected a list of patterns`];
  return value.flatMap((pattern, index) => {
    const at = `${where}[${index}]`;
    if (typeof pattern === 'string') return pattern.length ? [] : [`${at}: an empty substring matches nothing`];
    if (!isRecord(pattern)) return [`${at}: expected a string, {contains} or {regex, flags?}`];
    const keys = Object.keys(pattern);
    if ('contains' in pattern) return keys.length === 1 && nonEmpty(pattern.contains) ? [] : [`${at}: {contains} takes one non-empty string and nothing else`];
    if ('regex' in pattern) {
      if (!nonEmpty(pattern.regex) || keys.some((key) => key !== 'regex' && key !== 'flags')) return [`${at}: {regex, flags?} takes a non-empty source`];
      if ('flags' in pattern && (typeof pattern.flags !== 'string' || /[^imsu]/.test(pattern.flags))) return [`${at}: flags may only use i, m, s, u`];
      try { new RegExp(pattern.regex as string, `${pattern.flags ?? ''}g`); } catch (error) { return [`${at}: ${(error as Error).message}`]; }
      if (new RegExp(`^(?:${pattern.regex})$`, (pattern.flags as string) ?? '').test('')) return [`${at}: a regex that matches the empty string declares nothing`];
      return [];
    }
    return [`${at}: expected a string, {contains} or {regex, flags?}`];
  });
}

export function validateDeclarations(doc: unknown): { declarations: DeclaredDiff[]; problems: string[] } {
  const list = Array.isArray(doc) ? doc : isRecord(doc) && Array.isArray(doc.declarations) ? doc.declarations : null;
  if (!list) return { declarations: [], problems: ['declared-diff file: expected {declarations: [...]} or a list'] };
  const problems: string[] = [];
  list.forEach((entry: unknown, index: number) => {
    const where = `declarations[${index}]`;
    if (!isRecord(entry)) { problems.push(`${where}: expected an object`); return; }
    for (const key of Object.keys(entry)) if (!DECLARATION_KEYS.has(key)) problems.push(`${where}: unknown key "${key}"`);
    for (const key of ['case', 'plan', 'owner']) if (!nonEmpty(entry[key])) problems.push(`${where}.${key}: required non-empty string`);
    if ('label' in entry && !nonEmpty(entry.label)) problems.push(`${where}.label: expected a non-empty string`);
    if ('why' in entry && typeof entry.why !== 'string') problems.push(`${where}.why: expected a string`);
    const added = entry.added ?? [];
    const removed = entry.removed ?? [];
    problems.push(...patternProblems(added, `${where}.added`), ...patternProblems(removed, `${where}.removed`));
    if (Array.isArray(added) && Array.isArray(removed) && !added.length && !removed.length) problems.push(`${where}: declares no added or removed pattern`);
  });
  return { declarations: problems.length ? [] : list as DeclaredDiff[], problems };
}

const patternRegex = (pattern: DeclaredPattern): RegExp => {
  if (typeof pattern === 'string') return new RegExp(escapeRegExp(pattern), 'g');
  if ('contains' in pattern) return new RegExp(escapeRegExp(pattern.contains), 'g');
  return new RegExp(pattern.regex, `${pattern.flags ?? ''}g`);
};

interface PatternRef { declaration: number; side: 'added' | 'removed'; index: number; regex: RegExp }

function strip(text: string, patterns: PatternRef[], used: Set<string>): string {
  let rest = text;
  for (const ref of patterns) {
    let hit = false;
    rest = rest.replace(ref.regex, (match) => { if (match.length) hit = true; return '\n'; });
    if (hit) used.add(`${ref.declaration}:${ref.side}:${ref.index}`);
  }
  return rest;
}

export interface CaptureDiff {
  label: string;
  identical: boolean;
  firstDiffByte: number | null;
  hunks: Array<Hunk & { declared: boolean; declaredBy: number[] }>;
}

export interface CaseDiff {
  case: string;
  captures: CaptureDiff[];
}

export interface StaleDeclaration {
  declaration: number;
  case: string;
  label: string | null;
  plan: string;
  owner: string;
  unmatched: string[];
}

export interface PayloadDiffReport {
  ok: boolean;
  identical: boolean;
  problems: string[];
  cases: CaseDiff[];
  undeclared: Array<{ case: string; label: string; baselineLine: number; removed: string[]; added: string[] }>;
  stale: StaleDeclaration[];
}

export function diffCapture(baseline: PayloadCapture | null, candidate: PayloadCapture | null, baselineLiterals: string[], candidateLiterals: string[], declarations: DeclaredDiff[], caseName: string, used: Set<string>): CaptureDiff {
  const label = (candidate ?? baseline)?.label ?? '(none)';
  const before = renderNormalised(baseline, baselineLiterals);
  const after = renderNormalised(candidate, candidateLiterals);
  const applicable = declarations
    .map((declaration, index) => ({ declaration, index }))
    .filter(({ declaration }) => declaration.case === caseName && (!declaration.label || declaration.label === label));
  const refs = (side: 'added' | 'removed'): PatternRef[] => applicable.flatMap(({ declaration, index }) => (declaration[side] ?? []).map((pattern, at) => ({ declaration: index, side, index: at, regex: patternRegex(pattern) })));
  const addedRefs = refs('added');
  const removedRefs = refs('removed');
  const hunks = lineHunks(before, after).map((hunk) => {
    const local = new Set<string>();
    const addedRest = hunk.added.length ? strip(hunk.added.join('\n'), addedRefs, local) : '';
    const removedRest = hunk.removed.length ? strip(hunk.removed.join('\n'), removedRefs, local) : '';
    const declared = (hunk.added.length > 0 || hunk.removed.length > 0) && !addedRest.trim() && !removedRest.trim();
    if (declared) for (const key of local) used.add(key);
    const declaredBy = declared ? [...new Set([...local].map((key) => Number(key.split(':')[0])))].sort((a, b) => a - b) : [];
    return { ...hunk, declared, declaredBy };
  });
  return { label, identical: before === after, firstDiffByte: firstDiffByte(before, after), hunks };
}

export function diffCases(baseline: PayloadCase[], candidate: PayloadCase[], declarations: DeclaredDiff[] = []): PayloadDiffReport {
  const problems: string[] = [];
  const used = new Set<string>();
  const byName = (cases: PayloadCase[]) => new Map(cases.map((entry) => [entry.case, entry]));
  const before = byName(baseline);
  const after = byName(candidate);
  for (const name of before.keys()) if (!after.has(name)) problems.push(`case "${name}" is in the baseline and missing from the candidate`);
  for (const name of after.keys()) if (!before.has(name)) problems.push(`case "${name}" is in the candidate and not in the baseline: re-capture the baseline, a new case is never a declared diff`);
  for (const entry of [...baseline, ...candidate]) {
    const labels = entry.captures.map((capture) => capture.label);
    const dupes = labels.filter((label, index) => labels.indexOf(label) !== index);
    if (dupes.length) problems.push(`case "${entry.case}" carries duplicate capture labels: ${[...new Set(dupes)].join(', ')}`);
  }
  const cases: CaseDiff[] = [];
  for (const [name, base] of before) {
    const cand = after.get(name);
    if (!cand) continue;
    if (base.fixtureSha256 !== cand.fixtureSha256) problems.push(`case "${name}": the fixture changed between captures (${base.fixtureSha256.slice(0, 12)} vs ${cand.fixtureSha256.slice(0, 12)}), so a diff measures the fixture, not the build`);
    const labels = [...new Set([...base.captures.map((capture) => capture.label), ...cand.captures.map((capture) => capture.label)])];
    const captures = labels.map((label) => diffCapture(
      base.captures.find((capture) => capture.label === label) ?? null,
      cand.captures.find((capture) => capture.label === label) ?? null,
      base.chatIds,
      cand.chatIds,
      declarations,
      name,
      used,
    ));
    cases.push({ case: name, captures });
  }
  const undeclared = cases.flatMap((entry) => entry.captures.flatMap((capture) => capture.hunks.filter((hunk) => !hunk.declared).map((hunk) => ({ case: entry.case, label: capture.label, baselineLine: hunk.baselineLine, removed: hunk.removed, added: hunk.added }))));
  const stale: StaleDeclaration[] = declarations.flatMap((declaration, index) => {
    const unmatched = (['added', 'removed'] as const).flatMap((side) => (declaration[side] ?? []).map((pattern, at) => ({ pattern, key: `${index}:${side}:${at}`, side })).filter(({ key }) => !used.has(key)).map(({ pattern, side }) => `${side} ${JSON.stringify(pattern)}`));
    return unmatched.length ? [{ declaration: index, case: declaration.case, label: declaration.label ?? null, plan: declaration.plan, owner: declaration.owner, unmatched }] : [];
  });
  const identical = cases.every((entry) => entry.captures.every((capture) => capture.identical)) && !problems.length;
  return { ok: !problems.length && !undeclared.length && !stale.length, identical, problems, cases, undeclared, stale };
}

export function describeReport(report: PayloadDiffReport, declarations: DeclaredDiff[] = []): string[] {
  const lines: string[] = [];
  for (const problem of report.problems) lines.push(`PROBLEM ${problem}`);
  for (const entry of report.cases) {
    for (const capture of entry.captures) {
      if (capture.identical) { lines.push(`same      ${entry.case}/${capture.label}`); continue; }
      const open = capture.hunks.filter((hunk) => !hunk.declared).length;
      lines.push(`${open ? 'DIFFERS' : 'declared'}  ${entry.case}/${capture.label} first byte ${capture.firstDiffByte}, ${capture.hunks.length} hunk(s), ${open} undeclared`);
      for (const hunk of capture.hunks) {
        const by = hunk.declaredBy.map((index) => `${declarations[index]?.plan} -> ${declarations[index]?.owner}`).join('; ');
        lines.push(`  @${hunk.baselineLine} ${hunk.declared ? `declared by ${by}` : 'UNDECLARED'}`);
        for (const line of hunk.removed.slice(0, 12)) lines.push(`  - ${line.slice(0, 200)}`);
        if (hunk.removed.length > 12) lines.push(`  - … ${hunk.removed.length - 12} more`);
        for (const line of hunk.added.slice(0, 12)) lines.push(`  + ${line.slice(0, 200)}`);
        if (hunk.added.length > 12) lines.push(`  + … ${hunk.added.length - 12} more`);
      }
    }
  }
  for (const entry of report.stale) lines.push(`STALE     declaration ${entry.declaration} (${entry.plan} -> ${entry.owner}, case ${entry.case}${entry.label ? `/${entry.label}` : ''}) never happened: ${entry.unmatched.join(', ')}`);
  lines.push(report.ok ? (report.identical ? 'payload invariance: identical' : 'payload invariance: every difference declared') : `payload invariance: FAIL (${report.undeclared.length} undeclared hunk(s), ${report.stale.length} stale declaration(s), ${report.problems.length} problem(s))`);
  return lines;
}

export const CAPTURE_LABEL = /^[a-z0-9][a-z0-9._-]*$/;

export function fixtureCaptureLabels(text: string): string[] {
  return [...text.matchAll(/__soPayloadGolden\.capture\(\s*\\?['"]([^'"\\]+)\\?['"]/g)].map((match) => match[1]);
}
