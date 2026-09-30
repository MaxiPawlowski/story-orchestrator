import { fileURLToPath } from 'node:url';
import { evaluateInST } from './lib/evaluate.mts';
import { writeJSON, writeScreenshot } from './lib/output.mts';
import { runCli, hasHelpFlag, stripCommonArgs } from './lib/cli.mts';

async function waitForChatChange(page, previousChatId, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const current = await evaluateInST(page, () => ({
      groupId: SillyTavern.getContext().groupId,
      chatId: SillyTavern.getContext().chatId,
    }));
    if (current.groupId && current.chatId && current.chatId !== previousChatId) {
      return current;
    }
    await page.waitForTimeout(400);
  }
  throw new Error(`Timed out waiting for chat change from ${previousChatId}.`);
}

export async function getWelcomeRecentChats(page) {
  return evaluateInST(page, () => {
    return Array.from(document.querySelectorAll<HTMLElement>('.recentChat')).map((el, index) => ({
      index,
      visible: el.offsetParent !== null,
      hidden: el.classList.contains('hidden'),
      isGroup: el.classList.contains('group'),
      groupId: el.getAttribute('data-group') || null,
      avatarId: el.getAttribute('data-avatar') || null,
      fileName: el.getAttribute('data-file') || null,
      title: el.querySelector('.recentChatName')?.textContent?.trim()
        || el.textContent?.trim().slice(0, 120)
        || '',
    }));
  });
}

export async function closeUnpinnedDrawers(page) {
  return evaluateInST(page, () => {
    const drawers = Array.from(document.querySelectorAll<HTMLElement>('#top-settings-holder .openDrawer:not(.pinnedOpen)'));
    for (const drawer of drawers) drawer.classList.replace('openDrawer', 'closedDrawer');
    const icons = Array.from(document.querySelectorAll<HTMLElement>('#top-settings-holder .openIcon:not(.drawerPinnedOpen)'));
    for (const icon of icons) icon.classList.replace('openIcon', 'closedIcon');
    return { closedDrawers: drawers.length };
  });
}

export async function ensureWelcomeRecentChatsVisible(page) {
  await closeUnpinnedDrawers(page);
  const welcomePanel = page.locator('.welcomePanel');
  if (!(await welcomePanel.count())) {
    await page.locator('#options_button').click();
    await page.waitForTimeout(300);
    await page.locator('#options #option_close_chat').last().click();
    await page.waitForTimeout(1200);
  }

  if (!(await welcomePanel.count())) {
    throw new Error('Welcome screen not found.');
  }

  const hidden = await evaluateInST(page, () => {
    return document.querySelector('.welcomePanel')?.classList.contains('recentHidden') ?? false;
  });

  if (hidden) {
    await page.locator('.welcomePanel .showRecentChats').click();
    await page.waitForTimeout(300);
  }
}

export async function openMostRecentGroupChat(page) {
  await ensureWelcomeRecentChatsVisible(page);
  const recentChats = await getWelcomeRecentChats(page);
  const firstRecentGroup = recentChats.find(chat => !chat.hidden && chat.isGroup && chat.groupId && chat.fileName);

  if (!firstRecentGroup) {
    throw new Error('No recent group chat found on the welcome screen.');
  }

  const before = await evaluateInST(page, () => ({
    groupId: SillyTavern.getContext().groupId,
    chatId: SillyTavern.getContext().chatId,
  }));

  await closeUnpinnedDrawers(page);
  await page.locator('.recentChat.group:not(.hidden)').first().click();

  await page.waitForFunction(
    ({ prevGroupId, prevChatId }) => {
      const ctx = SillyTavern.getContext();
      return !!ctx.groupId && (ctx.groupId !== prevGroupId || ctx.chatId !== prevChatId);
    },
    { prevGroupId: before.groupId, prevChatId: before.chatId },
    { timeout: 15000 },
  );

  const after = await evaluateInST(page, () => ({
    groupId: SillyTavern.getContext().groupId,
    chatId: SillyTavern.getContext().chatId,
    name1: SillyTavern.getContext().name1,
    name2: SillyTavern.getContext().name2,
    chatLength: SillyTavern.getContext().chat?.length ?? 0,
  }));

  return {
    opened: firstRecentGroup,
    before,
    after,
  };
}

export async function startNewGroupSession(page) {
  const before = await evaluateInST(page, () => ({
    groupId: SillyTavern.getContext().groupId,
    chatId: SillyTavern.getContext().chatId,
    chatLength: SillyTavern.getContext().chat?.length ?? 0,
  }));

  if (!before.groupId) {
    throw new Error('No active group chat. Open a group chat before starting a new group session.');
  }

  await evaluateInST(page, async () => {
    const ctx = SillyTavern.getContext();
    await ctx.executeSlashCommandsWithOptions('/newchat');
  });

  await waitForChatChange(page, before.chatId, 15000);

  const after = await evaluateInST(page, () => ({
    groupId: SillyTavern.getContext().groupId,
    chatId: SillyTavern.getContext().chatId,
    chatLength: SillyTavern.getContext().chat?.length ?? 0,
    chatMetadata: SillyTavern.getContext().chatMetadata ?? {},
  }));

  return { before, after };
}

// A sandbox run may only stand on, and only ever delete, chats that did not exist when it started.
// The debug browser is shared between sessions, so the open chat can change under a run: on
// 2026-09-19 another session switched the page to a real group chat mid-scenario, the steps wrote
// into it, and cleanup's /delchat deleted it.
export async function readActiveChat(page) {
  return evaluateInST(page, () => {
    const ctx = SillyTavern.getContext();
    const group = (ctx.groups ?? []).find((entry) => entry.id === ctx.groupId);
    return { groupId: ctx.groupId ?? null, chatId: ctx.chatId ?? null, groupChats: group ? [...group.chats] : [], groupChatsKnown: Boolean(group) };
  });
}

// S6: the guard's `preexisting` list decides which chats a run may adopt and delete. A group the page
// has not resolved yet reads as NO chats, which would make every chat of the group look new — so the
// list comes from the server instead, and a run that cannot read it does not start.
async function readGroupChatsFromServer(page, groupId: string): Promise<string[] | null> {
  return evaluateInST(page, async (id) => {
    const ctx = SillyTavern.getContext();
    const response = await fetch('/api/groups/all', { method: 'POST', headers: ctx.getRequestHeaders(), body: '{}' });
    if (!response.ok) return null;
    const group = (await response.json()).find((entry) => entry.id === id);
    return Array.isArray(group?.chats) ? [...group.chats] : null;
  }, groupId);
}

// V20e: a condition, not a sleep. The page has settled when the open chat has not changed for
// `quietMs` and no generation is running. Replaces a fixed 3 s pause before the new-chat retry.
export async function waitForSettledChat(page, { quietMs = 1000, timeoutMs = 15000, pollMs = 250 } = {}) {
  const started = Date.now();
  let last: string | null | undefined;
  let stableSince = Date.now();
  while (Date.now() - started < timeoutMs) {
    const now = await evaluateInST(page, () => ({ chatId: SillyTavern.getContext().chatId ?? null, generating: document.body.dataset.generating === 'true' }));
    const key = `${now.chatId}|${now.generating}`;
    if (key !== last) { last = key; stableSince = Date.now(); }
    else if (!now.generating && Date.now() - stableSince >= quietMs) return { chatId: now.chatId, waitedMs: Date.now() - started };
    await page.waitForTimeout(pollMs);
  }
  throw new Error(`the open chat did not settle within ${timeoutMs} ms (last seen: ${last})`);
}

export async function beginSandboxSession(page) {
  const before = await readActiveChat(page);
  if (!before.groupId) throw new Error('No active group chat. Open a group chat before starting a sandbox.');
  if (!before.groupChatsKnown) {
    const chats = await readGroupChatsFromServer(page, before.groupId);
    if (!chats) throw new Error(`Sandbox not created: the chats of group ${before.groupId} could not be read, so the run could not tell its own chat from one that already existed.`);
    before.groupChats = chats;
  }
  // What the page was sitting on, and how big it is. A sandbox run must not touch it: if this chat
  // loses messages while the run is live, the run caused it (2026-09-21: a corpus loop ran a chat of
  // the user's down from 4 messages to an empty file, seen only because a header diff read the
  // chat's story as null afterwards).
  const onDisk = before.chatId ? await readChatOnDisk(page, before.chatId) : null;
  const session = await startNewGroupSession(page);
  const { groupId, chatId } = session.after;
  if (groupId !== before.groupId || !chatId || before.groupChats.includes(chatId)) {
    throw new Error(`Sandbox not created: expected a new chat in group ${before.groupId}, the page is on ${chatId ?? 'no chat'} in ${groupId ?? 'no group'}.`);
  }
  const guard = {
    groupId,
    sandboxChatId: chatId,
    owned: [chatId],
    preexisting: before.groupChats,
    preexistingOpen: onDisk ? { chatId: before.chatId, messages: onDisk.messages } : null,
    current: chatId,
    escaped: null,
    storyTitles: [] as string[],
    mirrorBooks: [] as Array<{ name: string; chatId: string }>,
    branchChats: [] as string[],
  };
  return { ...session, guard };
}

// A chat file's message count and size, read from the server rather than the page: the page cannot
// be trusted to still be on that chat, and the file is what the user would lose.
export async function readChatOnDisk(page, chatId: string) {
  return evaluateInST(page, async (id) => {
    const ctx = SillyTavern.getContext();
    const response = await fetch('/api/chats/group/get', { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify({ id }) });
    const data = await response.json().catch(() => null);
    const chat = Array.isArray(data) ? data[0] : data;
    return { messages: Array.isArray(chat) ? chat.length : null, keys: chat && typeof chat === 'object' ? Object.keys(chat).length : 0 };
  }, chatId);
}

export async function assertInSandbox(page, guard, where) {
  const now = await readActiveChat(page);
  const solo = !now.groupId && Boolean(now.chatId) && (guard.soloChats ?? []).some((entry) => entry.chatId === now.chatId);
  if ((now.groupId === guard.groupId && guard.owned.includes(now.chatId)) || solo) {
    guard.current = now.chatId;
    return now;
  }
  guard.escaped = now.chatId ?? '(no chat open)';
  const elsewhere = now.groupId && now.groupId !== guard.groupId ? ` in group ${now.groupId}` : '';
  throw new Error(`sandbox escaped ${where}: now on ${now.chatId ?? 'no chat'}${elsewhere}, sandbox is ${guard.sandboxChatId}; aborting before anything else writes to that chat`);
}

// Only a step that declares `adoptsNewChat` may move the run to another chat, and only to one it
// just created in the sandbox group.
export async function adoptNewSandboxChat(page, guard, chatsBeforeStep) {
  const now = await readActiveChat(page);
  const fresh = now.groupId === guard.groupId && now.chatId && !guard.owned.includes(now.chatId)
    && !guard.preexisting.includes(now.chatId) && !chatsBeforeStep.includes(now.chatId);
  if (fresh) guard.owned.push(now.chatId);
  return { adopted: fresh ? now.chatId : null, owned: [...guard.owned] };
}

// After a page reload ST sits on the welcome screen. Reopen the chat the run was on by id: the
// "most recent chat" on the welcome screen may belong to someone else by now. Opening before ST
// finishes starting up gets undone by its own init, so wait until APP_READY is recorded as fired.
// Do not listen for it: ST's emitter awaits each listener in turn and records the event only after
// the last one, so a listener added during that window is never called (lib/eventemitter.js).
export async function reopenSandboxChat(page, guard) {
  const target = guard.current ?? guard.sandboxChatId;
  await page.waitForFunction(() => {
    const ctx = SillyTavern.getContext();
    const fired = ctx.eventSource?.autoFireLastArgs;
    return fired instanceof Map ? fired.has(ctx.eventTypes.APP_READY) : Boolean(document.querySelector('.welcomePanel') || ctx.chatId);
  }, null, { timeout: 60000 });
  await evaluateInST(page, async ({ groupId, chatId }) => {
    const ctx = SillyTavern.getContext();
    if (ctx.groupId !== groupId) {
      const { openGroupById } = await import(/* webpackIgnore: true */ '/scripts/group-chats.js' as string) as { openGroupById: (id: string) => Promise<unknown> };
      await openGroupById(groupId);
    }
    if (SillyTavern.getContext().chatId !== chatId) await SillyTavern.getContext().openGroupChat(groupId, chatId);
    return true;
  }, { groupId: guard.groupId, chatId: target });
  const deadline = Date.now() + 20000;
  let openSince = 0;
  while (Date.now() < deadline) {
    const now = await readActiveChat(page);
    const onTarget = now.groupId === guard.groupId && now.chatId === target;
    if (onTarget && openSince && Date.now() - openSince >= 1000) return now;
    openSince = onTarget ? openSince || Date.now() : 0;
    await page.waitForTimeout(250);
  }
  return readActiveChat(page);
}

// Deletes the run's own chats by id, never the open chat unless the run owns it, and re-checks
// ownership inside the same evaluate that deletes.
export async function deleteSandboxChats(page, guard) {
  return evaluateInST(page, async ({ groupId, owned, preexisting }) => {
    const ctx = SillyTavern.getContext();
    const { groups, deleteGroupChat, editGroup } = await import(/* webpackIgnore: true */ '/scripts/group-chats.js' as string) as {
      groups: Array<{ id: string; chats: string[] }>;
      deleteGroupChat: (groupId: string, chatId: string, options?: { jumpToNewChat?: boolean }) => Promise<void>;
      editGroup: (id: string, immediately: boolean, reload?: boolean) => Promise<unknown>;
    };
    const currentChatAtCleanup = ctx.chatId ?? null;
    const currentGroupAtCleanup = ctx.groupId ?? null;
    const group = groups.find((entry) => entry.id === groupId);
    const deleted = [];
    const skipped = [];
    if (!group) return { sandboxChatId: owned[0], owned, deleted, skipped: owned.map((id) => ({ id, reason: 'group not found' })), currentChatAtCleanup };
    const isOpen = (id) => SillyTavern.getContext().groupId === groupId && SillyTavern.getContext().chatId === id;
    const ordered = [...owned].sort((a, b) => Number(isOpen(a)) - Number(isOpen(b)));
    // A chat save already in flight when the open chat is deleted lands after the delete and re-creates the file
    // (2026-09-25, P08 routing run 2: "Deleted file" then the file back 1 ms later with both messages). So no delete
    // starts until ST has not been saving a chat for a continuous quiet window.
    const script = await import(/* webpackIgnore: true */ '/script.js' as string) as { isChatSaving?: boolean };
    const settleStarted = Date.now();
    let quietSince = Date.now();
    while (Date.now() - settleStarted < 30000) {
      if (script.isChatSaving) quietSince = Date.now();
      else if (Date.now() - quietSince >= 1500) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const saveSettleMs = Date.now() - settleStarted;
    let jumped = false;
    for (const id of ordered) {
      if (preexisting.includes(id)) { skipped.push({ id, reason: 'existed before the run' }); continue; }
      if (!group.chats.includes(id)) { skipped.push({ id, reason: 'not listed in the group' }); continue; }
      const open = isOpen(id);
      await deleteGroupChat(groupId, id, { jumpToNewChat: open });
      jumped = jumped || open;
      deleted.push(id);
    }
    if (deleted.length && !jumped) await editGroup(groupId, true, false);
    const post = async (url: string, body: unknown = {}) => (await fetch(url, { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify(body) })).json();
    const gone = [];
    for (const id of deleted) {
      const data = await post('/api/chats/group/get', { id });
      if (!(Array.isArray(data) && data.length)) gone.push(id);
    }
    // ST saves a group through a 1 s debounce that captures the group OBJECT (group-chats.js:140). A run
    // that reloaded the groups (a card created mid-run calls getCharacters -> getGroups) leaves a pending
    // save holding the old object, which lands after this verification: the deleted chat is listed
    // again and `chat_id` points at it, so the next open of the group re-creates it with a greeting
    // (2026-09-23, V18: six sandbox chats resurrected that the cleanup had reported deleted). So the
    // debounce is waited out, the server read again, and a resurrection repaired on the live object.
    const serverGroup = async () => (await post('/api/groups/all')).find((entry) => entry.id === groupId) ?? null;
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const back = (group) => gone.filter((id) => (group?.chats ?? []).includes(id) || group?.chat_id === id);
    const resurrected = back(await serverGroup());
    if (resurrected.length) {
      const live = (await import(/* webpackIgnore: true */ '/scripts/group-chats.js' as string) as { groups: Array<{ id: string; chats: string[]; chat_id?: string }> }).groups.find((entry) => entry.id === groupId);
      if (live) {
        live.chats = live.chats.filter((id) => !resurrected.includes(id));
        if (live.chat_id && resurrected.includes(live.chat_id)) live.chat_id = SillyTavern.getContext().chatId ?? live.chats[live.chats.length - 1];
        await editGroup(groupId, true, false);
      }
    }
    const stillBack = back(await serverGroup());
    // A late save re-creates the FILE without listing it (the group no longer names the chat). Such a file is the
    // run's own chat, so it is deleted again and reported, never counted as deleted silently: the check above ran
    // before the late write could land.
    const fileExists = async (id: string) => { const data = await post('/api/chats/group/get', { id }); return Array.isArray(data) && data.length > 0; };
    const listedNow = (await serverGroup())?.chats ?? [];
    const lateFiles = [];
    for (const id of deleted) if (!listedNow.includes(id) && await fileExists(id)) lateFiles.push(id);
    const lateFileRepaired = [];
    for (const id of lateFiles) {
      await fetch('/api/chats/group/delete', { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify({ id }) });
      await new Promise((resolve) => setTimeout(resolve, 1500));
      if (!(await fileExists(id))) lateFileRepaired.push(id);
    }
    const finallyGone = [];
    for (const id of deleted) if (!stillBack.includes(id) && !(await fileExists(id))) finallyGone.push(id);
    return {
      sandboxChatId: owned[0],
      owned,
      deleted: finallyGone,
      notDeleted: deleted.filter((id) => !finallyGone.includes(id)),
      resurrected,
      lateFileRepaired,
      saveSettleMs,
      skipped,
      currentChatAtCleanup,
      currentGroupAtCleanup,
      chatAfterCleanup: SillyTavern.getContext().chatId ?? null,
    };
  }, { groupId: guard.groupId, owned: [...guard.owned], preexisting: [...guard.preexisting] });
}

export async function listEntities(page) {
  return evaluateInST(page, () => {
    const ctx = SillyTavern.getContext();
    const characters = (ctx.characters ?? []).map((character, index) => ({
      index,
      name: character?.name ?? null,
      avatar: character?.avatar ?? null,
    }));
    const byAvatar = new Map(characters.map((character) => [character.avatar, character.name]));
    const groups = (ctx.groups ?? []).map((group) => ({
      id: group.id,
      name: group.name,
      members: (group.members ?? []).map((avatar) => byAvatar.get(avatar) ?? avatar),
      disabled_members: group.disabled_members ?? [],
      chatCount: Array.isArray(group.chats) ? group.chats.length : 0,
    }));
    return { active: { groupId: ctx.groupId, characterId: ctx.characterId, chatId: ctx.chatId }, groups, characters };
  });
}

async function waitForEntity(page, kind, value, timeout = 15000) {
  await page.waitForFunction(
    ({ kind, value }) => {
      const ctx = SillyTavern.getContext();
      return kind === 'group' ? ctx.groupId === value : String(ctx.characterId) === String(value);
    },
    { kind, value },
    { timeout },
  );
  return evaluateInST(page, () => {
    const ctx = SillyTavern.getContext();
    return { groupId: ctx.groupId, characterId: ctx.characterId, chatId: ctx.chatId, chatLength: ctx.chat?.length ?? 0 };
  });
}

export async function openGroup(page, idOrName) {
  const clicked = await evaluateInST(page, async (needle) => {
    const ctx = SillyTavern.getContext();
    const search = String(needle).trim().toLowerCase();
    const group = (ctx.groups ?? []).find((candidate) => candidate.id === needle || (candidate.name ?? '').trim().toLowerCase() === search);
    if (!group) return { found: false, reason: `no group matching "${needle}"` };
    if (ctx.groupId === group.id) return { found: true, alreadyOpen: true, id: group.id, name: group.name };
    const block = Array.from(document.querySelectorAll<HTMLElement>('.group_select')).find((el) => (el.getAttribute('grid') || el.getAttribute('data-grid')) === group.id);
    if (block) {
      block.click();
      return { found: true, id: group.id, name: group.name };
    }
    const chats = await import(/* webpackIgnore: true */ '/scripts/group-chats.js' as string) as { openGroupById?: (id: string) => Promise<boolean> };
    if (typeof chats.openGroupById !== 'function') return { found: false, reason: `group "${group.name}" has no .group_select block in the DOM (the character list pages it out) and openGroupById is missing` };
    await chats.openGroupById(group.id);
    return { found: true, id: group.id, name: group.name, via: 'openGroupById' };
  }, idOrName);
  if (!clicked.found) throw new Error(clicked.reason);
  const state = clicked.alreadyOpen
    ? await evaluateInST(page, () => {
        const ctx = SillyTavern.getContext();
        return { groupId: ctx.groupId, characterId: ctx.characterId, chatId: ctx.chatId, chatLength: ctx.chat?.length ?? 0 };
      })
    : await waitForEntity(page, 'group', clicked.id);
  return { opened: clicked, state };
}

export async function openCharacter(page, nameOrAvatar) {
  const resolved = await evaluateInST(page, (needle) => {
    const ctx = SillyTavern.getContext();
    const search = String(needle).trim().toLowerCase();
    const index = (ctx.characters ?? []).findIndex((candidate) =>
      (candidate?.name ?? '').trim().toLowerCase() === search || (candidate?.avatar ?? '').toLowerCase() === search);
    if (index < 0) return { found: false, reason: `no character matching "${needle}"` };
    const character = ctx.characters[index];
    if (String(ctx.characterId) === String(index) && !ctx.groupId) return { found: true, alreadyOpen: true, index, name: character.name };
    return { found: true, index, name: character.name, avatar: character.avatar };
  }, nameOrAvatar);
  if (!resolved.found) throw new Error(resolved.reason);
  if (!resolved.alreadyOpen) {
    await evaluateInST(page, async (avatar) => {
      const ctx = SillyTavern.getContext();
      await ctx.executeSlashCommandsWithOptions(`/go ${avatar}`);
    }, resolved.avatar);
  }
  const state = resolved.alreadyOpen
    ? await evaluateInST(page, () => {
        const ctx = SillyTavern.getContext();
        return { groupId: ctx.groupId, characterId: ctx.characterId, chatId: ctx.chatId, chatLength: ctx.chat?.length ?? 0 };
      })
    : await waitForEntity(page, 'character', resolved.index);
  return { opened: resolved, state };
}

export async function listChats(page) {
  return evaluateInST(page, async () => {
    const ctx = SillyTavern.getContext();
    if (ctx.groupId) {
      const group = (ctx.groups ?? []).find((candidate) => candidate.id === ctx.groupId);
      return { entity: 'group', groupId: ctx.groupId, current: ctx.chatId, chats: group?.chats ?? [] };
    }
    if (ctx.characterId === undefined || ctx.characterId === null) return { entity: null, chats: [] };
    const character = ctx.characters?.[ctx.characterId];
    if (!character) return { entity: null, chats: [] };
    const response = await fetch('/api/characters/chats', {
      method: 'POST',
      headers: ctx.getRequestHeaders(),
      body: JSON.stringify({ avatar_url: character.avatar }),
    });
    const data = await response.json().catch(() => []);
    const chats = Array.isArray(data) ? data.map((entry) => entry.file_name?.replace(/\.jsonl$/i, '') ?? entry.file_name) : [];
    return { entity: 'character', characterId: ctx.characterId, name: character.name, current: ctx.chatId, chats };
  });
}

export async function openChat(page, chatId) {
  const before = await evaluateInST(page, () => ({
    groupId: SillyTavern.getContext().groupId,
    chatId: SillyTavern.getContext().chatId,
  }));
  if (before.chatId === chatId) return { before, after: before, alreadyOpen: true };
  await evaluateInST(page, async (id) => {
    const ctx = SillyTavern.getContext();
    if (ctx.groupId) await ctx.openGroupChat(ctx.groupId, id);
    else await ctx.openCharacterChat(String(id).replace(/\.jsonl$/i, ''));
  }, chatId);
  const after = await waitForNewChat(page, before.chatId, 15000);
  return { before, after };
}

export async function startNewChat(page) {
  const before = await evaluateInST(page, () => {
    const ctx = SillyTavern.getContext();
    return { groupId: ctx.groupId, characterId: ctx.characterId, chatId: ctx.chatId, chatLength: ctx.chat?.length ?? 0 };
  });
  if (!before.groupId && (before.characterId === undefined || before.characterId === null)) {
    throw new Error('No active group or character chat. Open one before starting a new chat.');
  }
  await evaluateInST(page, async () => {
    const ctx = SillyTavern.getContext();
    await ctx.executeSlashCommandsWithOptions('/newchat');
  });
  const changed = await waitForNewChat(page, before.chatId, 15000);
  const after = await evaluateInST(page, () => {
    const ctx = SillyTavern.getContext();
    return { groupId: ctx.groupId, characterId: ctx.characterId, chatId: ctx.chatId, chatLength: ctx.chat?.length ?? 0 };
  });
  return { before, changed, after };
}

async function waitForNewChat(page, previousChatId, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const current = await evaluateInST(page, () => ({ chatId: SillyTavern.getContext().chatId }));
    if (current.chatId && current.chatId !== previousChatId) return current;
    await page.waitForTimeout(400);
  }
  throw new Error(`Timed out waiting for chat change from ${previousChatId}.`);
}

const USAGE = `Usage: node st-navigation.mjs <action> [args] [--keep-open]

Actions:
  recent-group               Open the most recent group chat from the welcome screen UI
  new-group-session          Start a new session for the currently open group chat
  recent-group-new           Open the most recent group chat, then start a new session
  list-entities              List all groups (id, members, chat count) and characters (index, name, avatar)
  open-group <id|name>       Open a group by id or name
  open-character <name>      Open a character by name or avatar file
  list-chats                 List chat ids for the currently open group/character
  open-chat <chatId>         Open a specific chat of the current group/character
  new-chat                   Start a fresh chat for the current group/character (/newchat)`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const action = process.argv[2];
  const keepOpen = process.argv.includes('--keep-open');

  if (!action || hasHelpFlag()) {
    console.log(USAGE);
    process.exit(0);
  }

  runCli(async (page) => {
    await page.waitForTimeout(2000);

    let result;
    if (action === 'recent-group') {
      result = await openMostRecentGroupChat(page);
      console.log(JSON.stringify(result, null, 2));
      await writeJSON(result, 'st-navigation-recent-group');
      await writeScreenshot(page, 'st-navigation-recent-group');
    } else if (action === 'new-group-session') {
      result = await startNewGroupSession(page);
      console.log(JSON.stringify(result, null, 2));
      await writeJSON(result, 'st-navigation-new-group-session');
      await writeScreenshot(page, 'st-navigation-new-group-session');
    } else if (action === 'recent-group-new') {
      const opened = await openMostRecentGroupChat(page);
      const started = await startNewGroupSession(page);
      result = { opened, started };
      console.log(JSON.stringify(result, null, 2));
      await writeJSON(result, 'st-navigation-recent-group-new');
      await writeScreenshot(page, 'st-navigation-recent-group-new');
    } else if (action === 'list-entities') {
      result = await listEntities(page);
      console.log(JSON.stringify(result, null, 2));
      await writeJSON(result, 'st-navigation-list-entities');
    } else if (action === 'open-group') {
      const target = stripCommonArgs(process.argv.slice(3)).filter((arg) => arg !== '--keep-open').join(' ');
      if (!target) throw new Error('Usage: open-group <id|name>');
      result = await openGroup(page, target);
      console.log(JSON.stringify(result, null, 2));
      await writeJSON(result, 'st-navigation-open-group');
    } else if (action === 'open-character') {
      const target = stripCommonArgs(process.argv.slice(3)).filter((arg) => arg !== '--keep-open').join(' ');
      if (!target) throw new Error('Usage: open-character <name|avatar>');
      result = await openCharacter(page, target);
      console.log(JSON.stringify(result, null, 2));
      await writeJSON(result, 'st-navigation-open-character');
    } else if (action === 'list-chats') {
      result = await listChats(page);
      console.log(JSON.stringify(result, null, 2));
      await writeJSON(result, 'st-navigation-list-chats');
    } else if (action === 'open-chat') {
      const target = process.argv[3];
      if (!target) throw new Error('Usage: open-chat <chatId>');
      result = await openChat(page, target);
      console.log(JSON.stringify(result, null, 2));
      await writeJSON(result, 'st-navigation-open-chat');
    } else if (action === 'new-chat') {
      result = await startNewChat(page);
      console.log(JSON.stringify(result, null, 2));
      await writeJSON(result, 'st-navigation-new-chat');
    } else {
      console.error(`Unknown action: ${action}`);
      console.log(USAGE);
      return { ok: false };
    }

    if (keepOpen) {
      console.log('Browser left open. Ctrl+C to stop.');
      await new Promise(() => {});
    }
  }, { keepOpen });
}
