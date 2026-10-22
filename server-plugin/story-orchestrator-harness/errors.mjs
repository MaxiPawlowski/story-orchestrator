export const AUTH_TEXT = /not logged in|please run \/login|\b401\b|unauthori[sz]ed|authentication[ _](?:failed|required|error)|failed to authenticate|not authenticated|invalid (api key|token)|oauth token|login required|403 forbidden/i;
export const QUOTA_TEXT = /usage limit|rate.?limit|\b429\b|quota|insufficient balance|(?:usage|rate) limit reached|too many requests/i;
export const CONTEXT_TEXT = /context (?:length|window|limit)|maximum context|prompt is too long|too many tokens|exceeds? (?:the )?(?:model'?s? )?(?:maximum )?context/i;
export const NETWORK_TEXT = /ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|certificate|self.signed|unable to verify|proxy|tls|socket hang up/i;

export function readRetryAt(text, now = Date.now()) {
    const match = /(?:try again|resets?|available again)\s+(?:at|on|after)\s+([^.\n)]+)/i.exec(text);
    if (!match) return null;
    const at = Date.parse(match[1].replace(/(\d)(st|nd|rd|th)\b/g, '$1').replace(/\s+\([^)]*\)/, '').trim());
    return Number.isFinite(at) && at > now ? at : null;
}
