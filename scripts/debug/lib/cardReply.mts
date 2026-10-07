import { sendUserMessage } from '../st-actions.mts';
import { saveSettingsNow } from './settingsSave.mts';
import { closeUnpinnedDrawers } from '../st-navigation.mts';

export async function checkLocalCardReply(page) {
  if (await page.locator('#so-studio-modal[open]').count()) throw new Error('Close Studio before the local reply check; a modal would intercept Send.');
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
    const result = await sendUserMessage(page, 'For this portrait, describe the colour of your hair in one or two sentences while staying in character.',
      { idleTimeoutMs: 300000, expectReply: true });
    if (!result.replied) throw new Error('Local Artemis did not produce a non-empty reply.');
    return await page.evaluate(() => {
      const ctx = (globalThis as any).SillyTavern.getContext(), rt = (globalThis as any).storyOrchestratorRuntime;
      const requests = (globalThis as any).__soV27CardCapture.requests;
      const request = requests.find((body) => body.api_type === 'llamacpp' && body.api_server === 'http://127.0.0.1:18888');
      if (!request) throw new Error('The actual reply request did not use local Artemis through llama.cpp.');
      const prompt = JSON.stringify(request);
      if (!prompt.includes('Current public state (overrides the character card where they differ):') || !prompt.includes('hair: green')) {
        throw new Error('The applied public appearance did not reach the real local reply request.');
      }
      const snapshot = rt.getSnapshot();
      if (!snapshot.ledger.some((row) => row.entity === 'Belle' && row.field === 'hair' && row.value === 'green' && row.bound && row.cardWriter === 'authored')) {
        throw new Error('The author current-state mirror does not match the applied card field.');
      }
      const reply = ctx.chat.filter((row) => !row.is_user && !row.is_system).at(-1);
      return { localArtemis: true, overlayInRequest: true, authorMirror: true, replyLength: reply?.mes?.length ?? 0,
        mentionsGreen: /green/i.test(reply?.mes ?? ''), boundary: snapshot.boundary };
    });
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
