import test from 'node:test';
import assert from 'node:assert/strict';
import { savePrefixes, verifyPrefixes } from './storyWorkflowLi.mjs';

const entry = (number, prefix) => ({ prompt: [number, 'id', { 1: { class_type: 'KSampler', inputs: {} }, 7: { class_type: 'SaveImage', inputs: { filename_prefix: prefix } } }] });

test('prefixes come back in queue order whatever the history key order', () => {
    const history = { b: entry(5, 'SO_LI_B'), a: entry(4, 'SO_LI_A'), c: entry(6, 'SillyTavern/x') };
    assert.deepEqual(savePrefixes(history, ['b', 'a', 'c']), ['SO_LI_A', 'SO_LI_B', 'SillyTavern/x']);
});

test('the floors read the mapped workflows and the unmapped control', () => {
    assert.deepEqual(verifyPrefixes(['SO_LI_A', 'SO_LI_B', 'ST/x']), { threeRenders: true, sceneOnA: true, backgroundOnB: true, unmappedOnSelection: true });
    assert.equal(verifyPrefixes(['SO_LI_B', 'SO_LI_A', 'ST/x']).sceneOnA, false);
    assert.equal(verifyPrefixes(['SO_LI_A', 'SO_LI_B', 'SO_LI_A']).unmappedOnSelection, false);
    assert.equal(verifyPrefixes(['SO_LI_A']).threeRenders, false);
});
