export function firstDivergence(a, b) {
    const n = Math.min(a.length, b.length);
    let i = 0;
    while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i += 1;
    return i;
}

export class PrefixDivergence {
    constructor({ keys = 16, events = 20, log = () => {}, now = () => Date.now() } = {}) {
        Object.assign(this, { keyLimit: keys, eventLimit: events, log, now });
        this.last = new Map();
        this.events = [];
        this.stats = { compared: 0, extends: 0, belowCut: 0, aboveCut: 0 };
    }

    note(key, prompt, cut) {
        const previous = this.last.get(key);
        this.last.delete(key);
        this.last.set(key, prompt);
        if (this.last.size > this.keyLimit) this.last.delete(this.last.keys().next().value);
        if (previous === undefined) return null;
        const at = firstDivergence(previous, prompt);
        const verdict = at >= Math.min(previous.length, prompt.length) ? 'extends' : at >= cut ? 'below-cut' : 'above-cut';
        this.stats.compared += 1;
        this.stats[{ extends: 'extends', 'below-cut': 'belowCut', 'above-cut': 'aboveCut' }[verdict]] += 1;
        const event = { at: new Date(this.now()).toISOString(), key: key.slice(0, 12), divergence: at, cut, previousChars: previous.length, chars: prompt.length, verdict, lost: verdict === 'above-cut' ? cut - at : 0 };
        this.events.push(event);
        if (this.events.length > this.eventLimit) this.events.shift();
        this.log(`first divergence key ${event.key}: char ${at} of ${prompt.length} (previous ${previous.length}), cut ${cut}, ${verdict}${event.lost ? `, ${event.lost} cached chars lost` : ''}`);
        return event;
    }

    status() { return { ...this.stats, keys: this.last.size, last: this.events.slice(-5) }; }
}
