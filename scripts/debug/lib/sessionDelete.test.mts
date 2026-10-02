import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deleteSessionChat, type DeleteDeps } from './sessionDelete.mts';
import { fakePage } from './sessionFakes.mts';

const chat = { chatId: 'chat-one', group: 'Adolion - Between the Roads', groupId: 'g1' };
const BOOK = 'Story Orchestrator - Adolion Between the Roads - chat-one';

function world({ book = true, exportProblem = null as string | null } = {}) {
  const log: string[] = [];
  const state = { open: 'chat-one' as string | null, onDisk: true, book };
  const deps: DeleteDeps = {
    openChatId: async () => state.open,
    exportChat: async (_page, _dir, chatId) => {
      log.push(`export ${chatId} (on disk ${state.onDisk})`);
      return exportProblem ? { chatId, files: [], end: null, evidenceProblems: [], wiBook: BOOK, problem: exportProblem } : { chatId, files: [`runtime-${chatId}.json`, `chat-full-${chatId}.json`], end: null, evidenceProblems: [], wiBook: book ? BOOK : null, problem: null };
    },
    bookExists: async () => state.book,
    deleteOpenChat: async () => { log.push('delchat'); state.onDisk = false; state.open = 'other'; return { ok: true }; },
    answerReap: async (_page, chatId, answer) => { log.push(`reap ${answer}`); if (answer === 'delete') state.book = false; return { prompt: `The chat "${chatId}" was deleted, but its story-memory lorebook "${BOOK}" is still there.`, others: [] }; },
    chatOnDisk: async () => state.onDisk,
    settle: async () => undefined,
  };
  return { log, state, deps };
}

test('T4-3 delete-chat: the chat is exported in full BEFORE /delchat, and the lorebook prompt is answered the way the card asks', async () => {
  const keep = world();
  const kept: any = await deleteSessionChat(fakePage(), { dir: '.', chat, book: 'keep' }, keep.deps);
  assert.deepEqual(keep.log, ['export chat-one (on disk true)', 'delchat', 'reap keep']);
  assert.equal(kept.ok, true, kept.problems.join('; '));
  assert.deepEqual(kept.exported, ['runtime-chat-one.json', 'chat-full-chat-one.json']);
  assert.deepEqual({ ...kept.lorebook, prompt: undefined }, { name: BOOK, before: true, prompt: undefined, answer: 'keep', after: true, asAnswered: true });
  const drop = world();
  const dropped: any = await deleteSessionChat(fakePage(), { dir: '.', chat, book: 'delete' }, drop.deps);
  assert.equal(dropped.lorebook.after, false);
  assert.equal(dropped.lorebook.asAnswered, true);
});

test('T4-3 delete-chat: nothing is deleted when the export fails, when a book exists and no answer was given, or when there is no book to answer for', async () => {
  for (const [setup, book, needle] of [
    [{ exportProblem: 'reopening chat-one landed in other' }, 'keep', /export before the delete failed/],
    [{}, null, /--book keep\|delete\|escape/],
    [{ book: false }, 'delete', /no story-memory lorebook yet/],
  ] as const) {
    const case_ = world(setup);
    const record: any = await deleteSessionChat(fakePage(), { dir: '.', chat, book }, case_.deps);
    assert.equal(record.ok, false);
    assert.equal(record.deleted, false);
    assert.match(record.problems[0], needle);
    assert.ok(!case_.log.includes('delchat'), `${String(needle)}: /delchat must not run`);
    assert.equal(case_.state.onDisk, true);
  }
});
