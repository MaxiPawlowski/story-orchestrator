// v2.4 plan 01 (X8, rule 5): the over-steer probe. A one-turn steering block is only as good as the
// reply after it: a reply that restates the block, or names it, is the failure the community
// criticism of OOC nudges describes. The restate check gates; the swing against a control arm is
// recorded. Plans 06 and 07 reuse this with their own families.

export type OverSteerFamily = { name: string; metaTokens: string[] };

export const GUIDANCE_FAMILY: OverSteerFamily = { name: 'guidance', metaTokens: ['guidance', 'Scene direction', '[Story'] };

export const MAX_SHARED_SPAN = 6;

export const normaliseWords = (text: string): string[] => String(text ?? '').toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').split(/\s+/).filter(Boolean);

/** The length, in normalised words, of the longest run of consecutive words both texts share. */
export function longestSharedSpan(left: string, right: string): number {
  const a = normaliseWords(left);
  const b = normaliseWords(right);
  let best = 0;
  let previous = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    const current = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        current[j] = previous[j - 1] + 1;
        if (current[j] > best) best = current[j];
      }
    }
    previous = current;
  }
  return best;
}

export type RestateVerdict = { ok: boolean; span: number; maxSpan: number; metaHits: string[] };

export function restateCheck(block: string, reply: string, family: OverSteerFamily, maxSpan = MAX_SHARED_SPAN): RestateVerdict {
  const span = longestSharedSpan(block, reply);
  const lower = String(reply ?? '').toLowerCase();
  const metaHits = family.metaTokens.filter((token) => lower.includes(token.toLowerCase()));
  return { ok: span < maxSpan && metaHits.length === 0, span, maxSpan, metaHits };
}

/** Recorded, not gated: how far the steered reply moved from the control arm's reply. */
export function swing(reply: string, controlReply: string) {
  const words = normaliseWords(reply).length;
  const controlWords = normaliseWords(controlReply).length;
  return { words, controlWords, lengthRatio: controlWords ? Number((words / controlWords).toFixed(3)) : null, sharedWithControl: longestSharedSpan(reply, controlReply) };
}
