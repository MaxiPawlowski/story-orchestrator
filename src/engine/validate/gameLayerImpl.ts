import { readCheck, readChecks } from "./checks";
import { checkStoryChecks } from "./checkRefs";
import { checkDisplays, readDisplay } from "./display";
import { addRewardQualities, checkQuests, expandRequires, readMilestones, readQuests } from "./quests";
import { readWidgets } from "./widgets";
import { addLifeQualities, checkLife, readLife } from "./life";
import { deriveLife } from "../life/derive";
import { awayMembers, lifeScopeKeys, lifeScopeTiers } from "../life/presence";
import { agendaWorldInfo, landedSteps, lifeAuthorRows, lifeMoved, privateLifeLines, relationshipFeelings } from "../life/lines";

import { addFactionQualities, checkFactions, readFactions } from "./factions";
import {
  applyFactionMoves, factionAuthorRows, factionDirectorLines, factionMemberLines, factionScopeUnits, factionsMoved, standingView,
} from "../factions/standing";
import * as poses from "./poses";
import { validateCardLayers } from "./cardLayers";

const LIFE = {
  readLife, addLifeQualities, checkLife, deriveLife, awayMembers, lifeScopeKeys, lifeScopeTiers, privateLifeLines, agendaWorldInfo, landedSteps, lifeMoved, lifeAuthorRows,
  relationshipFeelings,
};

const FACTIONS = {
  readFactions, addFactionQualities, checkFactions, applyFactionMoves, factionsMoved, factionMemberLines, factionDirectorLines, standingView, factionAuthorRows, factionScopeUnits,
};

export const GAME_LAYER = {
  readCheck, readChecks, checkStoryChecks, checkDisplays, readDisplay, addRewardQualities, checkQuests, expandRequires, readMilestones, readQuests, readWidgets, life: LIFE, factions: FACTIONS,
  poses, validateCardLayers,
};
