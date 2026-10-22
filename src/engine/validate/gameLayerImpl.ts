import { readCheck, readChecks } from "./checks";
import { addCheckQualities, checkStoryChecks } from "./checkRefs";
import { checkDisplays, readDisplay } from "./display";
import { addRewardQualities, checkQuests, expandRequires, readMilestones, readQuests } from "./quests";
import { readWidgets } from "./widgets";
import { addLifeQualities, checkLife, readLife } from "./life";
import { deriveLife } from "../life/derive";
import { awayMembers, effectiveMood, lifeScopeKeys, lifeScopeTiers } from "../life/presence";
import { agendaWorldInfo, landedSteps, lifeAuthorRows, lifeMoved, privateLifeLines, relationshipFeelings } from "../life/lines";
import { labelAuthorRows, labelDiscoveryUnits, labelLatches, revealChips, unrevealedSecretLabels } from "../life/labels";
import { axisHistory, holdSameBeat } from "../life/beats";
import {
  commitmentAuthorRows, commitmentDiscoveryUnits, commitmentHooks, commitmentLatches, commitmentWorldInfo, heardCommitmentRows, keptCommitments,
} from "../life/commitments";

import { addFactionQualities, checkFactions, readFactions } from "./factions";
import {
  factionAuthorRows, factionDirectorLines, factionDiscoveryUnits, factionLatches, factionMemberLines, factionScopeUnits, factionsMoved, standingView,
} from "../factions/standing";
import * as poses from "./poses";
import { validateCardLayers } from "./cardLayers";
import { addCodexQualities, checkCodex, readCodex } from "./codex";
import { codexLatches, codexScopeUnits, unknownCodexNames } from "../codex";
import { addObservationQualities, checkObservations, readObservations } from "./observations";
import { observationLatches, observationRoll, observationScopeUnits } from "../observations";
import { readCarry } from "./carry";
import { checkRumors, readRumors } from "./rumors";
import { checkPatterns, readPatterns } from "./patterns";
import { deliveryNames, readRosterPolish } from "./delivery";
import { storyPolishPart } from "./polish";
import { checkStretches, readStretch } from "./stretch";
import { addLivingQualities, checkLiving, livingOpening, needsLivingOpening, readLiving } from "./living";
import { spreadRumors } from "../../memory/rumors/spread";
import { hearsayLines, rumorAuthorRows } from "../../memory/rumors/lines";
import { carryKnownLines, carryView, importCarryErrors, startSeed } from "../carry";
import { reachedLabel, storyTimeRow, timeEntry } from "../life/clock";

const LIFE = {
  readLife, addLifeQualities, checkLife, deriveLife, awayMembers, lifeScopeKeys, lifeScopeTiers, privateLifeLines, agendaWorldInfo, landedSteps, lifeMoved, lifeAuthorRows,
  relationshipFeelings, storyTimeRow, reachedLabel, labelAuthorRows, revealChips, unrevealedSecretLabels, axisHistory, holdSameBeat,
  commitmentAuthorRows, commitmentHooks, heardCommitmentRows, keptCommitments, effectiveMood,
  lifeWorldInfo: (story: Parameters<typeof agendaWorldInfo>[0], values: Parameters<typeof agendaWorldInfo>[1]) => [...agendaWorldInfo(story, values), ...commitmentWorldInfo(story, values)],
};

const CODEX = { readCodex, addCodexQualities, checkCodex, codexLatches, codexScopeUnits, unknownCodexNames };

const FACTIONS = {
  readFactions, addFactionQualities, checkFactions, factionsMoved, factionMemberLines, factionDirectorLines, standingView, factionAuthorRows, factionScopeUnits,
};

const CARRY = { readCarry, importCarryErrors, startSeed, carryKnownLines, carryView };

const RUMORS = { readRumors, checkRumors, spreadRumors, hearsayLines, rumorAuthorRows };

const OBSERVATIONS = { readObservations, addObservationQualities, checkObservations, observationRoll };

const PATTERNS = { readPatterns, checkPatterns };

const DELIVERY = { readRosterPolish, deliveryNames, storyPolishPart };

const STRETCH = { readStretch, checkStretches };

const LIVING = { readLiving, needsLivingOpening, livingOpening, addLivingQualities, checkLiving };

const LATCH_WRITERS = [codexLatches, factionLatches, labelLatches, commitmentLatches, observationLatches] as const;

const DISCOVERY_UNITS = [codexScopeUnits, factionDiscoveryUnits, labelDiscoveryUnits, commitmentDiscoveryUnits, observationScopeUnits] as const;

const ENTRY_WRITERS = [timeEntry] as const;

export const GAME_LAYER = {
  readCheck, readChecks, checkStoryChecks, addCheckQualities,
  checkDisplays, readDisplay, addRewardQualities, checkQuests, expandRequires, readMilestones, readQuests, readWidgets, life: LIFE, poses, validateCardLayers,
  codex: CODEX, observations: OBSERVATIONS, factions: FACTIONS, carry: CARRY, rumors: RUMORS, patterns: PATTERNS, delivery: DELIVERY, living: LIVING, stretch: STRETCH, latchWriters: LATCH_WRITERS,
  discoveryUnits: DISCOVERY_UNITS, entryWriters: ENTRY_WRITERS,
};
