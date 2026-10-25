export const PARK_PROMPT = 'Idle.'.padEnd(80, ' idle');
export const PROMPT_REUSE_DEFAULTS = Object.freeze({ minChars: 16000, minPrefixChars: 8000, minTailChars: 1200, history: 16, parkWhenIdle: true });

export function commonPrefix(a, b) {
    const limit = Math.min(a.length, b.length);
    let at = 0;
    while (at < limit && a.charCodeAt(at) === b.charCodeAt(at)) at += 1;
    return at;
}

export function promptReuseOptions(config = {}) {
    const raw = config.promptReuse;
    if (!raw || raw.enabled === false) return null;
    return { ...PROMPT_REUSE_DEFAULTS, ...(typeof raw === 'object' ? raw : {}) };
}

export const parkBody = () => ({ prompt: PARK_PROMPT, n_predict: 0, cache_prompt: true, stream: false });

export class PromptReuse {
    constructor(options = {}) {
        Object.assign(this, PROMPT_REUSE_DEFAULTS, options);
        this.recent = [];
        this.stats = { requests: 0, prefills: 0, prefillChars: 0, parks: 0 };
    }

    boundary(prompt) {
        if (typeof prompt !== 'string' || prompt.length < this.minChars) return null;
        let best = 0;
        for (const previous of this.recent) best = Math.max(best, commonPrefix(previous, prompt));
        const cut = prompt.lastIndexOf('\n', best - 1) + 1;
        return cut >= this.minPrefixChars && prompt.length - cut >= this.minTailChars ? cut : null;
    }

    prefill(body) {
        this.stats.requests += 1;
        const cut = this.boundary(body?.prompt);
        if (typeof body?.prompt === 'string' && body.prompt.length >= this.minChars) this.remember(body.prompt);
        if (cut === null) return null;
        this.stats.prefills += 1;
        this.stats.prefillChars += cut;
        return { prompt: body.prompt.slice(0, cut), n_predict: 0, cache_prompt: true, stream: false };
    }

    park(idle) {
        if (!this.parkWhenIdle || !idle) return null;
        this.stats.parks += 1;
        return parkBody();
    }

    remember(prompt) {
        this.recent = [prompt, ...this.recent.filter((entry) => entry !== prompt)].slice(0, this.history);
    }

    status() { return { ...this.stats, remembered: this.recent.length }; }
}
