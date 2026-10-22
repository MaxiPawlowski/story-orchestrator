export const CODEX_GUIDE_TOPIC = {
  codex: {
    title: "People and Places",
    fields: "codex, people[], places[], id, name, member, location, aliases, known_when, facts[], text, source, rev, display.codex",
    text: "codex {people, places}: entries {id, name | member (roster id), location (a value of the location enum: known once the party is there), aliases, known_when, facts}. "
      + "facts (12 at most) {id, text (200 characters, plain, a lasting truth, not a scene event), known_when: gate | {reached: checkpoint} | \"start\", source (entry or roster id), rev}. "
      + "A line latches the first turn it holds; a swipe takes it back. Nothing unknown is sent. Gate keys are read for you. Reworded text shows at once; a new gate or rev is learned again.",
  },
  "codex-returns": {
    title: "Return visits",
    fields: "places[].returns[], id, text, when, rev",
    text: "On a place with a location, returns (6 at most) {id, text (200 characters, plain), when: gate | {reached: checkpoint}, rev}. A return waits until the place is known and "
      + "when holds while the party is elsewhere; the next time the party is back there, the line shows on the place page (\"The back door still hangs off one hinge.\"). "
      + "The first visit is never a return. Page only: nothing is sent to a model. A swipe takes it back. \"start\", a person, or a place without location is refused.",
  },
  observations: {
    title: "Things the player notices",
    fields: "observations[], id, text, when, source, rev, passive, roll, modifiers, display.observations",
    text: "observations (60 at most) {id, text (200 characters, plain: what is there to see, never what the player feels, concludes or does), when: gate | {reached: checkpoint}, "
      + "source (codex entry or roster id: \"From <name>\" once known), rev, passive {roll {sides, target, dice}, modifiers}}. A line latches the first turn when holds; passive rolls once, "
      + "seeded and never shown, and a miss is final. It shows on the story card that turn and in the Journal's Noticed section. Page only: no model is told. A swipe takes it back.",
  },
} as const;
