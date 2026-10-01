import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { evaluateInST } from './evaluate.mts';

type Page = Parameters<typeof evaluateInST>[0];

export interface DumpTarget {
  chatId: string;
  kind: 'group' | 'solo';
  groupId?: string;
  avatar?: string;
  name?: string;
}

export interface ChatBlobRead {
  chatId: string;
  kind: 'group' | 'solo';
  source: 'page' | 'disk' | null;
  blob: unknown;
  error?: string;
}

export interface StoryHistory {
  storyId: string;
  engineState: unknown;
  engineHistory: unknown;
  visitedPath: unknown;
  boundary: number | null;
}

export interface ChatHistory {
  chatId: string;
  kind: 'group' | 'solo';
  source: 'page' | 'disk' | null;
  blobChatId: string | null;
  selectedStoryId: string | null;
  stories: StoryHistory[];
  error?: string;
}

export interface EngineHistoryDump {
  kind: 'engine-history';
  label: string;
  capturedAt: string;
  chats: ChatHistory[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const engineHistoryFileName = (label: string) => `engine-history-${String(label).replace(/[^a-zA-Z0-9_.-]/g, '_')}.json`;

export function dumpTargets(guard: { groupId: string; owned: string[]; branchChats?: string[]; soloChats?: Array<{ chatId: string; avatar: string; name: string }> }): DumpTarget[] {
  const solo = new Map((guard.soloChats ?? []).map((entry) => [entry.chatId, entry]));
  const ids = [...new Set([...guard.owned, ...(guard.branchChats ?? [])])];
  return ids.map((chatId) => {
    const entry = solo.get(chatId);
    return entry ? { chatId, kind: 'solo', avatar: entry.avatar, name: entry.name } : { chatId, kind: 'group', groupId: guard.groupId };
  });
}

export function historyOf(read: ChatBlobRead): ChatHistory {
  const base = { chatId: read.chatId, kind: read.kind, source: read.source };
  if (read.error) return { ...base, blobChatId: null, selectedStoryId: null, stories: [], error: read.error };
  if (!isRecord(read.blob)) return { ...base, blobChatId: null, selectedStoryId: null, stories: [] };
  const blob = read.blob;
  const stories = isRecord(blob.stories) ? blob.stories : {};
  return {
    ...base,
    blobChatId: typeof blob.chatId === 'string' ? blob.chatId : null,
    selectedStoryId: typeof blob.selectedStoryId === 'string' ? blob.selectedStoryId : null,
    stories: Object.entries(stories).map(([storyId, record]) => {
      const entry = isRecord(record) ? record : {};
      const state = isRecord(entry.engineState) ? entry.engineState : null;
      return {
        storyId,
        engineState: entry.engineState ?? null,
        engineHistory: entry.engineHistory ?? null,
        visitedPath: state?.visitedPath ?? null,
        boundary: typeof state?.boundary === 'number' ? state.boundary : null,
      };
    }),
  };
}

export function engineHistoryProblems(chats: ChatHistory[], { playedStory }: { playedStory: boolean }): string[] {
  const problems: string[] = [];
  for (const chat of chats) {
    if (chat.error) problems.push(`${chat.chatId}: could not be read (${chat.error})`);
    if (chat.blobChatId && chat.blobChatId !== chat.chatId) problems.push(`${chat.chatId}: the blob is stamped for ${chat.blobChatId}`);
    for (const story of chat.stories) {
      if (!isRecord(story.engineState)) problems.push(`${chat.chatId}/${story.storyId}: no engineState`);
      if (!isRecord(story.engineHistory)) problems.push(`${chat.chatId}/${story.storyId}: no engineHistory`);
    }
  }
  if (playedStory && !chats.some((chat) => chat.stories.length > 0)) {
    problems.push(`the run imported a story and none of its ${chats.length} chat(s) holds engine state: the dump would be empty`);
  }
  return problems;
}

export async function readChatBlobs(page: Page, targets: DumpTarget[]): Promise<ChatBlobRead[]> {
  return evaluateInST(page, async (list: DumpTarget[]) => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const post = async (url: string, body: unknown) => {
      const response = await fetch(url, { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify(body) });
      if (!response.ok) throw new Error(`${url} answered ${response.status}`);
      return response.json();
    };
    const headerBlob = (rows: unknown) => {
      const first = Array.isArray(rows) ? rows[0] : null;
      return first && typeof first === 'object' && 'chat_metadata' in first ? (first as any).chat_metadata?.story_orchestrator ?? null : null;
    };
    const out = [];
    for (const target of list) {
      const now = (globalThis as any).SillyTavern.getContext();
      const open = target.kind === 'group' ? now.groupId === target.groupId && now.chatId === target.chatId : !now.groupId && now.chatId === target.chatId;
      try {
        if (open) {
          out.push({ chatId: target.chatId, kind: target.kind, source: 'page', blob: JSON.parse(JSON.stringify(now.chatMetadata?.story_orchestrator ?? null)) });
          continue;
        }
        const rows = target.kind === 'group'
          ? await post('/api/chats/group/get', { id: target.chatId })
          : await post('/api/chats/get', { ch_name: target.name, file_name: target.chatId, avatar_url: target.avatar });
        out.push({ chatId: target.chatId, kind: target.kind, source: 'disk', blob: headerBlob(rows) });
      } catch (error) {
        out.push({ chatId: target.chatId, kind: target.kind, source: null, blob: null, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return out;
  }, targets);
}

export interface DumpReport {
  file: string;
  path: string;
  chats: number;
  stories: number;
  error?: string;
}

export async function dumpEngineHistory(
  page: Page,
  guard: Parameters<typeof dumpTargets>[0] | null,
  { dir, label, playedStory, read = readChatBlobs, write = async (path: string, text: string) => { await mkdir(dir, { recursive: true }); await writeFile(path, text, 'utf-8'); }, now = () => new Date() }:
    { dir: string; label: string; playedStory: boolean; read?: typeof readChatBlobs; write?: (path: string, text: string) => Promise<void>; now?: () => Date },
): Promise<DumpReport | { error: string }> {
  if (!guard) return { error: 'no sandbox guard: the run owns no chat whose engine history could be dumped' };
  const file = engineHistoryFileName(label);
  const path = resolve(dir, file);
  let chats: ChatHistory[];
  try {
    chats = (await read(page, dumpTargets(guard))).map(historyOf);
  } catch (error) {
    return { error: `engine history could not be read: ${error instanceof Error ? error.message : String(error)}` };
  }
  const dump: EngineHistoryDump = { kind: 'engine-history', label, capturedAt: now().toISOString(), chats };
  try {
    await write(path, `${JSON.stringify(dump, null, 2)}\n`);
  } catch (error) {
    return { error: `engine history could not be written to ${path}: ${error instanceof Error ? error.message : String(error)}` };
  }
  const report: DumpReport = { file, path, chats: chats.length, stories: chats.reduce((sum, chat) => sum + chat.stories.length, 0) };
  const problems = engineHistoryProblems(chats, { playedStory });
  return problems.length ? { ...report, error: problems.join('; ') } : report;
}
