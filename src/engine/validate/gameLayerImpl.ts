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
  factionAuthorRows, factionDirectorLines, factionDiscoveryUnits, factionLatches, factionMemberLines, factionScopeUnits, factionsMoved, standingView,
} from "../factions/standing";
import * as poses from "./poses";
import { validateCardLayers } from "./cardLayers";
import { addCodexQualities, checkCodex, readCodex } from "./codex";
import { codexLatches, codexScopeUnits, unknownCodexNames } from "../codex";
import { reachedLabel, storyTimeRow, timeEntry } from "../life/clock";

const LIFE = {
  readLife, addLifeQualities, checkLife, deriveLife, awayMembers, lifeScopeKeys, lifeScopeTiers, privateLifeLines, agendaWorldInfo, landedSteps, lifeMoved, lifeAuthorRows,
  relationshipFeelings, storyTimeRow, reachedLabel,
};

const CODEX = { readCodex, addCodexQualities, checkCodex, codexLatches, codexScopeUnits, unknownCodexNames };

const FACTIONS = {
  readFactions, addFactionQualities, checkFactions, factionsMoved, factionMemberLines, factionDirectorLines, standingView, factionAuthorRows, factionScopeUnits,
};

const LATCH_WRITERS = [codexLatches, factionLatches] as const;

const DISCOVERY_UNITS = [codexScopeUnits, factionDiscoveryUnits] as const;

const ENTRY_WRITERS = [timeEntry] as const;

export const GAME_LAYER = {
  readCheck, readChecks, checkStoryChecks, checkDisplays, readDisplay, addRewardQualities, checkQuests, expandRequires, readMilestones, readQuests, readWidgets, life: LIFE, poses, validateCardLayers,
  codex: CODEX, factions: FACTIONS, latchWriters: LATCH_WRITERS, discoveryUnits: DISCOVERY_UNITS, entryWriters: ENTRY_WRITERS,
};
