import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ResponseTiming } from './responseTiming.mjs';

for (const streaming of [false, true]) {
    test(`timing observation preserves ${streaming ? 'SSE' : 'JSON'} response bytes and retains no reply`, async () => {
        const timing = new ResponseTiming(streaming);
        const response = JSON.stringify({ content: 'café', timings: { predicted_n: 48, predicted_per_second: 30 } });
        const bytes = Buffer.from(streaming ? `data: ${response}\n\ndata: [DONE]\n\n` : response);
        const out = [];
        await pipeline(Readable.from([bytes.subarray(0, 20), bytes.subarray(20, 24), bytes.subarray(24)]), timing, new Writable({ write(chunk, encoding, done) { out.push(chunk); done(); } }));
        assert.deepEqual(Buffer.concat(out), bytes);
        assert.equal(timing.timings.predicted_per_second, 30);
        assert.equal(timing.buffer, '');
    });
}
