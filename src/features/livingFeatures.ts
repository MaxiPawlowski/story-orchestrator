import type { Feature } from "./registry";
import { authorGuideDoc } from "./guideLinks";
import { drawerAt, featureAt } from "./where";

export const LIVING_FEATURES: readonly Feature[] = [
  {
    id: "living-story", name: "Living stories", area: "world", audience: "author",
    oneLine: "A story that writes its next turning point ahead of you, from what you actually pursued.",
    what: "A story with a premise and no fixed ending: when the story reaches its last written turning point, the story director writes the next one from the premise, "
      + "the canon and the threads you opened, and the road there is filled in as usual. A story can also continue past its authored end. "
      + "Author view lists each turning point it wrote and why; a swipe takes back what a reply led to.",
    where: featureAt("living", "enabled", "Living stories"),
    settings: ["stagecraft.livingEnabled"], guideTopic: "living-director", doc: authorGuideDoc("living-director"), status: "experimental",
    needs: ["story", "group-chat", "memory-profile"],
  },
  {
    id: "story-branching", name: "Branches that follow you", area: "world", audience: "author",
    oneLine: "When you leave the prepared ways forward, the story writes a branch that follows you and later comes back.",
    what: "At a turning point with ways forward, the story notices when what you do fits none of them (refusing them twice, or the judge saying so twice in a row). "
      + "The story director then writes a short branch from where you are, and the road it takes rejoins the story further on. At most one branch per turning point.",
    where: featureAt("branching", "enabled", "Branches that follow you"),
    settings: ["stagecraft.branchingEnabled", "stagecraft.prefetchEnabled"], guideTopic: "branching", doc: authorGuideDoc("branching"), status: "experimental",
    needs: ["story", "group-chat", "memory-profile"],
  },
  {
    id: "scene-test", name: "Scene test", area: "world", audience: "author",
    oneLine: "Before the living director writes a turning point, a seeded draw may tell it the scene arrives changed or that the world acts first.",
    what: "A living story that declares living.scene_test draws once for each turning point the director plans: expected, altered (one detail of place, cast, timing "
      + "or an obstacle changes) or interrupt (a world event advances an open thread first). The odds rise with the story's smoothed tension. The draw is keyed by "
      + "the chat, the story and the turning point, frozen when first planned, never re-rolled by Write it again, and taken back only by a swipe past it. "
      + "It changes what the world does, never what the player does, and only the author sees it.",
    where: drawerAt("#so-living-scene-tests", "Living story"),
    settings: [], guideTopic: "scene-test", doc: authorGuideDoc("scene-test"), status: "experimental",
    needs: ["story", "group-chat", "memory-profile"],
  },
  {
    id: "save-run-as-story", name: "Save this run as a story", area: "play", audience: "player",
    oneLine: "Keep a living story's run as a story you can play again or edit.",
    what: "This chat → Play offers to save what you played as a new story in your library. Only the turning points you reached are kept; what the story had written "
      + "ahead of you is left out, so the saved copy never spoils a later play.",
    where: drawerAt("#so-living-save", "Play"),
    settings: [], guideTopic: "living-director", doc: authorGuideDoc("living-director"), status: "experimental", needs: ["story"],
  },
];
