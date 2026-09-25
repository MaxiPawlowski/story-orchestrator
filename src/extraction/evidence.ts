// v2.3 plan 02 (R6). Evidence is a quote, so it has to be checkable against the text the read was
// actually given. A read that answers with a paraphrase, a line from outside its window, or a line
// stitched together from two messages has answered about a transcript nobody can point at — and the
// audit, which shows the quote next to the prompt, cannot tell.
//
// The unit is the WORD (V14). A substring rule let `"e"` or `"yes"` stand as evidence found in
// "eyes": the quote named text nobody wrote. Each fragment must be a run of whole words, so the
// minimum span is one whole word. There is still no character-length rule: the review's own R6
// evidence is the seven-character `"crossed"`, and a bool may legitimately cite `yes`.

const QUOTES = /["'‘’“”`]/g;
// The elision marker has to survive punctuation stripping to still be a marker at split time.
const ELISION = "\u0000";

export const normalizeEvidenceText = (text: string): string => text
  .toLowerCase()
  .replace(/…|\.\.\./g, ELISION)
  .replace(QUOTES, "")
  .replace(/[.!?,;:()[\]{}—–]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

/**
 * Is this evidence a span of ONE message in the window?
 *
 * Elision is honoured: `"the gate … at dawn"` is in the window when both fragments are, in that
 * order, in the same message. Nothing else is — which is the rule, not a limitation of it.
 */
const words = (text: string): string[] => text.split(" ").filter(Boolean);

function spanAt(message: string[], fragment: string[], from: number): number {
  for (let at = from; at + fragment.length <= message.length; at += 1) {
    if (fragment.every((word, offset) => message[at + offset] === word)) return at;
  }
  return -1;
}

const holdsSpan = (message: string, fragments: string[][]): boolean => {
  const text = words(normalizeEvidenceText(message).split(ELISION).join(" "));
  let cursor = 0;
  for (const fragment of fragments) {
    const at = spanAt(text, fragment, cursor);
    if (at < 0) return false;
    cursor = at + fragment.length;
  }
  return true;
};

const evidenceFragments = (evidence: string): string[][] => normalizeEvidenceText(evidence).split(ELISION).map(words).filter((fragment) => fragment.length);

export interface EvidenceMessage {
  messageId: number;
  text: string;
  isUser: boolean;
}

export function evidenceSources(evidence: string, messages: readonly EvidenceMessage[]): number[] {
  const fragments = evidenceFragments(evidence);
  if (!fragments.length) return [];
  return messages.filter((message) => holdsSpan(message.text, fragments)).map((message) => message.messageId);
}

export function evidenceInWindow(evidence: string, messages: string[]): boolean {
  return evidenceSources(evidence, messages.map((text, messageId) => ({ messageId, text, isUser: false }))).length > 0;
}
