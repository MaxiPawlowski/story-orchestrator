import { fileURLToPath } from 'node:url';
import { evaluateInST } from './lib/evaluate.mts';
import { writeJSON, writeScreenshot } from './lib/output.mts';
import { runCli, hasHelpFlag } from './lib/cli.mts';

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

export async function ensureWelcomeRecentChatsVisible(page) {
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

const USAGE = `Usage: node st-navigation.mjs <action> [--keep-open]

Actions:
  recent-group        Open the most recent group chat from the welcome screen UI
  new-group-session   Start a new session for the currently open group chat
  recent-group-new    Open the most recent group chat, then start a new session`;

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
