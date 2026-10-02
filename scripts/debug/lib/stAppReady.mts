export const APP_READY_TIMEOUT_MS = 120000;

export function appReadyFired(): boolean {
  const ctx = (globalThis as any).SillyTavern?.getContext?.();
  const fired = ctx?.eventSource?.autoFireLastArgs;
  return fired instanceof Map && Boolean(ctx?.eventTypes?.APP_READY) && fired.has(ctx.eventTypes.APP_READY);
}

export async function waitForAppReady(page: any, timeoutMs = APP_READY_TIMEOUT_MS): Promise<void> {
  try {
    await page.waitForFunction(appReadyFired, null, { timeout: timeoutMs });
  } catch (error) {
    throw new Error(`SillyTavern never reported APP_READY within ${timeoutMs} ms: its own start-up (getCharacters included) has not finished, so a character list read now can be empty. ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function cardListing(avatars: string[]): Promise<{ ready: boolean; missing: string[] }> {
  const ctx = (globalThis as any).SillyTavern.getContext();
  const fired = ctx.eventSource?.autoFireLastArgs;
  if (!(fired instanceof Map && fired.has(ctx.eventTypes?.APP_READY))) return { ready: false, missing: [...avatars] };
  await ctx.getCharacters();
  const have = new Set((ctx.characters ?? []).map((character: { avatar?: string }) => character?.avatar));
  return { ready: true, missing: avatars.filter((avatar) => !have.has(avatar)) };
}
