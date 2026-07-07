import type { SillyTavernContext } from "./hostTypes";
import { importSTModule } from "./modules";

export type StoryOrchestratorHostContext = SillyTavernContext;

type HostMacroValue = string | ((nonce: string) => string);
type MacrosHost = { MacrosParser: { registerMacro: (key: string, value: HostMacroValue, description?: string) => void; unregisterMacro: (key: string) => void } };

const hostGlobal = globalThis as { SillyTavern?: { getContext?: () => unknown } };
const contextFallback = hostGlobal.SillyTavern?.getContext
  ? null
  : await importSTModule<{ getContext: () => unknown }>("/scripts/extensions.js");
const macrosHost = await importSTModule<MacrosHost>("/scripts/macros.js");

export const getContext = (): StoryOrchestratorHostContext =>
  (hostGlobal.SillyTavern?.getContext?.() ?? contextFallback?.getContext()) as StoryOrchestratorHostContext;

export const registerHostMacro = (key: string, value: HostMacroValue, description?: string): void =>
  macrosHost.MacrosParser.registerMacro(key, value, description);

export const unregisterHostMacro = (key: string): void =>
  macrosHost.MacrosParser.unregisterMacro(key);

export const getPlayerName = (): string => {
  const context = getContext() as unknown as { name1?: string };
  return typeof context.name1 === "string" && context.name1.trim() ? context.name1.trim() : "";
};
