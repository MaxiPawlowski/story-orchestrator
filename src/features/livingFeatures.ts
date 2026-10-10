import type { Feature } from "./registry";

export const LIVING_FEATURES: readonly Feature[] = [
  {
    id: "living-story", name: "Living stories", area: "world", audience: "author",
    oneLine: "A story that writes its next turning point ahead of you, from what you actually pursued.",
    what: "A story with a premise and no fixed ending: when the story reaches its last written turning point, the story director writes the next one from the premise, "
      + "the canon and the threads you opened, and the road there is filled in as usual. A story can also continue past its authored end. "
      + "Author view lists each turning point it wrote and why; a swipe takes back what a reply led to.",
    where: { selector: "#so-living-enabled", label: "Settings › World › Background helpers", surface: "settings" },
    settings: ["stagecraft.livingEnabled"], guideTopic: "living-director", doc: "author/topics/living-director.md", status: "experimental",
    needs: ["story", "group-chat", "memory-profile"],
    isOn: (settings) => settings.stagecraft.livingEnabled !== false,
  },
  {
    id: "story-branching", name: "Branches that follow you", area: "world", audience: "author",
    oneLine: "When you leave the prepared ways forward, the story writes a branch that follows you and later comes back.",
    what: "At a turning point with ways forward, the story notices when what you do fits none of them (refusing them twice, or the judge saying so twice in a row). "
      + "The story director then writes a short branch from where you are, and the road it takes rejoins the story further on. At most one branch per turning point.",
    where: { selector: "#so-branching-enabled", label: "Settings › World › Background helpers", surface: "settings" },
    settings: ["stagecraft.branchingEnabled", "stagecraft.prefetchEnabled"], guideTopic: "branching", doc: "author/topics/branching.md", status: "experimental",
    needs: ["story", "group-chat", "memory-profile"],
    isOn: (settings) => settings.stagecraft.branchingEnabled !== false,
  },
  {
    id: "save-run-as-story", name: "Save this run as a story", area: "play", audience: "player",
    oneLine: "Keep a living story's run as a story you can play again or edit.",
    what: "The drawer's Overview offers to save what you played as a new story in your library. Only the turning points you reached are kept; what the story had written "
      + "ahead of you is left out, so the saved copy never spoils a later play.",
    where: { selector: "#so-living-save", label: "Story drawer › Overview", surface: "drawer" },
    settings: [], guideTopic: "living-director", doc: "author/topics/living-director.md", status: "experimental", needs: ["story"],
  },
];
