import { readCheck, readChecks } from "./checks";
import { checkStoryChecks } from "./checkRefs";
import { checkDisplays, readDisplay } from "./display";
import { addRewardQualities, checkQuests, expandRequires, readMilestones, readQuests } from "./quests";
import { readWidgets } from "./widgets";
import { addLifeQualities, checkLife, readLife } from "./life";
import { deriveLife } from "../life/derive";
import { awayMembers, lifeScopeKeys, lifeScopeTiers } from "../life/presence";
import { agendaWorldInfo, landedSteps, lifeAuthorRows, lifeMoved, privateLifeLines, relationshipFeelings } from "../life/lines";

const LIFE = {
  readLife, addLifeQualities, checkLife, deriveLife, awayMembers, lifeScopeKeys, lifeScopeTiers, privateLifeLines, agendaWorldInfo, landedSteps, lifeMoved, lifeAuthorRows,
  relationshipFeelings,
};

export const GAME_LAYER = {
  readCheck, readChecks, checkStoryChecks, checkDisplays, readDisplay, addRewardQualities, checkQuests, expandRequires, readMilestones, readQuests, readWidgets, life: LIFE,
};
