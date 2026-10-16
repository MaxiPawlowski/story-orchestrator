import type { AddVerdict } from "../audienceRules";
import { attributeSpan, type AttributionRefusal, type RecallSpeaker } from "./attribution";
import { recallVerdict, type RecallCandidate, type RecallEligibilityContext } from "./eligibility";
import { findMessage } from "./live";

export const RECALL_POOL_SIZE = 32;
export const RECALL_TOP_K = 4;
export const RECALL_TOKEN_CAP = 250;
export const RECALL_TOKEN_ESTIMATE = "ceil(chars / 4)";

export const recallTokens = (text: string): number => Math.ceil(text.length / 4);

export type RecallRank = (eligible: readonly RecallCandidate[]) => RecallCandidate[];

export const poolOrder: RecallRank = (eligible) => [...eligible];

export interface RecallLine {
  candidate: RecallCandidate;
  speaker: string;
  quote: string;
  line: string;
}

export type RecallRefusal =
  | { candidate: RecallCandidate; stage: "eligibility"; verdict: Extract<AddVerdict, { ok: false }> }
  | { candidate: RecallCandidate; stage: "attribution"; reason: AttributionRefusal };

export interface RecallSelection {
  lines: RecallLine[];
  block: string;
  tokens: number;
  considered: number;
  quotable: number;
  refused: RecallRefusal[];
}

export interface RecallSelectOptions {
  roster: readonly RecallSpeaker[];
  playerName: string;
  rank?: RecallRank;
}

export function selectRecall(pool: readonly RecallCandidate[], ctx: RecallEligibilityContext, options: RecallSelectOptions): RecallSelection {
  const considered = pool.slice(0, RECALL_POOL_SIZE);
  const refused: RecallRefusal[] = [];
  const quotable = new Map<RecallCandidate, RecallLine>();
  for (const candidate of considered) {
    const verdict = recallVerdict(candidate, ctx);
    if (!verdict.ok) {
      refused.push({ candidate, stage: "eligibility", verdict });
      continue;
    }
    const message = findMessage(ctx.chat, candidate.source.messageId);
    const attributed = attributeSpan({ source: candidate.source, messageText: message?.text ?? "", candidateText: candidate.text, roster: options.roster, playerName: options.playerName });
    if (attributed.ok) quotable.set(candidate, { candidate, speaker: attributed.speaker, quote: attributed.quote, line: attributed.line });
    else refused.push({ candidate, stage: "attribution", reason: attributed.reason });
  }
  const lines: RecallLine[] = [];
  for (const candidate of (options.rank ?? poolOrder)([...quotable.keys()])) {
    const line = quotable.get(candidate);
    if (lines.length === RECALL_TOP_K) break;
    if (!line || lines.some((kept) => kept.line === line.line)) continue;
    if (recallTokens([...lines, line].map((kept) => kept.line).join("\n")) > RECALL_TOKEN_CAP) continue;
    lines.push(line);
  }
  const block = lines.map((line) => line.line).join("\n");
  return { lines, block, tokens: recallTokens(block), considered: considered.length, quotable: quotable.size, refused };
}
