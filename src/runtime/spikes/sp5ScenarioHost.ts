import { getContext } from "@services/STAPI";
import { readCastScenarios, readChatScenario, writeChatScenario } from "@services/stHost/chatScenario";
import { registerEffectExtension } from "../effectExtensions";
import { getGlobalSettings } from "../settingsStore";
import { SP5_FLAG, createScenarioExtension, type ScenarioHost } from "./sp5Scenario";

export const sp5Enabled = (): boolean => getGlobalSettings().spikes[SP5_FLAG];

export const scenarioHost = (): ScenarioHost => ({
  enabled: sp5Enabled,
  read: () => readChatScenario(getContext()),
  write: (chatId, text) => writeChatScenario(getContext(), chatId, text),
  cast: () => readCastScenarios(getContext()),
});

export const registerScenarioSpike = (): (() => void) => registerEffectExtension(createScenarioExtension(scenarioHost()));
