import { isRecord } from "@utils/guards";
import type { SillyTavernContext } from "./hostTypes";

type OpenAiModelsHostModule = { model_list?: unknown };

const hostGlobal = globalThis as { SillyTavern?: { getContext?: () => unknown } };

let openaiModule: OpenAiModelsHostModule | null = null;

const loadOpenAi = (path: string): Promise<OpenAiModelsHostModule> => import(/* webpackIgnore: true */ path);

void loadOpenAi("/scripts/openai.js").then((module) => { openaiModule = module; }, () => undefined);

export interface ThinkingTemplate {
  prefix: string;
  suffix: string;
}

export const readThinkingTemplate = (): ThinkingTemplate | null => {
  const context = hostGlobal.SillyTavern?.getContext?.() as SillyTavernContext | undefined;
  const reasoning = context?.powerUserSettings?.reasoning;
  if (!isRecord(reasoning) || typeof reasoning.prefix !== "string" || typeof reasoning.suffix !== "string") return null;
  return { prefix: reasoning.prefix, suffix: reasoning.suffix };
};

export const listedModels = (): Record<string, unknown>[] => {
  const list = openaiModule?.model_list;
  return Array.isArray(list) ? list.filter(isRecord) : [];
};
