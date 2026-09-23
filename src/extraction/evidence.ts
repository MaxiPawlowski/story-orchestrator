// v2.3 plan 02 (R6). Evidence is a quote, so it has to be checkable against the text the read was
// actually given. A read that answers with a paraphrase, a line from outside its window, or a line
// stitched together from two messages has answered about a transcript nobody can point at — and the
// audit, which shows the quote next to the prompt, cannot tell.
//
// There is deliberately no length rule. The review's own R6 evidence is the seven-character
// `"crossed"` and a bool may legitimately cite `yes`; a minimum length trades a visible failure for
// a silently discarded truth.

const QUOTES = /["'‘’“”`]/g;
// The elision marker has to survive punctuation stripping to still be a marker at split time.
const ELISION = "\u0000";

export const normalizeEvidenceText = (text: string): string => text
  .toLowerCase()
  .replace(/…|\.\.\./g, ELISION)
  .replace(QUOTES, "")
  .replace(/[.!?,;:]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

/**
 * Is this evidence a span of ONE message in the window?
 *
 * Elision is honoured: `"the gate … at dawn"` is in the window when both fragments are, in that
 * order, in the same message. Nothing else is — which is the rule, not a limitation of it.
 */
export function evidenceInWindow(evidence: string, messages: string[]): boolean {
  const fragments = normalizeEvidenceText(evidence).split(ELISION).map((part) => part.trim()).filter(Boolean);
  if (!fragments.length) return false;
  return messages.some((message) => {
    const text = normalizeEvidenceText(message).split(ELISION).join(" ");
    let cursor = 0;
    for (const fragment of fragments) {
      const at = text.indexOf(fragment, cursor);
      if (at < 0) return false;
      cursor = at + fragment.length;
    }
    return true;
  });
}
