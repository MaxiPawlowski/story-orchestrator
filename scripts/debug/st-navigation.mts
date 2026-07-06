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
  const clicked = await evaluateInST(page, (needle) => {
    const ctx = SillyTavern.getContext();
    const search = String(needle).trim().toLowerCase();
    const group = (ctx.groups ?? []).find((candidate) => candidate.id === needle || (candidate.name ?? '').trim().toLowerCase() === search);
    if (!group) return { found: false, reason: `no group matching "${needle}"` };
    if (ctx.groupId === group.id) return { found: true, alreadyOpen: true, id: group.id, name: group.name };
    const block = Array.from(document.querySelectorAll<HTMLElement>('.group_select')).find((el) => (el.getAttribute('grid') || el.getAttribute('data-grid')) === group.id);
    if (!block) return { found: false, reason: `group "${group.name}" has no .group_select block in the DOM` };
    block.click();
    return { found: true, id: group.id, name: group.name };
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
