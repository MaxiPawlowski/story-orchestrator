import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { askClaude, askSol, type ModelReply } from './e0LabelRun.mts';
import { scoreP6, type P6Proposal } from './promiseScore.mts';
import type { PromiseKit } from './promiseRun.mts';

export type P6Case = {
  id: string; title: string; premise: string; promisee: string; quote: string;
  frontier: { id: string; name: string; objective: string }; canon: string; otherThreads: string[];
};
export type P6Set = { format: string; synthetic: boolean; player: string; cast: Array<{ id: string; name: string }>; cases: P6Case[] };
export type Asker = (prompt: string, workDir: string) => Promise<ModelReply>;
export type ProposalFields = NonNullable<P6Proposal['fields']>;

const nameOf = (set: P6Set) => (id: string) => set.cast.find((member) => member.id === id)?.name ?? id;

export function promiseHook(kit: PromiseKit, set: P6Set, entry: P6Case): string[] {
  const row = {
    id: `p${entry.id}`, promisee: entry.promisee, quote: entry.quote, madeAt: { boundary: 0 }, events: [],
    source: { chatId: `p47-${entry.id}`, messageId: 0, revision: { swipeId: null, hash: '0' }, speaker: set.player, isUser: true, span: [0, entry.quote.length], inputRange: { from: 0, to: 0 } },
  };
  return kit.promiseHooks({ rows: [row] }, () => 'all-present', nameOf(set));
}

export function directorInput(kit: PromiseKit, set: P6Set, entry: P6Case) {
  return {
    title: entry.title, premise: entry.premise, cast: set.cast.map((member) => ({ name: member.name })), path: [entry.frontier.name], frontier: entry.frontier,
    canon: entry.canon, openThreads: [...entry.otherThreads, ...promiseHook(kit, set, entry)], resolvedThreads: [], plans: [], refused: null, qualities: [],
    tension: { suggested: 'stirring', current: 'calm' }, chapter: { number: 1, anchorsIn: 1, size: [3, 5], mayClose: false }, ending: { finalAllowed: false, finalRequired: false },
  };
}

const firstObject = (text: string): Record<string, unknown> | null => {
  const start = text.indexOf('{');
  for (let end = text.lastIndexOf('}'); start >= 0 && end > start; end = text.lastIndexOf('}', end - 1)) {
    try {
      const value = JSON.parse(text.slice(start, end + 1));
      if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
    } catch {
      continue;
    }
  }
  return null;
};

const text = (value: unknown) => (typeof value === 'string' ? value : '');

export function proposalFields(raw: string): ProposalFields | null {
  const value = firstObject(raw);
  if (!value || !text(value.name) || !text(value.objective)) return null;
  const opens = value.opens_when as { new?: { rubric?: unknown } } | undefined;
  const qualities = Array.isArray(value.new_qualities) ? value.new_qualities as Array<{ rubric?: unknown }> : [];
  const rubrics = [text(opens?.new?.rubric), ...qualities.map((quality) => text(quality?.rubric))].filter(Boolean);
  return { name: text(value.name), objective: text(value.objective), rubrics, chapterTitle: text(value.chapter_title) || null };
}

export function guardFields(kit: PromiseKit, fields: ProposalFields, player: string): string[] {
  return (['name', 'objective'] as const).filter((field) => kit.narratesPlayer(fields[field], [player]));
}

export function raterPrompt(set: P6Set, entry: P6Case, fields: ProposalFields): string {
  return [
    'A story director wrote the next turning point of an interactive story. The player plays the character named ' + set.player + '.',
    `Earlier, the player made this promise to ${nameOf(set)(entry.promisee)}: "${entry.quote}"`,
    'Turning point written by the director:',
    JSON.stringify({ name: fields.name, objective: fields.objective, rubrics: fields.rubrics, chapter_title: fields.chapterTitle }, null, 1),
    'Question: does the turning point NARRATE the player keeping the promise, breaking it, or answering it (stating or assuming as settled what the player does, says, decides or feels about the promise)?',
    'World pressure that makes the promise relevant (a character reminds, a deadline nears, an obstacle appears) is NOT narration. A rubric that only asks whether the player did something is NOT narration.',
    'Answer with exactly one JSON object: {"narrates": true|false, "kind": "keeping"|"breaking"|"answering"|"none", "evidence": "<the exact words, or empty>"}',
  ].join('\n');
}

export function parseRater(raw: string): { narrates: boolean; kind: string; evidence?: string } | null {
  const value = firstObject(raw);
  if (!value || typeof value.narrates !== 'boolean') return null;
  return { narrates: value.narrates, kind: text(value.kind) || 'none', ...(text(value.evidence) ? { evidence: text(value.evidence) } : {}) };
}

const writeJson = (file: string, value: unknown) => writeFile(file, `${JSON.stringify(value, null, 1)}\n`, 'utf-8');

export async function directorPrompts(kit: PromiseKit, set: P6Set, out: string): Promise<number> {
  await mkdir(join(out, 'prompts'), { recursive: true });
  for (const entry of set.cases) await writeFile(join(out, 'prompts', `${entry.id}.txt`), kit.renderDirectorPrompt(directorInput(kit, set, entry)), 'utf-8');
  return set.cases.length;
}

export async function directorRun({ kit, set, out, ask = askSol, log = console.log }: { kit: PromiseKit; set: P6Set; out: string; ask?: Asker; log?: (line: string) => void }) {
  await directorPrompts(kit, set, out);
  await mkdir(join(out, 'proposals'), { recursive: true });
  for (const entry of set.cases) {
    const file = join(out, 'proposals', `${entry.id}.json`);
    if (existsSync(file)) continue;
    const prompt = await readFile(join(out, 'prompts', `${entry.id}.txt`), 'utf-8');
    const proposal: P6Proposal & { raw?: string; model?: string | null } = { id: entry.id };
    try {
      const reply = await ask(prompt, out);
      const fields = proposalFields(reply.text);
      Object.assign(proposal, { raw: reply.text, model: reply.model }, fields ? { fields, guard: guardFields(kit, fields, set.player) } : { error: 'no director JSON' });
    } catch (error) {
      proposal.error = error instanceof Error ? error.message : String(error);
    }
    await writeJson(file, proposal);
    log(`${entry.id} ${proposal.error ?? `guard=${(proposal.guard ?? []).length}`}`);
  }
}

export async function directorRate({ set, out, ask = askClaude, log = console.log }: { set: P6Set; out: string; ask?: Asker; log?: (line: string) => void }) {
  for (const entry of set.cases) {
    const file = join(out, 'proposals', `${entry.id}.json`);
    if (!existsSync(file)) continue;
    const proposal = JSON.parse(await readFile(file, 'utf-8')) as P6Proposal & { raterModel?: string | null; raterRaw?: string };
    if (!proposal.fields || proposal.rater) continue;
    try {
      const reply = await ask(raterPrompt(set, entry, proposal.fields), out);
      proposal.rater = parseRater(reply.text);
      proposal.raterModel = reply.model;
      proposal.raterRaw = reply.text;
    } catch (error) {
      log(`${entry.id} rater failed: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    await writeJson(file, proposal);
    log(`${entry.id} narrates=${proposal.rater?.narrates ?? 'unparsed'}`);
  }
}

export async function directorScore(set: P6Set, out: string) {
  const proposals: P6Proposal[] = [];
  for (const entry of set.cases) {
    const file = join(out, 'proposals', `${entry.id}.json`);
    proposals.push(existsSync(file) ? JSON.parse(await readFile(file, 'utf-8')) as P6Proposal : { id: entry.id, error: 'not run' });
  }
  return scoreP6(proposals);
}
