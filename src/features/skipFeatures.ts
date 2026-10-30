import type { Feature } from "./registry";
import { featureAt } from "./where";

export const SKIP_FEATURES: readonly Feature[] = [
  {
    id: "skip-ahead", name: "Skip ahead", area: "characters", audience: "player",
    oneLine: "Skip travel, waiting or routine: one narrator reply tells the time passing and stops where you are needed.",
    what: "Skip ahead on the story card, or /story skip, asks the story's narrator (or the scene's lead) for one reply that tells the time passing, "
      + "up to the next part of the day at most, and stops early when something needs you. It never decides for you and never reveals what you have not seen. "
      + "A swipe of that reply keeps the skip; your next message ends it. Off until its blind rating passes.",
    where: featureAt("skip", "enabled", "Skip ahead"),
    settings: ["talk.skipAhead"], guideTopic: "objective-agency", doc: "player/playing.md", status: "off-by-default", needs: ["group-chat", "story"],
  },
];
