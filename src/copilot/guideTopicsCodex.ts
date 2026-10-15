export const CODEX_GUIDE_TOPIC = {
  codex: {
    title: "People and Places",
    fields: "codex, people[], places[], id, name, member, location, aliases, known_when, facts[], text, source, rev, display.codex",
    text: "codex {people, places}: entries {id, name | member (roster id), location (a value of the location enum: known once the party is there), aliases, known_when, facts}. "
      + "facts (12 at most) {id, text (200 characters, plain, a lasting truth, not a scene event), known_when: gate | {reached: checkpoint} | \"start\", source (entry or roster id), rev}. "
      + "A line latches the first turn it holds; a swipe takes it back. Nothing unknown is sent. Gate keys are read for you. Reworded text shows at once; a new gate or rev is learned again.",
  },
} as const;
