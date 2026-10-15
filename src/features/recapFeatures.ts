import type { Feature } from "./registry";
import { authorGuideDoc } from "./guideLinks";

export const RECAP_FEATURES: readonly Feature[] = [
  {
    id: "consequences-recap", name: "What changed", area: "play", audience: "player",
    oneLine: "Up to five lines on what changed this chapter: on the chapter card, in the Overview and in /story recap.",
    what: "The lines come from what the story already shows you: a place you reached, a quest that moved, a milestone, a public check. Where the author wrote a line for it, "
      + "you read that line instead. \"Because you…\" appears only when your own words decided the change; otherwise the line names the change and not its cause. "
      + "Nothing you have not reached is named, and a swipe takes the line back with the turn.",
    where: { selector: "#so-player-overview", label: "Story drawer › Overview", surface: "drawer" },
    settings: [], guideTopic: "consequences", doc: authorGuideDoc("consequences"), status: "experimental", needs: ["story"],
  },
];
