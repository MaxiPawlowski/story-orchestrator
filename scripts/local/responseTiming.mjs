import { Transform } from 'node:stream';

export class ResponseTiming extends Transform {
    constructor(streaming) {
        super();
        this.streaming = streaming;
        this.buffer = '';
        this.timings = null;
        this.decoder = new TextDecoder();
    }

    readLine(line) {
        try {
            const data = JSON.parse(line.startsWith('data:') ? line.slice(5).trim() : line);
            if (data?.timings) this.timings = data.timings;
        } catch {}
    }

    _transform(chunk, encoding, done) {
        this.buffer += this.decoder.decode(chunk, { stream: true });
        if (this.streaming) {
            const lines = this.buffer.split('\n');
            this.buffer = lines.pop();
            for (const line of lines) this.readLine(line);
        }
        if (this.buffer.length > 1024 * 1024) this.buffer = '';
        done(null, chunk);
    }

    _flush(done) {
        this.buffer += this.decoder.decode();
        this.readLine(this.buffer);
        this.buffer = '';
        done();
    }
}
