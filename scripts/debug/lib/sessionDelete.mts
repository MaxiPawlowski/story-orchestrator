import { evaluateInST } from './evaluate.mts';
import type { ChatExport } from './sessionExport.mts';
import { readOpenPopups, HANDLED_MARK } from './sessionPopups.mts';

export const BOOK_ANSWERS = ['keep', 'delete', 'escape'] as const;
export type BookAnswer = (typeof BOOK_ANSWERS)[number];

export interface DeleteTarget { chatId: string; group: string | null; groupId?: string | null }
export interface DeleteArgs { dir: string; chat: DeleteTarget; book: BookAnswer | null }

export interface DeleteDeps {
  exportChat: (page: any, dir: string, chatId: string) => Promise<ChatExport>;
  openChatId: (page: any) => Promise<string | null>;
  bookExists: (page: any, name: string) => Promise<boolean>;
  deleteOpenChat: (page: any) => Promise<{ ok: boolean; error?: string }>;
  answerReap: (page: any, chatId: string, answer: BookAnswer, timeoutMs: number) => Promise<{ prompt: string | null; others: string[] }>;
  chatOnDisk: (page: any, chatId: string) => Promise<boolean>;
  settle: (page: any, ms: number) => Promise<unknown>;
}

export const REAP_PROMPT = (chatId: string) => `The chat "${chatId}" was deleted`;

export async function deleteSessionChat(page: any, args: DeleteArgs, deps: DeleteDeps, { promptTimeoutMs = 20000, settleMs = 2500 } = {}) {
  const at = new Date().toISOString();
  const { chatId } = args.chat;
  const base = { kind: 'delete-chat' as const, at, chatId, group: args.chat.group, groupId: args.chat.groupId ?? null, book: args.book };
  const refuse = (problem: string, extra: Record<string, unknown> = {}) => ({ ...base, ...extra, ok: false, deleted: false, problems: [problem] });
  const open = await deps.openChatId(page);
  if (open !== chatId) return refuse(`${chatId} is not the open chat (open: ${String(open)}): nothing was exported or deleted`);
  const exported = await deps.exportChat(page, args.dir, chatId);
  if (exported.problem || !exported.files.length) return refuse(`the export before the delete failed (${exported.problem ?? 'no files'}): the chat was NOT deleted`, { exported });
  const bookName = exported.wiBook;
  const bookBefore = bookName ? await deps.bookExists(page, bookName) : false;
  if (bookBefore && !args.book) return refuse(`${chatId} has a story-memory lorebook (${bookName}): say how to answer the lorebook prompt with --book ${BOOK_ANSWERS.join('|')}; nothing was deleted`, { exported: exported.files });
  if (!bookBefore && args.book) return refuse(`${chatId} has no story-memory lorebook yet${bookName ? ` (${bookName} is not listed)` : ''}, so there is no prompt to answer with --book ${args.book}: play on until the mirror book exists; nothing was deleted`, { exported: exported.files });
  const deleted = await deps.deleteOpenChat(page);
  if (!deleted.ok) return refuse(`/delchat failed: ${deleted.error ?? 'unknown'}`, { exported: exported.files });
  const reap = bookBefore && args.book ? await deps.answerReap(page, chatId, args.book, promptTimeoutMs) : { prompt: null, others: [] as string[] };
  await deps.settle(page, settleMs);
  const stillOnDisk = await deps.chatOnDisk(page, chatId);
  const bookAfter = bookName && bookBefore ? await deps.bookExists(page, bookName) : null;
  const expectedAfter = args.book === 'delete' ? false : args.book ? true : null;
  const problems = [
    ...(stillOnDisk ? [`${chatId} is still on disk after /delchat (or came back after the group save)`] : []),
    ...(bookBefore && args.book && !reap.prompt ? [`no lorebook prompt named ${chatId} within ${promptTimeoutMs} ms`] : []),
    ...reap.others.map((text) => `an unexpected popup opened after the delete ("${text.slice(0, 200)}"); it was dismissed`),
  ];
  return {
    ...base, ok: problems.length === 0, deleted: !stillOnDisk, problems, exported: exported.files,
    lorebook: bookName ? { name: bookName, before: bookBefore, prompt: reap.prompt, answer: args.book, after: bookAfter, asAnswered: expectedAfter === null || bookAfter === expectedAfter } : null,
  };
}

export async function defaultDeleteDeps(): Promise<DeleteDeps> {
  const [{ exportOpenChat }, { WORLD_INFO_MODULE_URL }] = await Promise.all([import('./sessionExport.mts'), import('./lorebookDelete.mts')]);
  return {
    exportChat: exportOpenChat,
    openChatId: (page) => evaluateInST(page, () => (globalThis as any).SillyTavern.getContext().chatId ?? null),
    bookExists: (page, name) => evaluateInST(page, async ({ name, moduleUrl }: { name: string; moduleUrl: string }) => {
      const wi = await import(/* webpackIgnore: true */ moduleUrl) as { updateWorldInfoList: () => Promise<void> };
      await wi.updateWorldInfoList();
      return ((globalThis as any).SillyTavern.getContext().getWorldInfoNames?.() ?? []).includes(name);
    }, { name, moduleUrl: WORLD_INFO_MODULE_URL }),
    deleteOpenChat: (page) => evaluateInST(page, async () => {
      const ctx = (globalThis as any).SillyTavern.getContext();
      try {
        await ctx.executeSlashCommandsWithOptions('/delchat');
        return { ok: true };
      } catch (error: any) {
        return { ok: false, error: error?.message ?? String(error) };
      }
    }),
    answerReap: async (page, chatId, answer, timeoutMs) => {
      const deadline = Date.now() + timeoutMs;
      const others: string[] = [];
      while (Date.now() < deadline) {
        for (const popup of await readOpenPopups(page)) {
          if (popup.text.startsWith(REAP_PROMPT(chatId))) {
            if (answer === 'escape') {
              await evaluateInST(page, ({ index, mark }: { index: number; mark: string }) => document.querySelectorAll('dialog[open]')[index]?.setAttribute(mark, 'escape'), { index: popup.index, mark: HANDLED_MARK });
              await page.keyboard.press('Escape');
            } else {
              await evaluateInST(page, ({ index, selector, mark }: { index: number; selector: string; mark: string }) => {
                const dialog = document.querySelectorAll('dialog[open]')[index];
                dialog?.setAttribute(mark, selector);
                (dialog?.querySelector(selector) as HTMLElement | null)?.click();
              }, { index: popup.index, selector: answer === 'delete' ? '.popup-button-ok' : '.popup-button-cancel', mark: HANDLED_MARK });
            }
            return { prompt: popup.text, others };
          }
          others.push(popup.text);
          await evaluateInST(page, ({ index, mark }: { index: number; mark: string }) => {
            const dialog = document.querySelectorAll('dialog[open]')[index];
            dialog?.setAttribute(mark, 'dismissed');
            (dialog?.querySelector('.popup-button-cancel') as HTMLElement | null)?.click();
          }, { index: popup.index, mark: HANDLED_MARK });
        }
        await page.waitForTimeout(200);
      }
      return { prompt: null, others };
    },
    chatOnDisk: (page, chatId) => evaluateInST(page, async (id: string) => {
      const ctx = (globalThis as any).SillyTavern.getContext();
      const response = await fetch('/api/chats/group/get', { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify({ id }) });
      const data = await response.json().catch(() => null);
      return Array.isArray(data) && data.length > 0;
    }, chatId),
    settle: (page, ms) => page.waitForTimeout(ms),
  };
}
