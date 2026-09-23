import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSettingsSave, saveSettingsNow } from './settingsSave.mts';

test('only the POST to /api/settings/save counts as the save', () => {
  assert.equal(isSettingsSave('http://127.0.0.1:8000/api/settings/save', 'POST'), true);
  assert.equal(isSettingsSave('/api/settings/save', 'POST'), true);
  assert.equal(isSettingsSave('http://127.0.0.1:8000/api/settings/get', 'POST'), false);
  assert.equal(isSettingsSave('http://127.0.0.1:8000/api/settings/save', 'GET'), false);
});

const fakePage = (response: { status: number } | null) => ({
  evaluate: async () => true,
  waitForResponse: async () => {
    if (!response) throw new Error('timeout');
    return { ok: () => response.status >= 200 && response.status < 300, status: () => response.status };
  },
});

test('a save is proven by the server answer, and a refused or missing answer fails (V20e)', async () => {
  assert.deepEqual(await saveSettingsNow(fakePage({ status: 200 }), 50), { status: 200 });
  await assert.rejects(saveSettingsNow(fakePage({ status: 500 }), 50), /answered 500; the settings were not written/);
  await assert.rejects(saveSettingsNow(fakePage(null), 50), /no \/api\/settings\/save answer within 50 ms/);
});
