import { isQuietType } from "./generationLifecycle";

export type LoreSelectTrigger = "MESSAGE_SENT" | "GENERATION_STARTED";

export interface LoreSelectTimingDeps {
  active: () => boolean;
  willAddUserMessage: (type: string | undefined, params: Record<string, unknown> | undefined, dryRun: boolean | undefined) => boolean;
  select: (trigger: LoreSelectTrigger) => Promise<void>;
}

export const loreSelectTiming = (deps: LoreSelectTimingDeps) => {
  let awaitsMessage = false;
  let awaitsIntercept = false;
  let pending: Promise<void> | null = null;
  const onGenerationStarted = async (type: string | undefined, params: Record<string, unknown> | undefined, dryRun: boolean | undefined) => {
    awaitsMessage = false;
    if (dryRun || isQuietType(type) || params?.quiet_prompt) return;
    awaitsIntercept = false;
    if (!deps.active()) return;
    if (deps.willAddUserMessage(type, params, dryRun)) awaitsMessage = true;
    else awaitsIntercept = true;
  };
  const onIntercept = async (type: string, aborted: boolean) => {
    if (pending) {
      const started = pending;
      pending = null;
      await started;
    }
    if (isQuietType(type) || !awaitsIntercept) return;
    awaitsIntercept = false;
    if (!aborted) await deps.select("GENERATION_STARTED");
  };
  const onMessageSent = async () => {
    if (!awaitsMessage) return;
    awaitsMessage = false;
    pending = deps.select("MESSAGE_SENT");
  };
  return { onGenerationStarted, onIntercept, onMessageSent, pending: () => pending };
};
