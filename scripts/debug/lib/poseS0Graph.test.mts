import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { editGraph, editInstruction } from './poseS0Graph.mts';

const models = { diffusion: { name: 'd.safetensors' }, encoder: { name: 'e.safetensors' }, vae: { name: 'v.safetensors' } };
const base = { models, steps: 25, seed: 7, reference: 'ref.png', instruction: 'x', resolution: 1024 };

test('the S0 graph is the shipped recipe: instruction text and node wiring appear in recipes.ts', () => {
    const source = readFileSync('src/sprites/builder/recipes.ts', 'utf8').replace(/\r\n/g, '\n');
    for (const fragment of ['Same character as image 1. Preserve face, hair, outfit, proportions and art style. ', 'Take the body pose shown in image 2 when present: ',
        'Single full character, plain white background.', 'Same image, same character, same pose, head angle, framing, lighting and colours. Change only ',
        'Everything else stays identical. Plain white background.', 'text, watermark, different character, deformed face', '"images.image_2": ["12",',
        'sampler_name: "euler", scheduler: "simple"', 'type: "qwen_image"']) assert.ok(source.includes(fragment), fragment);
});

test('P2 reads the skeleton as image 2, P3 reads the character twice, a head edit reads one image', () => {
    const p2 = editGraph({ ...base, skeleton: 'skeleton.png' }) as any;
    assert.deepEqual(p2['6'].inputs['images.image_2'], ['12', 0]);
    assert.equal(p2['12'].inputs.image, 'skeleton.png');
    const p3 = editGraph({ ...base, secondReference: true }) as any;
    assert.deepEqual(p3['6'].inputs['images.image_2'], ['1', 0]);
    assert.equal(p3['12'], undefined);
    const head = editGraph(base) as any;
    assert.equal(head['6'].inputs['images.image_2'], undefined);
    assert.equal(head['9'].class_type, 'SaveImage');
});

test('a cutout replaces the plain save with split, matte and save', () => {
    const graph = editGraph({ ...base, cutout: { node: 'BiRefNetRMBG', model: 'BiRefNet_toonout' } }) as any;
    assert.equal(graph['9'].class_type, 'SplitImageWithAlpha');
    assert.equal(graph['10'].inputs.model, 'BiRefNet_toonout');
    assert.equal(graph['11'].class_type, 'SaveImage');
});

test('editInstruction states the pose text or the expression change', () => {
    assert.match(editInstruction('pose', 'sitting'), /image 2 when present: sitting\./);
    assert.match(editInstruction('expression', 'facial expression: happy'), /Change only facial expression: happy\./);
});
