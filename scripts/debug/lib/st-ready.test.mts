import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureSTReady } from './st-ready.mts';

const pageFor = (pageToken: string, currentToken: string) => ({
  waitForFunction: async (predicate: () => unknown) => {
    const previous = (globalThis as any).SillyTavern;
    (globalThis as any).SillyTavern = { getContext: () => ({ getRequestHeaders: () => ({ 'X-CSRF-Token': pageToken }), alpha: true }) };
    try { assert.ok(predicate()); } finally { (globalThis as any).SillyTavern = previous; }
  },
  evaluate: async (fn: () => unknown) => {
    const previousST = (globalThis as any).SillyTavern;
    const previousFetch = globalThis.fetch;
    (globalThis as any).SillyTavern = { getContext: () => ({ getRequestHeaders: () => ({ 'X-CSRF-Token': pageToken }), alpha: true }) };
    globalThis.fetch = (async () => ({ ok: true, json: async () => ({ token: currentToken }) })) as unknown as typeof fetch;
    try { return await fn(); } finally { (globalThis as any).SillyTavern = previousST; globalThis.fetch = previousFetch; }
  },
}) as any;

test('ensureSTReady accepts a page whose CSRF token still belongs to its session', async () => {
  await assert.doesNotReject(() => ensureSTReady(pageFor('same', 'same')));
});

test('ensureSTReady refuses a page that can read but can no longer POST', async () => {
  await assert.rejects(() => ensureSTReady(pageFor('old', 'new')), /CSRF token is stale/);
});
