import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadEntry, REPO_ROOT } from './bundleEntry.mts';
import { exactIn, RECORDS_FORMAT, type CaseRead, type CaseRecord, type ChatMessage, type P1Case, type P1Set, type P2Case, type P2Seed, type P2Set, type Records } from './promiseScore.mts';

export const P47_DIR = join(REPO_ROOT, 'test', 'measurements', 'v2.8', '47-promises');
export const P47_FILES = ['story.json', 'p1-cases.json', 'p2-cases.json', 'p6-director.json'] as const;
export const PLUMBING_MODES = ['gold', 'greedy', 'paraphrase'] as const;
export type PlumbingMode = (typeof PLUMBING_MODES)[number];

type Member = { id: string; name?: string };
export type Story = { id: string; roster: Member[] } & Record<string, unknown>;
type Cast = Array<{ id: string; names: string[] }>;
type StChat = Array<{ name: string; mes: string; is_user: boolean }>;
type Context = { chatId: string; storyId: string; messages: unknown[]; cast: Cast; playerNames: string[] };

export interface PromiseKit {
  seedPromises(seeds: P2Seed[], ctx: Context): { state: unknown; ids: Record<string, string>; refused: Array<{ key: string; reason: string }> };
  applyReadLines(before: unknown, lines: string[], ctx: Context, window: { from: number; to: number }, ids?: Record<string, string>): CaseRead;
  windowOf(chat: unknown[], from: number, to?: number): { messages: unknown[] };
  promiseHooks(state: unknown, audience: () => string, nameOf: (id: string) => string): string[];
  renderDirectorPrompt(input: unknown): string;
  narratesPlayer(text: string, names?: string[]): boolean;
}

export const loadPromiseKit = () => loadEntry<PromiseKit>('scripts/debug/lib/promiseEntry.ts');

export const readJson = async <T,>(file: string): Promise<T> => JSON.parse(await readFile(file, 'utf-8')) as T;

export const frozenHash = (text: string) => createHash('sha256').update(text.replace(/\r\n/g, '\n'), 'utf-8').digest('hex');

export async function freezeRecord(dir = P47_DIR): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const file of P47_FILES) out[file] = frozenHash(await readFile(join(dir, file), 'utf-8'));
  return out;
}

export async function checkFreeze(dir = P47_DIR): Promise<string[]> {
  const frozen = await readJson<{ sha256: Record<string, string> }>(join(dir, 'freeze.json'));
  const live = await freezeRecord(dir);
  return P47_FILES.filter((file) => frozen.sha256?.[file] !== live[file]).map((file) => `${file}: sha256 ${live[file]} differs from frozen ${frozen.sha256?.[file] ?? 'none'}`);
}

export const stChatOf = (chat: readonly ChatMessage[]): StChat => chat.map((message) => ({ name: message.speaker, mes: message.text, is_user: message.user }));
export const castOf = (story: Story): Cast => story.roster.map((member) => ({ id: member.id, names: [member.name ?? member.id, member.id] }));
export const nameIn = (story: Story) => (id: string): string => story.roster.find((member) => member.id === id)?.name ?? id;
export const chatIdOf = (caseId: string) => `p47-${caseId}`;

export const contextOf = (kit: PromiseKit, story: Story, chat: readonly ChatMessage[], player: string, caseId: string): Context => ({
  chatId: chatIdOf(caseId), storyId: story.id, messages: kit.windowOf(stChatOf(chat), 0).messages, cast: castOf(story), playerNames: [player],
});

export type PromiseReadSpec = { story: Story; chat: StChat; from: number; to: number; playerName: string; chatId: string; seed?: P2Seed[]; promises?: boolean; debugResponse?: string };

export const p1Spec = (story: Story, set: P1Set, entry: P1Case, debugResponse?: string): PromiseReadSpec => ({
  story, chat: stChatOf(entry.chat), from: 0, to: entry.chat.length - 1, playerName: set.player, chatId: chatIdOf(entry.id), ...(debugResponse !== undefined ? { debugResponse } : {}),
});

export const p2Spec = (story: Story, set: P2Set, entry: P2Case, debugResponse?: string): PromiseReadSpec => ({
  story, chat: stChatOf(entry.chat), from: entry.read[0], to: entry.read[1], playerName: set.player, chatId: chatIdOf(entry.id), seed: entry.seed,
  ...(debugResponse !== undefined ? { debugResponse } : {}),
});

const promisedLine = (name: string, messageId: number, quote: string) => `[promised] ${name} | m=${messageId} | "${quote}"`;

const SWAPS: Array<[RegExp, string]> = [[/\bI'll\b/, 'I will'], [/\bI will\b/, "I'll"], [/\bpromise\b/, 'swear'], [/\bswear\b/, 'promise'], [/\bmy word\b/, 'my oath'], [/\bvow\b/, 'swear']];

export function paraphraseOf(quote: string, text: string): string {
  for (const [pattern, replacement] of SWAPS) {
    const candidate = quote.replace(pattern, replacement);
    if (candidate !== quote && !text.includes(candidate)) return candidate;
  }
  return `Truly, ${quote.charAt(0).toLowerCase()}${quote.slice(1)}`;
}

export function p1Reply(story: Story, entry: P1Case, mode: PlumbingMode): string {
  const named = nameIn(story);
  const gold = entry.gold.map((row) => promisedLine(named(row.promisee), row.messageId, mode === 'paraphrase' ? paraphraseOf(row.quote, entry.chat[row.messageId].text) : row.quote));
  const bait = mode === 'greedy' ? (entry.bait ?? []).map((row) => promisedLine(row.target, row.messageId, row.quote)) : [];
  return [...gold, ...bait, 'NO_DELTA'].join('\n');
}

export function p2Reply(entry: P2Case, ids: Record<string, string>, mode: PlumbingMode): string {
  if (!entry.event) return 'NO_DELTA';
  const event = entry.event;
  const line = (key: string) => `[${event.kind}] ${ids[key] ?? key} | m=${event.messageId} | "${mode === 'paraphrase' ? paraphraseOf(event.quote, entry.chat[event.messageId].text) : event.quote}"`;
  const others = mode === 'greedy' ? entry.seed.map((seed) => seed.key).filter((key) => key !== event.key) : [];
  return [line(event.key), ...others.map(line), 'NO_DELTA'].join('\n');
}

export function offlineSeed(kit: PromiseKit, story: Story, set: P2Set, entry: P2Case) {
  return kit.seedPromises(entry.seed, contextOf(kit, story, entry.chat, set.player, entry.id));
}

const linesOf = (reply: string) => reply.split('\n').map((line) => line.trim()).filter((line) => /^\[(promised|kept|broken|renegotiated|released)\]/i.test(line));

export function replayP1(kit: PromiseKit, story: Story, set: P1Set, mode: PlumbingMode): Records {
  const cases: CaseRecord[] = set.cases.map((entry) => {
    const ctx = contextOf(kit, story, entry.chat, set.player, entry.id);
    const reply = p1Reply(story, entry, mode);
    return { id: entry.id, read: { ...kit.applyReadLines({ rows: [] }, linesOf(reply), ctx, { from: 0, to: entry.chat.length - 1 }), rawResponse: reply } };
  });
  return { format: RECORDS_FORMAT, set: 'p1', arm: `offline-${mode}`, plumbing: mode, synthetic: true, cases };
}

export function replayP2(kit: PromiseKit, story: Story, set: P2Set, mode: PlumbingMode): Records {
  const cases: CaseRecord[] = set.cases.map((entry) => {
    const ctx = contextOf(kit, story, entry.chat, set.player, entry.id);
    const seeded = kit.seedPromises(entry.seed, ctx);
    const reply = p2Reply(entry, seeded.ids, mode);
    const read = kit.applyReadLines(seeded.state, linesOf(reply), ctx, { from: entry.read[0], to: entry.read[1] }, seeded.ids);
    return { id: entry.id, read: { ...read, seeded: seeded.ids, seedRefused: seeded.refused, rawResponse: reply } };
  });
  return { format: RECORDS_FORMAT, set: 'p2', arm: `offline-${mode}`, plumbing: mode, synthetic: true, cases };
}

export type LiveRead = CaseRead & { prompt: string; rawResponse: string; inputTokens: number; outputTokens: number; promiseLines: string[]; calls: unknown[] };

export function caseRecord(id: string, live: LiveRead, expectedIds?: Record<string, string>): CaseRecord & { prompt: string; inputTokens: number; outputTokens: number; calls: unknown[]; idParity?: boolean } {
  const parity = expectedIds ? JSON.stringify(expectedIds) === JSON.stringify(live.seeded ?? {}) : undefined;
  return {
    id, prompt: live.prompt, inputTokens: live.inputTokens, outputTokens: live.outputTokens, calls: live.calls,
    read: { rows: live.rows, events: live.events, lines: live.lines, seeded: live.seeded, seedRefused: live.seedRefused, rawResponse: live.rawResponse },
    ...(parity === undefined ? {} : { idParity: parity }),
  };
}

export const quoteIsExact = (chat: readonly ChatMessage[], messageId: number, quote: string) => Boolean(chat[messageId]) && exactIn(chat[messageId].text, quote);
