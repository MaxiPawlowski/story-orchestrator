import { getContext } from "@services/STAPI";
import { readCastScenarios, readChatScenario, writeChatScenario } from "@services/stHost/chatScenario";
import { isRecord } from "@utils/guards";
import { registerEffectExtension } from "../effectExtensions";
import { settingsRoot } from "../settingsRoot";
import { SP5_FLAG, createScenarioExtension, type ScenarioHost } from "./sp5Scenario";

export const sp5Enabled = (): boolean => {
  const spikes = settingsRoot().spikes;
  return isRecord(spikes) && spikes[SP5_FLAG] === true;
};

export const scenarioHost = (): ScenarioHost => ({
  enabled: sp5Enabled,
  read: () => readChatScenario(getContext()),
  write: (chatId, text) => writeChatScenario(getContext(), chatId, text),
  cast: () => readCastScenarios(getContext()),
});

export const registerScenarioSpike = (): (() => void) => registerEffectExtension(createScenarioExtension(scenarioHost()));
