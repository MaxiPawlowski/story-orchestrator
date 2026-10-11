import { buildCanonVerifyRequest, canonPieces, canonSentences, canonSentenceDropped, readCanonVerify, withoutDroppedSentences, type CanonVerifyInput } from "@judge/canonVerify";
import { CANON_VERIFY_TIMEOUT_MS } from "@judge/policy";
import type { JudgeRuntime } from "./judge";

export async function verifyCanonText(judge: JudgeRuntime | null, text: string, sources: Omit<CanonVerifyInput, "sentences">, use: "canonVerify" | "canonDraft" = "canonVerify"): Promise<string> {
  if (!judge?.active(use)) return text;
  const pieces = canonPieces(text);
  const sentences = canonSentences(pieces);
  if (!sentences.length) return text;
  const result = await judge.ask(use, buildCanonVerifyRequest({ ...sources, sentences }), { timeoutMs: CANON_VERIFY_TIMEOUT_MS });
  if (!result.answers || result.discarded) return text;
  const probabilities = readCanonVerify(result.answers, sentences.length);
  return withoutDroppedSentences(pieces, new Set(probabilities.flatMap((p, index) => canonSentenceDropped(p) ? [index] : [])));
}
