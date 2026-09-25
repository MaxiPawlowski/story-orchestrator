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

// v2.4 plan 07: the warden's continuity note. The fact it carries is not a meta token; a consistent
// reply may name it, which the restate span measures against the control arm's reply to the same turn.
export const CONTINUITY_FAMILY: OverSteerFamily = { name: 'continuity', metaTokens: ['Continuity:', 'Keep the next reply consistent'] };

// v2.4 plan 07 T22/T23: the agency and house-rule notes. Their meta tokens are the note framing and the
// out-of-character words a reply uses when it answers the note instead of the scene; a house rule's own
// text rides the restate span, since the note quotes it verbatim.
export const AGENCY_FAMILY: OverSteerFamily = { name: 'agency', metaTokens: ['Agency:', 'House rule', 'OOC', 'the rules'] };

export const HOUSE_RULE_FAMILY: OverSteerFamily = { name: 'house-rule', metaTokens: ['House rule', 'keep the next reply within', 'OOC', 'the rules'] };

export const WARDEN_OVER_STEER_FAMILIES = ['continuity', 'agency', 'house-rule'];

export const OVER_STEER_FAMILIES: Record<string, OverSteerFamily> = { guidance: GUIDANCE_FAMILY, continuity: CONTINUITY_FAMILY, agency: AGENCY_FAMILY, 'house-rule': HOUSE_RULE_FAMILY };

/** `block` is the injected prompt key; `controlRun` is the control arm's reply N+1, literal or a page global holding it. */
export type OverSteerSpec = { block: string; family: string; controlRun?: string | { global: string }; record?: boolean };

export function overSteerSpec(value: unknown): OverSteerSpec {
  const spec = value as OverSteerSpec;
  if (!spec || typeof spec.block !== 'string' || !spec.block || typeof spec.family !== 'string') throw new Error('expect.overSteer: expected {block: "<injected prompt key>", family, controlRun?, record?}');
  if (spec.record !== undefined && typeof spec.record !== 'boolean') throw new Error('expect.overSteer: record is true (report the columns, never fail) or absent');
  if (!OVER_STEER_FAMILIES[spec.family]) throw new Error(`expect.overSteer: unknown family "${spec.family}" (known: ${Object.keys(OVER_STEER_FAMILIES).join(', ')})`);
  const control = spec.controlRun;
  if (control !== undefined && !(typeof control === 'string' && control) && !(typeof control === 'object' && control !== null && typeof control.global === 'string' && control.global)) {
    throw new Error('expect.overSteer: controlRun is the control reply text or {global: "<name>"}');
  }
  return { block: spec.block, family: spec.family, ...(control === undefined ? {} : { controlRun: control }), ...(spec.record ? { record: true } : {}) };
}

/** What the page offers: the block as the last generation carried it, as the next prompt holds it, reply N+1, and the control reply. */
export type OverSteerReading = { captured: string | null; current: string | null; reply: string | null; control: string | null };

export type OverSteerVerdict = {
  ok: boolean;
  failures: string[];
  block: { key: string; source: 'capture' | 'current' | null; chars: number };
  restate: RestateVerdict | null;
  swing: ReturnType<typeof swing> | null;
  recorded?: boolean;
};

export function overSteerVerdict(spec: OverSteerSpec, reading: OverSteerReading): OverSteerVerdict {
  const failures: string[] = [];
  const captured = reading.captured?.trim() ? reading.captured : null;
  const current = reading.current?.trim() ? reading.current : null;
  const text = captured ?? current;
  const block = { key: spec.block, source: captured ? 'capture' as const : current ? 'current' as const : null, chars: text?.length ?? 0 };
  const reply = reading.reply?.trim() ? reading.reply : null;
  if (!text) failures.push(`overSteer: block "${spec.block}" was never carried (no capture holds it and the next prompt does not), so there is nothing to measure`);
  if (!reply) failures.push('overSteer: no reply N+1 in the chat to measure');
  const restate = text && reply ? restateCheck(text, reply, OVER_STEER_FAMILIES[spec.family]) : null;
  if (restate && !restate.ok) failures.push(`overSteer: reply N+1 restates "${spec.block}" (shared span ${restate.span} of max ${restate.maxSpan - 1}${restate.metaHits.length ? `, meta tokens ${JSON.stringify(restate.metaHits)}` : ''})`);
  const control = reading.control?.trim() ? reading.control : null;
  if (spec.controlRun !== undefined && !control) failures.push('overSteer: a control arm was named but its reply is empty');
  return { ok: failures.length === 0, failures, block, restate, swing: reply && control ? swing(reply, control) : null };
}
