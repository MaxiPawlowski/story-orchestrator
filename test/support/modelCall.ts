import { profileRoute, type ExtractionReply, type ModelAsk, type ModelCall, type ModelRoute } from "../../src/extraction/modelRoute";
import { stripReasoningBlocks } from "../../src/extraction/parse";

export const plantedModel: ModelCall = async (_prompt, ask) => {
  if (ask.debugResponse === undefined || ask.debugResponse === null) throw new Error(`no planted reply for the ${ask.pass} pass`);
  return { text: stripReasoningBlocks(ask.debugResponse), finish: "unknown" };
};

export const readWith = (_profileId: string | null, ask: Partial<ModelAsk> = {}): { model: ModelCall; ask: ModelAsk } =>
  ({ model: plantedModel, ask: { role: "read", pass: "read", ...ask } });

export const viaReply = (reply: (prompt: string, route: ModelRoute | null, ask: ModelAsk) => Promise<ExtractionReply>, profileId: string | null = "p1"): ModelCall =>
  (prompt, ask) => reply(prompt, profileRoute(profileId), ask);

export const textModel = (answer: (prompt: string, ask: ModelAsk) => Promise<string>): ModelCall =>
  async (prompt, ask) => ({ text: await answer(prompt, ask), finish: "stop" });

export interface RecordedAsk {
  prompt: string;
  ask: ModelAsk;
}

export const recordingModel = (answer: (prompt: string, ask: ModelAsk) => string | ExtractionReply = () => "NONE"): ModelCall & { calls: RecordedAsk[] } => {
  const calls: RecordedAsk[] = [];
  const model = async (prompt: string, ask: ModelAsk): Promise<ExtractionReply> => {
    calls.push({ prompt, ask });
    const reply = answer(prompt, ask);
    return typeof reply === "string" ? { text: reply, finish: "stop" } : reply;
  };
  return Object.assign(model, { calls });
};
