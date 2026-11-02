const NARRATION = /\*[^*\n]+\*/;
const QUOTED = /"[^"]*"|“[^”]*”/g;
const FIRST_PERSON = /(?:^|[,.!?;:\n]\s*|\band\s+|\bthen\s+)(?:i|we)\s+([a-z]+)/giu;
const NOT_ACTS = new Set([
  "think", "wonder", "know", "feel", "guess", "am", "mean", "hope", "want", "wish", "believe", "suppose", "need", "would", "will", "should", "could", "can", "might",
  "must", "may", "shall", "have", "had", "do", "did", "agree", "understand", "like", "love", "hate", "doubt", "say", "promise", "swear", "trust", "fear", "bet",
  "was", "were", "are", "is", "really", "just", "still", "also", "never", "not", "only", "all", "both",
]);

export const playerActs = (text: string): boolean => {
  if (NARRATION.test(text)) return true;
  const plain = text.replace(/[‘’]/g, "'").replace(QUOTED, " ");
  return [...plain.matchAll(FIRST_PERSON)].some((match) => !NOT_ACTS.has(match[1].toLowerCase()));
};
