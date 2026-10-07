import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OFFLINE_PORT, offlineProblems, offlineSettings } from './lib/laneModel.mts';

const install = () => ({
  textgenerationwebui_settings: { server_urls: { llamacpp: 'http://127.0.0.1:18888', generic: 'http://localhost:18888/' } },
  extension_settings: {
    disabledExtensions: ['tts'],
    connectionManager: { profiles: [{ name: 'local', 'api-url': 'http://127.0.0.1:18888' }, { name: 'pod', 'api-url': 'http://127.0.0.1:18080' }, { name: 'cloud', api: 'deepseek' }] },
    sd: { comfy_url: 'http://127.0.0.1:8188' },
    'story-orchestrator': { settings: { judge: { enabled: true }, image: { enabled: true, comfyUrl: 'http://127.0.0.1:8188' }, sprites: { enabled: true } } },
  },
  self: 'http://127.0.0.1:8101/',
  note: 'see https://example.com:8188/ and http://192.168.50.130:8000',
});

test('an offline lane names no loopback server but its own, and switches judge, images, sprites and Image Generation off', () => {
  const { next, rewired } = offlineSettings(install(), 8101);
  const text = JSON.stringify(next);
  assert.doesNotMatch(text, /:18888|:18080|:8188"/);
  assert.equal((next as any).extension_settings.connectionManager.profiles[0]['api-url'], `http://127.0.0.1:${OFFLINE_PORT}`);
  assert.equal((next as any).textgenerationwebui_settings.server_urls.generic, `http://127.0.0.1:${OFFLINE_PORT}/`);
  assert.equal((next as any).self, 'http://127.0.0.1:8101/', "the lane's own address is kept");
  assert.match((next as any).note, /example\.com:8188/, 'a non-loopback host is never rewritten');
  assert.match((next as any).note, /192\.168\.50\.130:8000/);
  assert.deepEqual(rewired, ['http://127.0.0.1:18080', 'http://127.0.0.1:18888', 'http://127.0.0.1:8188', 'http://localhost:18888']);
  const ours = (next as any).extension_settings['story-orchestrator'].settings;
  assert.equal(ours.judge.enabled, false);
  assert.equal(ours.image.enabled, false);
  assert.equal(ours.sprites.enabled, false);
  assert.deepEqual((next as any).extension_settings.disabledExtensions, ['tts', 'stable-diffusion']);
  assert.deepEqual(offlineProblems(next, 8101), []);
});

test('offlineProblems names every way a lane copy stops being offline (planted controls)', () => {
  assert.equal(offlineProblems(install(), 8101).length, 8);
  const { next } = offlineSettings(install(), 8101);
  const back = JSON.parse(JSON.stringify(next));
  back.extension_settings.connectionManager.profiles[0]['api-url'] = 'http://127.0.0.1:18888';
  assert.deepEqual(offlineProblems(back, 8101), ['settings.json still names http://127.0.0.1:18888']);
  const images = JSON.parse(JSON.stringify(next));
  images.extension_settings['story-orchestrator'].settings.image.enabled = true;
  assert.deepEqual(offlineProblems(images, 8101), ['image.enabled is not false']);
  const sd = JSON.parse(JSON.stringify(next));
  sd.extension_settings.disabledExtensions = [];
  assert.deepEqual(offlineProblems(sd, 8101), ['stable-diffusion is not disabled']);
  assert.throws(() => offlineSettings([], 8101), /not an object/);
});
