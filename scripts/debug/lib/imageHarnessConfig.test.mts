import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { comfyCleared, harnessGaps, IMAGE_HARNESS_KEYS, imageHarnessPath, loadImageHarness, NotRunnableError, parseBox, requireIsolatedLane, sameUrl, validateImageHarness } from './imageHarnessConfig.mts';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const good = { allowComfy: true, editModels: { diffusion: 'd.safetensors', encoder: 'e.safetensors', vae: 'v.safetensors' }, backgroundRemoval: 'alpha', raterProfile: 'Rater', controllerUrl: 'http://127.0.0.1:9', localProfiles: { main: 'M', memory: 'R' } };

test('the lane image-harness config is a closed vocabulary', () => {
  assert.deepEqual(validateImageHarness(good), []);
  assert.deepEqual(validateImageHarness({}), []);
  assert.match(validateImageHarness({ editModel: {} }).join(), /unknown key "editModel"/);
  assert.match(validateImageHarness({ editModels: { diffusion: 'd' } }).join(), /editModels/);
  assert.match(validateImageHarness({ allowComfy: 'yes' }).join(), /allowComfy/);
  assert.match(validateImageHarness({ controllerUrl: 'ftp://x' }).join(), /controllerUrl/);
  assert.match(validateImageHarness({ localProfiles: { main: 'M' } }).join(), /localProfiles/);
  assert.match(validateImageHarness([]).join(), /expected an object/);
});

test('the shipped example names only known keys and carries no machine value', () => {
  const example = JSON.parse(readFileSync(join(ROOT, 'scripts/debug/image-harness.example.json'), 'utf8'));
  assert.deepEqual(Object.keys(example).filter((key) => !IMAGE_HARNESS_KEYS.has(key)), []);
  const text = JSON.stringify(example);
  assert.doesNotMatch(text, /\.safetensors|qwen|18888|8188|deepseek/i);
});

test('the config sits beside the lane debug dir unless SO_IMAGE_HARNESS names one', () => {
  assert.equal(imageHarnessPath({}, resolve('C:/lanes/3/debug'), ROOT), resolve('C:/lanes/3/image-harness.json'));
  assert.equal(imageHarnessPath({ SO_IMAGE_HARNESS: 'x/h.json' }, resolve('C:/lanes/3/debug'), ROOT), resolve(ROOT, 'x/h.json'));
});

test('a missing config is a not-runnable gap only when something is needed; a broken one always is', () => {
  const absent = loadImageHarness('C:/nowhere/image-harness.json', () => null);
  assert.deepEqual(harnessGaps(absent, []), []);
  assert.match(harnessGaps(absent, ['editModels']).join(), /needs the lane image-harness config at C:\/nowhere/);
  const broken = loadImageHarness('h.json', () => '{nope');
  assert.match(harnessGaps(broken, []).join(), /not JSON/);
  const partial = loadImageHarness('h.json', () => JSON.stringify({ raterProfile: 'Rater' }));
  assert.deepEqual(harnessGaps(partial, ['rater']), []);
  assert.deepEqual(harnessGaps(partial, ['rater', 'editModels', 'controller']), ['needs editModels in h.json', 'needs controllerUrl in h.json']);
  assert.deepEqual(harnessGaps(loadImageHarness('h.json', () => JSON.stringify(good)), ['editModels', 'backgroundRemoval', 'rater', 'controller', 'localProfiles']), []);
});

test('a lane reaches ComfyUI only when it says so', () => {
  assert.equal(comfyCleared({}, null), false);
  assert.equal(comfyCleared({}, { allowComfy: false }), false);
  assert.equal(comfyCleared({}, { allowComfy: true }), true);
  assert.equal(comfyCleared({ SO_ALLOW_COMFY: '1' }, null), true);
  assert.equal(comfyCleared({ SO_ALLOW_COMFY: 'true' }, null), false);
});

test('isolated lanes, URL comparison and face boxes', () => {
  assert.equal(requireIsolatedLane({ SO_LANE: '4' }, 'x'), 4);
  assert.throws(() => requireIsolatedLane({ SO_LANE: '0' }, 'x'), NotRunnableError);
  assert.throws(() => requireIsolatedLane({}, 'x'), /not-runnable: x runs on an isolated lane/);
  assert.equal(sameUrl('http://127.0.0.1:18080/', 'http://127.0.0.1:18080'), true);
  assert.equal(sameUrl('https://Pod-8080.proxy.runpod.net/', 'https://pod-8080.proxy.runpod.net'), true);
  assert.equal(sameUrl('http://127.0.0.1:18080', 'http://127.0.0.1:18888'), false);
  assert.equal(sameUrl(null, 'http://x'), false);
  assert.deepEqual(parseBox('221,11,320,320'), [221, 11, 320, 320]);
  assert.equal(parseBox(''), null);
  assert.throws(() => parseBox('1,2,3'), /x,y,width,height/);
});
