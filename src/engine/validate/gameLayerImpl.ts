import { readCheck, readChecks } from "./checks";
import { checkStoryChecks } from "./checkRefs";
import { checkDisplays, readDisplay } from "./display";
import { addRewardQualities, checkQuests, expandRequires, readMilestones, readQuests } from "./quests";
import { readWidgets } from "./widgets";
import { addLifeQualities, checkLife, readLife } from "./life";
import { deriveLife } from "../life/derive";
import { awayMembers, lifeScopeKeys, lifeScopeTiers } from "../life/presence";
import { agendaWorldInfo, landedSteps, lifeAuthorRows, lifeMoved, privateLifeLines, relationshipFeelings } from "../life/lines";
import { labelAuthorRows, labelDiscoveryUnits, labelLatches, revealChips, unrevealedSecretLabels } from "../life/labels";
import { axisHistory, holdSameBeat } from "../life/beats";

import { addFactionQualities, checkFactions, readFactions } from "./factions";
import {
  factionAuthorRows, factionDirectorLines, factionDiscoveryUnits, factionLatches, factionMemberLines, factionScopeUnits, factionsMoved, standingView,
} from "../factions/standing";
import * as poses from "./poses";
import { validateCardLayers } from "./cardLayers";
import { addCodexQualities, checkCodex, readCodex } from "./codex";
import { codexLatches, codexScopeUnits, unknownCodexNames } from "../codex";
import { readCarry } from "./carry";
import { carryKnownLines, carryView, importCarryErrors, startSeed } from "../carry";
import { reachedLabel, storyTimeRow, timeEntry } from "../life/clock";

const LIFE = {
  readLife, addLifeQualities, checkLife, deriveLife, awayMembers, lifeScopeKeys, lifeScopeTiers, privateLifeLines, agendaWorldInfo, landedSteps, lifeMoved, lifeAuthorRows,
  relationshipFeelings, storyTimeRow, reachedLabel, labelAuthorRows, revealChips, unrevealedSecretLabels, axisHistory, holdSameBeat,
};

const CODEX = { readCodex, addCodexQualities, checkCodex, codexLatches, codexScopeUnits, unknownCodexNames };

const FACTIONS = {
  readFactions, addFactionQualities, checkFactions, factionsMoved, factionMemberLines, factionDirectorLines, standingView, factionAuthorRows, factionScopeUnits,
};

const CARRY = { readCarry, importCarryErrors, startSeed, carryKnownLines, carryView };

const LATCH_WRITERS = [codexLatches, factionLatches, labelLatches] as const;

const DISCOVERY_UNITS = [codexScopeUnits, factionDiscoveryUnits, labelDiscoveryUnits] as const;

const ENTRY_WRITERS = [timeEntry] as const;

export const GAME_LAYER = {
  readCheck, readChecks, checkStoryChecks, checkDisplays, readDisplay, addRewardQualities, checkQuests, expandRequires, readMilestones, readQuests, readWidgets, life: LIFE, poses, validateCardLayers,
  codex: CODEX, factions: FACTIONS, carry: CARRY, latchWriters: LATCH_WRITERS, discoveryUnits: DISCOVERY_UNITS, entryWriters: ENTRY_WRITERS,
};
