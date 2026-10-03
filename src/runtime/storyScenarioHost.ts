import { getContext } from "@services/STAPI";
import { readCastScenarios, readChatScenario, writeChatScenario } from "@services/stHost/chatScenario";
import { registerEffectExtension } from "./effectExtensions";
import { createScenarioExtension, readScenarioFrameWith, type ScenarioHost } from "./storyScenario";

export const scenarioHost = (): ScenarioHost => ({
  read: () => readChatScenario(getContext()),
  write: (chatId, text) => writeChatScenario(getContext(), chatId, text),
  cast: () => readCastScenarios(getContext()),
});

export const startStoryScenario = (): (() => void) => {
  const host = scenarioHost();
  const unregister = registerEffectExtension(createScenarioExtension(host));
  const unread = readScenarioFrameWith(() => {
    const open = host.read();
    return open ? { override: open.text, cast: host.cast() } : null;
  });
  return () => {
    unregister();
    unread();
  };
};
