import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editGraph, TURBO_SIGMAS } from './poseS0Graph.mts';
import { ARMS, armOf, packPrompt, PACK_VIEWS, rgbaPrompt, t2iGraph } from './poseS0Models.mts';

const models = ARMS.turbo.models;
const base = { models, steps: 8, seed: 7, reference: 'ref.png', instruction: 'x', resolution: 1024 };
const cut = { node: 'BiRefNetRMBG', model: 'BiRefNet_toonout' };

test('every arm has its own recipe id and the Turbo schedule is the saved eight steps ending at zero', () => {
    const ids = Object.values(ARMS).map((arm) => arm.recipe);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(ARMS.turbo.steps, 8);
    assert.equal(TURBO_SIGMAS.length, 9);
    assert.equal(TURBO_SIGMAS[0], 1);
    assert.equal(TURBO_SIGMAS.at(-1), 0);
    assert.ok(TURBO_SIGMAS.every((value, at) => at === 0 || value < TURBO_SIGMAS[at - 1]));
    assert.throws(() => armOf('nope'), /unknown arm/);
    assert.equal(armOf(undefined).id, 'b');
});

test('a sigma schedule swaps the KSampler for SamplerCustom with ManualSigmas and euler', () => {
    const graph = editGraph({ ...base, sigmas: TURBO_SIGMAS }) as any;
    assert.equal(graph['7'].class_type, 'SamplerCustom');
    assert.equal(graph['7'].inputs.cfg, 1);
    assert.equal(graph['30'].inputs.sampler_name, 'euler');
    assert.equal(graph['31'].inputs.sigmas, '1, 0.978453, 0.95418, 0.926626, 0.89508, 0.845148, 0.704534, 0.414568, 0');
    assert.deepEqual(graph['8'].inputs.samples, ['7', 0]);
    const plain = editGraph({ ...base, steps: 25 }) as any;
    assert.equal(plain['7'].class_type, 'KSampler');
    assert.equal(plain['7'].inputs.steps, 25);
});

test('extra references continue after the skeleton or the second reference and feed the encoder', () => {
    const withSkeleton = editGraph({ ...base, skeleton: 's.png', references: ['a.png', 'b.png'] }) as any;
    assert.deepEqual(withSkeleton['6'].inputs['images.image_2'], ['12', 0]);
    assert.deepEqual(withSkeleton['6'].inputs['images.image_3'], ['20', 0]);
    assert.deepEqual(withSkeleton['6'].inputs['images.image_4'], ['21', 0]);
    assert.equal(withSkeleton['21'].inputs.image, 'b.png');
    const headEdit = editGraph({ ...base, references: ['a.png'] }) as any;
    assert.deepEqual(headEdit['6'].inputs['images.image_2'], ['20', 0]);
    assert.equal(headEdit['6'].inputs['images.image_3'], undefined);
});

test('a latent size replaces the encoder latent', () => {
    const graph = editGraph({ ...base, latent: { width: 1152, height: 768 } }) as any;
    assert.deepEqual(graph['7'].inputs.latent_image, ['40', 0]);
    assert.equal(graph['40'].inputs.width, 1152);
    const normal = editGraph(base) as any;
    assert.deepEqual(normal['7'].inputs.latent_image, ['6', 2]);
});

test('the 2.1 text to image graph keeps cfg 1 and the arm sampler, and a cutout is optional (native RGBA)', () => {
    const cutGraph = t2iGraph({ arm: ARMS.q21, prompt: 'p', seed: 1, width: 768, height: 1152, cutout: cut, prefix: 'x' }) as any;
    assert.equal(cutGraph['7'].inputs.steps, 40);
    assert.equal(cutGraph['9'].class_type, 'SplitImageWithAlpha');
    const native = t2iGraph({ arm: ARMS.turbo, prompt: 'p', seed: 1, width: 768, height: 1152, prefix: 'x' }) as any;
    assert.equal(native['7'].class_type, 'SamplerCustom');
    assert.equal(native['11'].class_type, 'SaveImage');
    assert.deepEqual(native['11'].inputs.images, ['8', 0]);
});

test('the 2512 graph uses true CFG with its own encoder, vae and flow shift', () => {
    const graph = t2iGraph({ arm: ARMS.q2512, prompt: 'p', seed: 1, width: 768, height: 1152, cutout: cut, prefix: 'x' }) as any;
    assert.equal(graph['1'].inputs.unet_name, 'qwen_image_2512_fp8_e4m3fn.safetensors');
    assert.equal(graph['3'].inputs.clip_name, 'qwen_2.5_vl_7b_fp8_scaled.safetensors');
    assert.equal(graph['4'].inputs.vae_name, 'qwen_image_vae.safetensors');
    assert.equal(graph['7'].inputs.cfg, 4);
    assert.equal(graph['7'].inputs.steps, 40);
    assert.equal(graph['2'].class_type, 'ModelSamplingAuraFlow');
    assert.equal(graph['12'].class_type, 'CLIPTextEncode');
});

test('a run variant changes the graph without changing the seed, so a second run is not an execution-cache replay', () => {
    const one = t2iGraph({ arm: ARMS.turbo, prompt: 'p', seed: 1, width: 8, height: 8, prefix: 'x' }) as any;
    const two = t2iGraph({ arm: ARMS.turbo, prompt: 'p', seed: 1, width: 8, height: 8, prefix: 'x', variant: 'r2' }) as any;
    assert.notEqual(one['5'].inputs.negative_prompt, two['5'].inputs.negative_prompt);
    assert.equal(one['7'].inputs.noise_seed, two['7'].inputs.noise_seed);
    const big1 = t2iGraph({ arm: ARMS.q2512, prompt: 'p', seed: 1, width: 8, height: 8, prefix: 'x' }) as any;
    const big2 = t2iGraph({ arm: ARMS.q2512, prompt: 'p', seed: 1, width: 8, height: 8, prefix: 'x', variant: 'r2' }) as any;
    assert.notEqual(big1['2'].inputs.shift, big2['2'].inputs.shift);
});

test('pack views: six, one neutral full body first, head views are 1024 square, prompts name the member and the view', () => {
    assert.equal(PACK_VIEWS.length, 6);
    assert.equal(PACK_VIEWS[0].id, 'neutral_full');
    assert.ok(PACK_VIEWS.filter((view) => view.head).every((view) => view.width === 1024 && view.height === 1024));
    assert.match(packPrompt('m1', PACK_VIEWS[2]), /red hair.*three-quarter view/);
    assert.match(rgbaPrompt('a cat.'), /^This is an RGBA image with transparency\. a cat\. The image has alpha channel/);
});
