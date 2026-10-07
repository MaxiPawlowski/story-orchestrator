import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('the shipped Comfy native pool seam refuses foreign work and trims only an idle local pool', () => {
    const run = spawnSync('python', ['scripts/local/comfyMemoryGuard.test.py'], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr || run.error?.message);
    assert.match(run.stderr, /Ran [1-9][0-9]* tests/);
});
