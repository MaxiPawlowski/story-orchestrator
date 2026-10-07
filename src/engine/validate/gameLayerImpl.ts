import { readCheck, readChecks } from "./checks";
import { checkStoryChecks } from "./checkRefs";
import { checkDisplays, readDisplay } from "./display";
import { addRewardQualities, checkQuests, expandRequires, readMilestones, readQuests } from "./quests";
import { readWidgets } from "./widgets";

export const GAME_LAYER = {
  readCheck, readChecks, checkStoryChecks, checkDisplays, readDisplay, addRewardQualities, checkQuests, expandRequires, readMilestones, readQuests, readWidgets,
};
