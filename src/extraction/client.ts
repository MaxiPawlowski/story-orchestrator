import { sendConnectionProfileRequest } from "@services/STAPI";

export interface ExtractionClientOptions {
  profileId: string | null;
  maxTokens?: number;
  debugResponse?: string | null;
}

export async function callExtractionModel(prompt: string, options: ExtractionClientOptions): Promise<string> {
  if (options.debugResponse !== undefined && options.debugResponse !== null) return options.debugResponse;
  if (!options.profileId) throw new Error("No memory LLM profile selected");
  return sendConnectionProfileRequest(options.profileId, prompt, options.maxTokens ?? 512, {
    temperature: 0.1,
    top_p: 0.9,
    stream: false,
  });
}
