// v2.4 plan 07 T25: the token-limit probe, verify-first. docs.typesafe.ai/models (2026-09-24) states
// the limit — 64k tokens per request, 32k for `state` plus the longest question — and says nothing
// about what happens past it. The probe answers that: does the API refuse, truncate in silence, or
// answer, and what does `usage.input_tokens` report. It also measures characters per token by
// language from the answers, because the guard must not be built on the ~4 chars/token guess.
//
// Every case stays under the plugin's own 140,000-character cap (index.mjs:10, :96), so it travels
// the real page -> plugin -> TypeSafe path. The over-limit cases use token-dense text for that reason.

export const DOCUMENTED_STATE_LIMIT = 32_768;
export const PLUGIN_MAX_REQUEST_CHARS = 140_000;
export const JEV_USD_PER_MTOK_INPUT = 0.042;

const EN = 'The lighthouse keeper walked the long stone stair each evening, counting the steps aloud while the gulls argued over the harbour and the ferry sounded twice before it left the quay. ';
const ES = 'La guardiana del faro subía cada tarde la larga escalera de piedra, contando los peldaños en voz alta mientras las gaviotas discutían sobre el puerto y el ferry sonaba dos veces antes de zarpar. ';

const dense = (chars: number): string => {
  let seed = 2026;
  let out = '';
  while (out.length < chars) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    out += `${seed.toString(36)} `;
  }
  return out.slice(0, chars);
};

const repeat = (paragraph: string, chars: number): string => {
  let out = '';
  for (let index = 1; out.length < chars; index += 1) out += `${index}. ${paragraph}`;
  return out.slice(0, chars);
};

export interface ProbeCase {
  id: string;
  lang: 'en' | 'es' | 'dense';
  /** What the case is built to reach, from the docs' framing; the API's own count is the measurement. */
  aimTokens: number;
  text: string;
}

export function limitProbeCases(): ProbeCase[] {
  return [
    { id: 'en-20k', lang: 'en', aimTokens: 20_000, text: repeat(EN, 80_000) },
    { id: 'en-30k', lang: 'en', aimTokens: 30_000, text: repeat(EN, 120_000) },
    { id: 'es-30k', lang: 'es', aimTokens: 30_000, text: repeat(ES, 105_000) },
    { id: 'dense-10k', lang: 'dense', aimTokens: 10_000, text: dense(25_000) },
    { id: 'dense-40k', lang: 'dense', aimTokens: 40_000, text: dense(100_000) },
    { id: 'dense-50k', lang: 'dense', aimTokens: 50_000, text: dense(130_000) },
  ];
}

export const probeRequest = (probe: ProbeCase) => ({
  state: { text: probe.text },
  questions: { lighthouse: { type: 'noul', instructions: 'Does `text` mention a lighthouse?' } },
});

export const requestChars = (probe: ProbeCase) => JSON.stringify(probeRequest(probe)).length;

export interface ProbeResult {
  id: string;
  lang: string;
  chars: number;
  http: number;
  inputTokens: number | null;
  answered: boolean;
  error?: string;
}

export type OverLimitBehaviour = 'refuses' | 'answers' | 'truncates' | 'mixed' | 'not-reached';

const UNDER = 0.9 * DOCUMENTED_STATE_LIMIT;

/**
 * Chars per token by language, measured only on answered cases clearly under the limit (a truncated
 * count would otherwise feed the ratio it is checked against), and what happened past the limit: a
 * case is past it when the API's count says so, or when its language's ratio projects it there.
 * Counted well short of that projection while answering is silent truncation.
 */
export function classifyProbe(results: ProbeResult[]) {
  const ratio: Record<string, number> = {};
  for (const lang of new Set(results.map((row) => row.lang))) {
    const under = results.filter((row) => row.lang === lang && row.answered && row.inputTokens && row.inputTokens <= UNDER);
    if (under.length) ratio[lang] = Number((under.reduce((sum, row) => sum + row.chars, 0) / under.reduce((sum, row) => sum + (row.inputTokens ?? 0), 0)).toFixed(3));
  }
  const estimate = (row: ProbeResult) => (ratio[row.lang] ? Math.round(row.chars / ratio[row.lang]) : null);
  const past = results.filter((row) => (row.inputTokens ?? 0) > DOCUMENTED_STATE_LIMIT || (estimate(row) ?? 0) > DOCUMENTED_STATE_LIMIT);
  const truncated = past.some((row) => row.answered && row.inputTokens !== null && estimate(row) !== null && row.inputTokens < 0.8 * (estimate(row) ?? 0));
  const behaviour: OverLimitBehaviour = !past.length
    ? 'not-reached'
    : truncated
      ? 'truncates'
      : past.every((row) => !row.answered)
        ? 'refuses'
        : past.every((row) => row.answered)
          ? 'answers'
          : 'mixed';
  const spentTokens = results.reduce((sum, row) => sum + (row.inputTokens ?? 0), 0);
  return { charsPerToken: ratio, pastLimit: past.map((row) => row.id), behaviour, spentTokens, spentUsd: Number(((spentTokens / 1_000_000) * JEV_USD_PER_MTOK_INPUT).toFixed(6)), conclusive: behaviour !== 'not-reached' && behaviour !== 'mixed' && ['en', 'es'].every((lang) => lang in ratio) };
}
