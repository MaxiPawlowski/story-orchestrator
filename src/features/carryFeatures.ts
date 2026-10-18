import type { Feature } from "./registry";
import { authorGuideDoc } from "./guideLinks";
import { drawerAt } from "./where";

export const CARRY_FEATURES: readonly Feature[] = [
  {
    id: "new-game-plus", name: "Carry a finished story", area: "play", audience: "player",
    oneLine: "A sequel, or a replay of the same story, can start from how a run you finished ended.",
    what: "When a story says it continues another, its start pane lists your finished runs of that story; only runs that really ended and carry what it needs are shown. "
      + "Pick one and the values its author chose carry over: a heritage line on the card, a few starting facts, and a short \"Previously…\" note for the narrator for the first "
      + "few turns. Only what you saw at the end carries; a character knows a carried thing only if the author says so. "
      + "Under Continue, Finished stories lists the runs you ended, each checked first, with its ending and the milestones you earned that were not secret.",
    where: drawerAt("#so-carry-heritage", "Overview › From an earlier story"),
    settings: [], guideTopic: "carry-from", doc: authorGuideDoc("carry-from"), status: "experimental", needs: ["group-chat", "story"],
  },
];
