import { askText } from "@extraction/index";
import { ASK_MAX_TOKENS, runAsk, type AskContext, type AskPersona, type AskResult, type AskStep } from "@copilot/agent/ask";
import { log } from "@utils/log";
import { ASK_HOST_COPY, liveStateText } from "./askLiveState";
import { beginRun } from "./runToken";
import type { RuntimeManager } from "./runtimeManager";
import { getGlobalSettings } from "./settingsStore";
import { projectionFor, type SuggestionManager } from "./suggestionsHost";

export type AskManager = SuggestionManager & Pick<RuntimeManager, "getProvisioningEnvironment" | "noteRecap">;

export { ASK_HOST_COPY };

export type AskOutcome = { ok: true; persona: AskPersona; result: AskResult } | { ok: false; reason: string };

export const askPersonaFor = (manager: Pick<RuntimeManager, "getSnapshot">): AskPersona => (manager.getSnapshot().ui?.authorView === true ? "author" : "player");

export const chatAskContext = (manager: AskManager, persona: AskPersona): AskContext => {
  if (persona === "player") return { persona, projection: projectionFor(manager) };
  const environment = manager.getProvisioningEnvironment();
  return {
    persona,
    draft: manager.getStory(),
    lookup: {
      characters: () => environment.characterNames, lorebooks: () => environment.lorebookNames, groups: () => environment.groupNames, backgrounds: () => [],
    },
    liveState: () => liveStateText(manager.getSnapshot()),
  };
};

export const refusalJournalLine = (persona: AskPersona, step: AskStep): string =>
  `Ask (${persona}): a ${step.call.tool} read was refused and not retried`;

export async function askInChat(manager: AskManager, question: string, persona: AskPersona = askPersonaFor(manager)): Promise<AskOutcome> {
  if (!getGlobalSettings().copilot.ask) return { ok: false, reason: ASK_HOST_COPY.off };
  const run = beginRun(manager.getOwnership());
  const context = chatAskContext(manager, persona);
  const onRefused = (step: AskStep) => {
    if (!run.stillOwns()) return;
    manager.noteRecap(refusalJournalLine(persona, step), step.observation);
  };
  const model = (prompt: string) => askText(manager.model, prompt, { role: "authoring", pass: "ask", maxTokens: ASK_MAX_TOKENS, signal: run.signal });
  try {
    const result = await runAsk({ question, context, model, onRefused });
    if (!run.stillOwns()) return { ok: false, reason: ASK_HOST_COPY.stale };
    return { ok: true, persona, result };
  } catch (error) {
    log.warn("ask: the request failed", error);
    return { ok: false, reason: run.stillOwns() ? ASK_HOST_COPY.failed : ASK_HOST_COPY.stale };
  }
}

export const answerText = (outcome: AskOutcome): string => {
  if (!outcome.ok) return outcome.reason;
  const { result } = outcome;
  const from = result.topics.length ? `\n\nFrom: ${result.topics.map((topic) => topic.title).join("; ")}` : "";
  return `${result.answer}${from}`;
};
