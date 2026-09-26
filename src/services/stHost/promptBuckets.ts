import { getContext } from "./context";
import { importSTModule } from "./modules";
import { parsePromptBuckets, type PromptBucketsRead } from "./promptBucketsParse";

type OpenAiHostModule = { promptManager?: unknown };

const openaiModule = await importSTModule<OpenAiHostModule>("/scripts/openai.js");

export const readPromptBuckets = (): PromptBucketsRead => {
  try {
    return parsePromptBuckets(getContext()?.mainApi, openaiModule?.promptManager ?? null);
  } catch {
    return { ok: false, reason: "SillyTavern's Chat Completion module could not be read" };
  }
};
