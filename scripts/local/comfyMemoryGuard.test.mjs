import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const python = spawnSync('python', ['--version'], { encoding: 'utf8' });
const skip = python.error || python.status !== 0 ? 'python is not on PATH; the Comfy host-cache seam cases need it (scripts/local/README.md)' : false;

test('the shipped Comfy host-cache seam refuses foreign work and releases only an idle local cache', { skip }, () => {
    const run = spawnSync('python', ['scripts/local/comfyMemoryGuard.test.py'], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr || run.error?.message);
    assert.match(run.stderr, /Ran [1-9][0-9]* tests/);
});
