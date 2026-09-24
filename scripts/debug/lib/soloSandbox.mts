// v2.4 plan 02 follow-ups (E2): a solo chat inside a group sandbox run. The solo path of the runtime
// (no active group) is its own code, and the sandbox was group-only, so a solo check had to be a
// separate script. `solo_chat: {character}` makes a NEW chat for that character and adds it to the
// run's ledger; `solo_chat: {leave: true}` returns to the group chat the run left. Cleanup returns
// to the group first, deletes each solo chat the run made, and never one that existed before.
import { evaluateInST } from './evaluate.mts';

type Page = Parameters<typeof evaluateInST>[0];

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export type SoloSpec = { character: string } | { leave: true };
export type SoloChat = { chatId: string; avatar: string; name: string };
export type SoloGuard = { groupId: string; owned: string[]; current?: string | null; soloChats?: SoloChat[]; soloReturn?: string | null; sandboxChatId: string };

export function soloSpec(value: unknown): SoloSpec {
  if (!isRecord(value)) throw new Error('solo_chat: expected {character: "<name>"} or {leave: true}');
  const keys = Object.keys(value);
  if (keys.length !== 1) throw new Error(`solo_chat: exactly one of "character" or "leave", got ${JSON.stringify(keys)}`);
  if ('leave' in value) {
    if (value.leave !== true) throw new Error('solo_chat.leave: expected true');
    return { leave: true };
  }
  if (typeof value.character !== 'string' || !value.character.trim()) throw new Error('solo_chat.character: expected a character name or avatar');
  return { character: value.character.trim() };
}

export const isSoloSandboxChat = (guard: { soloChats?: SoloChat[] }, groupId: string | null, chatId: string | null) =>
  !groupId && Boolean(chatId) && (guard.soloChats ?? []).some((entry) => entry.chatId === chatId);

export function withoutSoloChats<T extends { owned: string[]; soloChats?: SoloChat[] }>(guard: T): T {
  const solo = new Set((guard.soloChats ?? []).map((entry) => entry.chatId));
  return { ...guard, owned: guard.owned.filter((id) => !solo.has(id)) };
}

async function waitForChat(page: Page, predicate: (state: { groupId: string | null; chatId: string | null }) => boolean, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let state = { groupId: null as string | null, chatId: null as string | null };
  while (Date.now() < deadline) {
    state = await evaluateInST(page, () => {
      const ctx = (globalThis as any).SillyTavern.getContext();
      return { groupId: ctx.groupId ?? null, chatId: ctx.chatId ?? null };
    });
    if (predicate(state)) return state;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`solo_chat: timed out waiting for the chat to settle (now ${JSON.stringify(state)})`);
}

async function openSolo(page: Page, guard: SoloGuard, character: string) {
  const from = await evaluateInST(page, () => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    return { groupId: ctx.groupId ?? null, chatId: ctx.chatId ?? null };
  });
  if (from.groupId !== guard.groupId) throw new Error(`solo_chat: open it from the sandbox group, the page is on ${from.chatId ?? 'no chat'} in ${from.groupId ?? 'no group'}`);
  const target = await evaluateInST(page, async (needle: string) => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const search = needle.toLowerCase();
    const index = (ctx.characters ?? []).findIndex((entry: any) => (entry?.name ?? '').trim().toLowerCase() === search || (entry?.avatar ?? '').toLowerCase() === search);
    if (index < 0) return null;
    const character = ctx.characters[index];
    const response = await fetch('/api/characters/chats', { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify({ avatar_url: character.avatar }) });
    if (!response.ok) return { index, avatar: character.avatar, name: character.name, chats: null };
    const data = await response.json().catch(() => null);
    const list = Array.isArray(data) ? data : data && typeof data === 'object' ? Object.values(data) : [];
    return { index, avatar: character.avatar, name: character.name, chats: list.map((entry: any) => String(entry?.file_name ?? '').replace(/\.jsonl$/i, '')).filter(Boolean) };
  }, character);
  if (!target) throw new Error(`solo_chat: no character named "${character}" on this install`);
  if (!target.chats) throw new Error(`solo_chat: the chats of "${target.name}" could not be read, so the run could not tell its own chat from one that existed`);
  await evaluateInST(page, async (avatar: string) => {
    await (globalThis as any).SillyTavern.getContext().executeSlashCommandsWithOptions(`/go ${avatar}`);
  }, target.avatar);
  await waitForChat(page, (state) => !state.groupId);
  const opened = await evaluateInST(page, () => (globalThis as any).SillyTavern.getContext().chatId ?? null);
  await evaluateInST(page, async () => {
    await (globalThis as any).SillyTavern.getContext().executeSlashCommandsWithOptions('/newchat');
  });
  const now = await waitForChat(page, (state) => !state.groupId && Boolean(state.chatId) && state.chatId !== opened);
  if (!now.chatId || target.chats.includes(now.chatId)) throw new Error(`solo_chat: expected a new chat for "${target.name}", the page is on ${now.chatId ?? 'no chat'}`);
  guard.soloChats = guard.soloChats ?? [];
  guard.soloChats.push({ chatId: now.chatId, avatar: target.avatar, name: target.name });
  if (!guard.owned.includes(now.chatId)) guard.owned.push(now.chatId);
  guard.soloReturn = guard.soloReturn ?? from.chatId;
  guard.current = now.chatId;
  return { solo: now.chatId, character: target.name, returnTo: guard.soloReturn };
}

export async function returnToGroup(page: Page, guard: SoloGuard) {
  const target = guard.soloReturn ?? guard.sandboxChatId;
  await evaluateInST(page, async ({ groupId, chatId }: { groupId: string; chatId: string }) => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    if (ctx.groupId !== groupId) {
      const { openGroupById } = await import(/* webpackIgnore: true */ '/scripts/group-chats.js' as string) as { openGroupById: (id: string) => Promise<unknown> };
      await openGroupById(groupId);
    }
    const after = (globalThis as any).SillyTavern.getContext();
    if (after.chatId !== chatId) await after.openGroupChat(groupId, chatId);
    return true;
  }, { groupId: guard.groupId, chatId: target });
  const now = await waitForChat(page, (state) => state.groupId === guard.groupId && state.chatId === target);
  guard.current = now.chatId;
  return { returnedTo: now.chatId };
}

export async function soloChat(page: Page, value: unknown, guard: SoloGuard | null) {
  const spec = soloSpec(value);
  if (!guard) throw new Error('solo_chat needs --sandbox: the cleanup that deletes the solo chat is the sandbox cleanup');
  return 'leave' in spec ? returnToGroup(page, guard) : openSolo(page, guard, spec.character);
}

/** Runs first in cleanup: the group chats must still exist for the page to return to one. */
export async function cleanupSoloChats(page: Page, guard: SoloGuard) {
  const solos = [...(guard.soloChats ?? [])];
  if (!solos.length) return { deleted: [] as string[], leaked: [] as string[] };
  const now = await evaluateInST(page, () => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    return { groupId: ctx.groupId ?? null, chatId: ctx.chatId ?? null };
  });
  if (now.groupId !== guard.groupId) await returnToGroup(page, guard);
  const results = await evaluateInST(page, async (list: SoloChat[]) => {
    const ctx = (globalThis as any).SillyTavern.getContext();
    const { deleteCharacterChatByName } = await import(/* webpackIgnore: true */ '/script.js' as string) as { deleteCharacterChatByName: (id: number, name: string) => Promise<void> };
    const remaining = async (avatar: string) => {
      const response = await fetch('/api/characters/chats', { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify({ avatar_url: avatar }) });
      const data = await response.json().catch(() => []);
      const entries = Array.isArray(data) ? data : data && typeof data === 'object' ? Object.values(data) : [];
      return entries.map((entry: any) => String(entry?.file_name ?? '').replace(/\.jsonl$/i, ''));
    };
    const out: Array<{ chatId: string; gone: boolean; error?: string }> = [];
    for (const solo of list) {
      const current = (globalThis as any).SillyTavern.getContext();
      if (!current.groupId && current.chatId === solo.chatId) { out.push({ chatId: solo.chatId, gone: false, error: 'still open' }); continue; }
      const index = (current.characters ?? []).findIndex((entry: any) => entry?.avatar === solo.avatar);
      if (index < 0) { out.push({ chatId: solo.chatId, gone: false, error: `no character ${solo.avatar}` }); continue; }
      try {
        await deleteCharacterChatByName(index, solo.chatId);
      } catch (error) {
        out.push({ chatId: solo.chatId, gone: !(await remaining(solo.avatar)).includes(solo.chatId), error: error instanceof Error ? error.message : String(error) });
        continue;
      }
      out.push({ chatId: solo.chatId, gone: !(await remaining(solo.avatar)).includes(solo.chatId) });
    }
    return out;
  }, solos);
  return { deleted: results.filter((entry) => entry.gone).map((entry) => entry.chatId), leaked: results.filter((entry) => !entry.gone).map((entry) => entry.chatId), results };
}
