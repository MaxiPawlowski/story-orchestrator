export type RecallStratum = 'critical' | 'detail';
export type RecallKind = 'H6' | 'H6r';

export interface RecallProbe { id: string; stratum: RecallStratum; question: string; answer: string; source: number }
export interface RecallSet { chat: string; group: string; responder: string; probes: RecallProbe[] }
export interface RecallReply { id: string; arm: 'on' | 'off'; text: string; cut: number | null; marked: number | null; ms: number }
export interface RecallRating { id: string; arm: 'on' | 'off'; correct: boolean; contradicts: boolean; error?: string }

export const RECALL_SHAPE: Record<RecallKind, { critical: number; detail: number }> = { H6: { critical: 10, detail: 10 }, H6r: { critical: 10, detail: 0 } };

export const H6_FLOORS = { overall: 16, critical: 9, perStratumSlack: 1 } as const;

export function validateRecallSet(set: unknown, kind: RecallKind): string[] {
  const problems: string[] = [];
  const value = set as Partial<RecallSet> | null;
  if (!value || typeof value !== 'object') return ['the probe file is not an object'];
  for (const key of ['chat', 'group', 'responder'] as const) if (typeof value[key] !== 'string' || !value[key]) problems.push(`${key} is required`);
  const probes = Array.isArray(value.probes) ? value.probes : [];
  const ids = new Set<string>();
  for (const [index, probe] of probes.entries()) {
    const at = `probes[${index}]`;
    if (!probe || typeof probe.id !== 'string' || !probe.id) { problems.push(`${at}.id is required`); continue; }
    if (ids.has(probe.id)) problems.push(`${at}: duplicate id ${probe.id}`);
    ids.add(probe.id);
    if (probe.stratum !== 'critical' && probe.stratum !== 'detail') problems.push(`${at}.stratum is critical or detail`);
    if (typeof probe.question !== 'string' || !probe.question.trim()) problems.push(`${at}.question is required`);
    if (typeof probe.answer !== 'string' || !probe.answer.trim()) problems.push(`${at}.answer is required`);
    if (!Number.isInteger(probe.source) || probe.source < 0) problems.push(`${at}.source is a message index`);
    if (typeof probe.question === 'string' && typeof probe.answer === 'string' && probe.answer.trim().length > 3 && probe.question.toLowerCase().includes(probe.answer.trim().toLowerCase())) problems.push(`${at}: the question gives its own answer away`);
  }
  const shape = RECALL_SHAPE[kind];
  const critical = probes.filter((probe) => probe?.stratum === 'critical').length;
  const detail = probes.filter((probe) => probe?.stratum === 'detail').length;
  if (critical !== shape.critical || detail !== shape.detail) problems.push(`${kind} needs ${shape.critical} critical and ${shape.detail} detail probes, the file has ${critical} and ${detail}`);
  return problems;
}

export function belowCut(set: RecallSet, cut: number): string[] {
  return set.probes.filter((probe) => probe.source >= cut).map((probe) => `${probe.id}: source message ${probe.source} is not below the cut (${cut})`);
}

export function installWindow(cut: number): { installed: boolean; cut: number } {
  const root = globalThis as any;
  const key = 'talkControlInterceptor';
  if (root.__h63Window) root[key] = root.__h63Window.original;
  const original = root[key];
  if (typeof original !== 'function') throw new Error('talkControlInterceptor is not installed: the extension is not running');
  const IGNORE = Symbol.for('ignore');
  const state = { original, cut, applied: [] as Array<{ type: unknown; rows: number; marked: number; at: number }> };
  root.__h63Window = state;
  root[key] = async function (chat: any[], contextSize: number, abort: unknown, type: unknown) {
    const result = await original.call(this, chat, contextSize, abort, type);
    if (type === 'quiet' || type === 'impersonate') return result;
    const live = root.SillyTavern.getContext().chat as any[];
    const ids = new Map<unknown, number>();
    live.forEach((message, index) => { if (message?.extra && typeof message.extra === 'object') ids.set(message.extra, index); });
    let marked = 0;
    chat.forEach((row, index) => {
      const at = ids.get(row?.extra);
      if (at === undefined || at >= state.cut) return;
      chat[index] = { ...row, extra: { ...(row.extra ?? {}), [IGNORE]: true } };
      marked += 1;
    });
    state.applied.push({ type, rows: chat.length, marked, at: Date.now() });
    return result;
  };
  return { installed: true, cut };
}

export function removeWindow(): { removed: boolean } {
  const root = globalThis as any;
  if (!root.__h63Window) return { removed: false };
  root.talkControlInterceptor = root.__h63Window.original;
  delete root.__h63Window;
  return { removed: true };
}

export const RECALL_RATER_SYSTEM = [
  'You check whether a roleplay reply answers a recall question correctly. You see the question, the answer the story established and the reply, nothing else.',
  'Answer with exactly one JSON object: {"correct": boolean, "contradicts": boolean}.',
  'correct: the reply gives the established answer (same substance, any wording). A vague, evasive or "I do not remember" reply is not correct.',
  'contradicts: the reply gives a different, conflicting answer.',
].join('\n');

export function recallRaterPrompt(probe: RecallProbe, reply: string): string {
  return [`Question: ${probe.question}`, `Established answer: ${probe.answer}`, 'Reply:', reply].join('\n');
}

export function parseRecall(raw: Record<string, unknown> | null): { correct: boolean; contradicts: boolean } | null {
  if (!raw || typeof raw.correct !== 'boolean' || typeof raw.contradicts !== 'boolean') return null;
  return { correct: raw.correct, contradicts: raw.contradicts };
}

export function recallScore(set: RecallSet, ratings: readonly RecallRating[], arm: 'on' | 'off') {
  const stratum = (name: RecallStratum) => {
    const ids = new Set(set.probes.filter((probe) => probe.stratum === name).map((probe) => probe.id));
    const mine = ratings.filter((rating) => rating.arm === arm && ids.has(rating.id) && !rating.error);
    return { of: ids.size, rated: mine.length, correct: mine.filter((rating) => rating.correct).length, contradicts: mine.filter((rating) => rating.contradicts).length };
  };
  const critical = stratum('critical');
  const detail = stratum('detail');
  return { arm, critical, detail, overall: { of: critical.of + detail.of, rated: critical.rated + detail.rated, correct: critical.correct + detail.correct } };
}

export function h6Verdict(set: RecallSet, ratings: readonly RecallRating[], kind: RecallKind) {
  const on = recallScore(set, ratings, 'on');
  const off = recallScore(set, ratings, 'off');
  const complete = on.overall.rated === on.overall.of && off.overall.rated === off.overall.of;
  if (kind === 'H6r') return { kind, on, off, complete, verdict: complete ? 'recorded' : 'incomplete' };
  const checks = {
    overall: on.overall.correct >= H6_FLOORS.overall,
    critical: on.critical.correct >= H6_FLOORS.critical,
    criticalVsOff: on.critical.correct >= off.critical.correct - H6_FLOORS.perStratumSlack,
    detailVsOff: on.detail.correct >= off.detail.correct - H6_FLOORS.perStratumSlack,
  };
  return { kind, on, off, complete, checks, verdict: !complete ? 'incomplete' : Object.values(checks).every(Boolean) ? 'pass' : 'fail' };
}

export const DRAFT_SYSTEM = [
  'You write recall probes for a roleplay transcript excerpt. Each probe is a question a player could ask in character, whose answer is stated plainly in the excerpt.',
  'Answer with exactly one JSON object: {"probes": [{"stratum": "critical"|"detail", "question": string, "answer": string, "source": integer}]}.',
  'critical: a fact the story depends on (who did what, a promise, a name, where something is). detail: a small concrete detail (a colour, a number, an object).',
  'source is the [index] of the message that states the answer. Never put the answer in the question. Write in English.',
].join('\n');

export function draftPrompt(rows: ReadonlyArray<{ index: number; name: string; text: string }>, count: number): string {
  return [`Write ${count} probes (about half critical) from this excerpt.`, '', ...rows.map((row) => `[${row.index}] ${row.name}: ${row.text}`)].join('\n');
}
