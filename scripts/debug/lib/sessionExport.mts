import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { evaluateInST } from './evaluate.mts';

export const mirrorBookName = (book: unknown): string | null => {
  const name = typeof book === 'string' ? book : (book as { name?: unknown } | null)?.name;
  return typeof name === 'string' && name ? name : null;
};

export interface ChatExport {
  chatId: string | null;
  files: string[];
  end: { chatId: string; events: number; messages: number; swipes: number; reasoning: number } | null;
  evidenceProblems: string[];
  wiBook: string | null;
  problem: string | null;
}

export async function exportOpenChat(page: any, dir: string, expected: string): Promise<ChatExport> {
  const [evidenceLib, reads, { renderMarkdown }] = await Promise.all([import('./sessionEvidence.mts'), import('./sessionPageReads.mts'), import('../so-journal.mts')]);
  const evidence = await evidenceLib.captureEvidence(page);
  const read = await evaluateInST(page, () => {
    const ctx = SillyTavern.getContext();
    const rt = (globalThis as any).storyOrchestratorRuntime;
    const snapshot = rt?.getSnapshot?.() ?? {};
    const group = (ctx.groups ?? []).find((candidate) => candidate.id === ctx.groupId);
    const members = (group?.members ?? []) as string[];
    return {
      chatId: ctx.chatId ?? null,
      wiBook: snapshot.memory?.wiBook ?? null,
      journal: { chatId: ctx.chatId ?? null, storyTitle: snapshot.storyTitle ?? null, activeCheckpoint: snapshot.activeCheckpointName ?? null, boundary: snapshot.boundary ?? 0, events: rt?.getSessionJournal?.() ?? [] },
      chat: (ctx.chat ?? []).map((message, id) => ({ id, name: String(message.name ?? ''), isUser: Boolean(message.is_user), text: String(message.mes ?? '') })),
      state: {
        storyId: snapshot.storyId ?? null, activeCheckpointId: snapshot.activeCheckpointId ?? null, boundary: snapshot.boundary ?? null,
        requirements: snapshot.requirements ?? null, blackboard: snapshot.blackboard ?? null, lastRollback: snapshot.lastRollback ?? null,
        epistemic: rt?.getEpistemic?.() ?? [],
        characters: (ctx.characters ?? []).map((character, index) => ({ index, name: String(character?.name ?? ''), avatar: String(character?.avatar ?? '') })).filter((character) => members.includes(character.avatar)),
        payloadEpoch: (globalThis as any).__soDebugPayloads?.epoch ?? null,
      },
    };
  });
  const refused = (problem: string): ChatExport => ({ chatId: read.chatId, files: [], end: null, evidenceProblems: [], wiBook: mirrorBookName(read.wiBook), problem });
  if (!read.chatId) return refused(`no chat open after reopening ${expected}`);
  if (read.chatId !== expected) return refused(`reopening ${expected} landed in ${read.chatId}`);
  const id = read.chatId as string;
  const files: string[] = [];
  await writeFile(resolve(dir, `runtime-${id}.json`), JSON.stringify(await reads.readRuntimeBlob(page), null, 1), 'utf-8');
  files.push(`runtime-${id}.json`);
  await writeFile(resolve(dir, `journal-${id}.json`), JSON.stringify(read.journal, null, 2), 'utf-8');
  await writeFile(resolve(dir, `journal-${id}.md`), renderMarkdown(read.journal), 'utf-8');
  await writeFile(resolve(dir, `chat-${id}.json`), JSON.stringify(read.chat, null, 1), 'utf-8');
  await writeFile(resolve(dir, `state-end-${id}.json`), JSON.stringify(read.state, null, 2), 'utf-8');
  const split = evidenceLib.splitEvidence(evidence);
  await writeFile(resolve(dir, `chat-full-${id}.json`), JSON.stringify(split.chatFull, null, 1), 'utf-8');
  await writeFile(resolve(dir, `snapshot-${id}.json`), JSON.stringify(split.snapshot, null, 1), 'utf-8');
  await writeFile(resolve(dir, `evidence-${id}.json`), JSON.stringify({ capturedAt: evidence.capturedAt, chatId: evidence.chatId, groupId: evidence.groupId, unread: evidence.unread, slices: split.slices }, null, 1), 'utf-8');
  files.push(...['journal', 'chat', 'chat-full', 'state-end', 'snapshot', 'evidence'].map((kind) => `${kind}-${id}.json`), `journal-${id}.md`);
  return {
    chatId: id, files, wiBook: mirrorBookName(read.wiBook), problem: null, evidenceProblems: evidenceLib.evidenceProblems(evidence),
    end: { chatId: id, events: read.journal.events.length, messages: read.chat.length, swipes: split.chatFull.reduce((total, message) => total + message.swipes.length, 0), reasoning: split.chatFull.filter((message) => message.reasoning).length },
  };
}
