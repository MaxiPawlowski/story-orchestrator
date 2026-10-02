import { isRecord } from "@utils/guards";
import { getContext } from "./context";
import { importSTModule } from "./modules";

type OpenAiModelsHostModule = { model_list?: unknown };

const openaiModule = await importSTModule<OpenAiModelsHostModule>("/scripts/openai.js");

export interface ThinkingTemplate {
  prefix: string;
  suffix: string;
}

export const readThinkingTemplate = (): ThinkingTemplate | null => {
  const reasoning = getContext().powerUserSettings?.reasoning;
  if (!isRecord(reasoning) || typeof reasoning.prefix !== "string" || typeof reasoning.suffix !== "string") return null;
  return { prefix: reasoning.prefix, suffix: reasoning.suffix };
};

export const listedModels = (): Record<string, unknown>[] => {
  const list = openaiModule?.model_list;
  return Array.isArray(list) ? list.filter(isRecord) : [];
};
