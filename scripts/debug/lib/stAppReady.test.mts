import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appReadyFired, cardListing, waitForAppReady } from './stAppReady.mts';

const AVATARS = ['Forre.png', 'Alexander.png', 'Adolion Narrator.png'];
const tick = (ms: number) => new Promise((done) => setTimeout(done, ms));

function fakeSt() {
  const characters: Array<{ avatar: string }> = [];
  const autoFireLastArgs = new Map<string, unknown[]>();
  const ctx = {
    characters,
    eventTypes: { APP_READY: 'app_ready', APP_INITIALIZED: 'app_initialized' },
    eventSource: { autoFireLastArgs },
    getCharacters: async () => {
      characters.splice(0, characters.length);
      await tick(30);
      characters.push(...AVATARS.map((avatar) => ({ avatar })));
    },
  };
  (globalThis as any).SillyTavern = { getContext: () => ctx };
  return { ctx, ready: () => autoFireLastArgs.set('app_ready', []) };
}

const fakePage = () => ({
  evaluate: async (fn: (arg: any) => unknown, arg?: unknown) => fn(arg),
  waitForFunction: async (fn: () => boolean, _arg: unknown, { timeout }: { timeout: number }) => {
    const started = Date.now();
    while (!fn()) {
      if (Date.now() - started > timeout) throw new Error(`Timeout ${timeout}ms exceeded`);
      await tick(5);
    }
  },
});

test('T5-5-1 seed: before APP_READY the character list is not read as "cards missing", even while ST\'s own getCharacters has it empty', async () => {
  const st = fakeSt();
  const initLoad = st.ctx.getCharacters();
  assert.equal(st.ctx.characters.length, 0, 'ST\'s start-up getCharacters empties the list while it waits for the server');
  assert.equal(appReadyFired(), false);
  assert.deepEqual(await cardListing(AVATARS), { ready: false, missing: AVATARS });
  await initLoad;
  st.ready();
  assert.equal(appReadyFired(), true);
  assert.deepEqual(await cardListing(AVATARS), { ready: true, missing: [] });
  delete (globalThis as any).SillyTavern;
});

test('T5-5-1 seed: waitForAppReady resolves on ST\'s recorded APP_READY, and names it when start-up never finishes', async () => {
  const st = fakeSt();
  const page = fakePage();
  setTimeout(() => st.ready(), 40);
  const started = Date.now();
  await waitForAppReady(page, 2000);
  assert.ok(Date.now() - started >= 30, 'it waited for the event rather than returning at once');
  fakeSt();
  await assert.rejects(waitForAppReady(page, 50), /never reported APP_READY within 50 ms/);
  (globalThis as any).SillyTavern = { getContext: () => ({ eventTypes: { APP_READY: 'app_ready' }, eventSource: {} }) };
  assert.equal(appReadyFired(), false, 'an emitter without the recorded-events map is not ready');
  delete (globalThis as any).SillyTavern;
  assert.equal(appReadyFired(), false, 'no SillyTavern global reads not ready');
});

test('T5-5-1 seed: control, a card really missing after APP_READY is still reported', async () => {
  const st = fakeSt();
  st.ready();
  assert.deepEqual(await cardListing([...AVATARS, 'Natalia.png']), { ready: true, missing: ['Natalia.png'] });
  delete (globalThis as any).SillyTavern;
});
