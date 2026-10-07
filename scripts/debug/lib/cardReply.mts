import { sendUserMessage } from '../st-actions.mts';
import { saveSettingsNow } from './settingsSave.mts';
import { closeUnpinnedDrawers } from '../st-navigation.mts';
import { normalizedServer, readActiveMain, requireTextCompletionMain } from './activeProfile.mts';

export async function checkLocalCardReply(page, spec: { character?: string; field?: string; value?: string } = {}) {
  const character = spec.character;
  const field = spec.field ?? 'hair';
  const value = spec.value ?? 'green';
  if (!character) throw new Error('card-reply-local needs "character": the roster member whose card field the story changed.');
  if (await page.locator('#so-studio-modal[open]').count()) throw new Error('Close Studio before the local reply check; a modal would intercept Send.');
  const main = await readActiveMain(page);
  const server = normalizedServer(requireTextCompletionMain(main, 'card-reply-local'));
  await closeUnpinnedDrawers(page);
  const saved = await page.evaluate(() => {
    const ctx = (globalThis as any).SillyTavern.getContext(), rt = (globalThis as any).storyOrchestratorRuntime;
    const saved = JSON.parse(JSON.stringify(rt.getGlobalSettings().sprites));
    const capture = { requests: [] as any[], listener: null as any };
    capture.listener = (body) => capture.requests.push(JSON.parse(JSON.stringify(body)));
    ctx.eventSource.on(ctx.eventTypes.GENERATE_AFTER_DATA, capture.listener);
    (globalThis as any).__soV27CardCapture = capture;
    (globalThis as any).storyOrchestratorSprites.updateSettings({ cardOverlay: true, onDemand: false });
    rt.touch();
    return saved;
  });
  try {
    const result = await sendUserMessage(page, `For this portrait, describe your ${field} in one or two sentences while staying in character.`,
      { idleTimeoutMs: 300000, expectReply: true });
    if (!result.replied) throw new Error('The main model did not produce a non-empty reply.');
    return await page.evaluate(({ server, character, field, value, profile }) => {
      const ctx = (globalThis as any).SillyTavern.getContext(), rt = (globalThis as any).storyOrchestratorRuntime;
      const requests = (globalThis as any).__soV27CardCapture.requests;
      const norm = (entry) => String(entry ?? '').trim().replace(/\/+$/, '').toLowerCase();
      const request = requests.find((body) => norm(body.api_server) === server);
      if (!request) throw new Error(`The reply request did not go to the active profile's server (${profile ?? 'no profile'}); saw ${JSON.stringify(requests.map((body) => body.api_server ?? null))}.`);
      const prompt = JSON.stringify(request);
      if (!prompt.includes('Current public state (overrides the character card where they differ):') || !prompt.includes(`${field}: ${value}`)) {
        throw new Error('The applied public appearance did not reach the real reply request.');
      }
      const snapshot = rt.getSnapshot();
      if (!snapshot.ledger.some((row) => row.entity === character && row.field === field && row.value === value && row.bound && row.cardWriter === 'authored')) {
        throw new Error('The author current-state mirror does not match the applied card field.');
      }
      const reply = ctx.chat.filter((row) => !row.is_user && !row.is_system).at(-1);
      return { profile, apiType: request.api_type ?? null, overlayInRequest: true, authorMirror: true, replyLength: reply?.mes?.length ?? 0,
        mentionsValue: new RegExp(value, 'i').test(reply?.mes ?? ''), boundary: snapshot.boundary };
    }, { server, character, field, value, profile: main.name });
  } finally {
    await page.evaluate((saved) => {
      const ctx = (globalThis as any).SillyTavern.getContext();
      const capture = (globalThis as any).__soV27CardCapture;
      if (capture) ctx.eventSource.removeListener(ctx.eventTypes.GENERATE_AFTER_DATA, capture.listener);
      delete (globalThis as any).__soV27CardCapture;
      ctx.extensionSettings['story-orchestrator'].settings.sprites = saved;
      (globalThis as any).storyOrchestratorRuntime.touch();
    }, saved);
    await saveSettingsNow(page);
  }
}
