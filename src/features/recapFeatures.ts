import type { Feature } from "./registry";
import { authorGuideDoc } from "./guideLinks";
import { drawerAt } from "./where";

export const RECAP_FEATURES: readonly Feature[] = [
  {
    id: "consequences-recap", name: "What changed", area: "play", audience: "player",
    oneLine: "Up to five lines on what changed this chapter: on the chapter card, in the Overview and in /story recap.",
    what: "The lines come from what the story already shows you: a place you reached, a quest that moved, a milestone, a public check. Where the author wrote a line for it, "
      + "you read that line instead. \"Because you…\" appears only when your own words decided the change; otherwise the line names the change and not its cause. "
      + "Nothing you have not reached is named, and a swipe takes the line back with the turn.",
    where: drawerAt("#so-player-overview", "Overview"),
    settings: [], guideTopic: "consequences", doc: authorGuideDoc("consequences"), status: "experimental", needs: ["story"],
  },
  {
    id: "story-patterns", name: "Story patterns", area: "play", audience: "player",
    oneLine: "When events the story wrote a pattern for happen in order, its callback line joins What changed.",
    what: "An author can name an order of things you saw happen: two favours for the same patron, a climb failed and then won. When it happens, the story's own line "
      + "joins What changed and the narrator gets a hint for a few turns. It is matched in code from what the story recorded, never guessed, and it never says why. "
      + "A line naming someone you have not met, or a secret, is not shown, and a swipe takes it back with the turn.",
    where: drawerAt("#so-player-overview", "Overview"),
    settings: ["memory.patterns"], guideTopic: "patterns", doc: authorGuideDoc("patterns"), status: "experimental", needs: ["story"],
    isOn: (settings) => settings.memory.patterns !== false,
  },
];
