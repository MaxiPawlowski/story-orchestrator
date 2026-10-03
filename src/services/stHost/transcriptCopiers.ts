import { isRecord } from "@utils/guards";

// ST 7c3994196. Summarize: extension folder "memory", prompt key "1_memory" (memory/index.js:36); it reads
// the live chat (memory/index.js:785) and updates while source is main/webllm (memory/index.js:93-97, 541-555),
// not paused (memoryFrozen, :434), interval > 0 (promptInterval, 0 = off, :566) and position not NONE
// (extension_prompt_types.NONE = -1, script.js:485; position is stored as the radio's string, :319).
// The extras source needs the retired Extras API's summarize module (:418), which this read cannot see.
interface SummarizeSettings {
  memoryFrozen?: boolean;
  source?: string;
  promptInterval?: number;
  position?: number | string;
}

// Vector Storage: extension folder "vectors", prompt key "3_vectors" (vectors/index.js:50,52); chat vectors
// run only while enabled_chats is true (vectors/index.js:86, 795), mirrored into extension_settings.vectors
// on every change (:1746-1789).
interface VectorSettings {
  enabled_chats?: boolean;
}

// Enabled = the folder name is not in disabledExtensions (extensions.js:146, 513).
interface CopierSettingsRoot {
  disabledExtensions?: string[];
  memory?: SummarizeSettings;
  vectors?: VectorSettings;
}

export const SUMMARIZE_PROMPT_KEY = "1_memory";
export const VECTORS_PROMPT_KEY = "3_vectors";

const SUMMARIZING_SOURCES = new Set(["main", "webllm"]);
const PROMPT_NONE = -1;

const summarizeOn = (settings: SummarizeSettings | undefined): boolean => Boolean(settings)
  && settings?.memoryFrozen !== true
  && SUMMARIZING_SOURCES.has(String(settings?.source ?? ""))
  && Number(settings?.promptInterval ?? 0) > 0
  && Number(settings?.position) !== PROMPT_NONE;

export function transcriptCopiersOn(root: unknown): string[] {
  if (!isRecord(root)) return [];
  const settings = root as CopierSettingsRoot;
  const disabled = new Set(Array.isArray(settings.disabledExtensions) ? settings.disabledExtensions : []);
  const memory = isRecord(settings.memory) ? settings.memory : undefined;
  const vectors = isRecord(settings.vectors) ? settings.vectors : undefined;
  return [
    ...(!disabled.has("memory") && summarizeOn(memory) ? [SUMMARIZE_PROMPT_KEY] : []),
    ...(!disabled.has("vectors") && vectors?.enabled_chats === true ? [VECTORS_PROMPT_KEY] : []),
  ];
}

