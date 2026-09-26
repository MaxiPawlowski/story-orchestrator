import { getContext, subscribeToHostEvents } from "@services/STAPI";
import type { RuntimeManager } from "../runtimeManager";
import { summarizeToolTurns, type ProbeBoundary, type ProbeEvent, type ToolTurnReport, type WorkKey } from "./toolTurnSummary";

export interface ToolTurnProbe {
  start: () => void;
  stop: () => void;
  read: () => ToolTurnReport;
}

const patch = <T extends object>(target: T, key: keyof T, onCall: () => void): (() => void) => {
  const original: unknown = target[key];
  if (typeof original !== "function") return () => undefined;
  Reflect.set(target, key, (...args: unknown[]) => {
    onCall();
    return Reflect.apply(original, target, args);
  });
  return () => {
    Reflect.set(target, key, original);
  };
};

const chatLength = () => (Array.isArray(getContext().chat) ? getContext().chat.length : 0);

const boundariesSince = (manager: RuntimeManager, from: number): ProbeBoundary[] => manager.getSessionJournal()
  .filter((event) => event.kind === "boundary" && event.boundary > from)
  .map((event) => ({ boundary: event.boundary, messageId: event.messageId }));

export const createToolTurnProbe = (manager: RuntimeManager): ToolTurnProbe => {
  let events: ProbeEvent[] = [];
  let startBoundary = 0;
  let startDecisions = 0;
  let undo: Array<() => void> = [];
  const note = (event: ProbeEvent) => events.push(event);
  const work = (key: WorkKey) => () => note({ kind: "work", work: key });

  const stop = () => {
    for (const restore of undo.splice(0).reverse()) restore();
  };

  const start = () => {
    stop();
    events = [];
    startBoundary = manager.getEngineState()?.boundary ?? 0;
    startDecisions = manager.getTalkState().decisions.length;
    const lore = globalThis.storyOrchestratorLore?.selector;
    undo = [
      patch(manager, "onGenerationStarted", work("generationStarted")),
      patch(manager, "onMemberDrafted", work("memberDrafted")),
      patch(manager, "recordTalkDecision", work("talkDecision")),
      ...(lore ? [patch(lore, "select", work("loreSelect"))] : []),
      patch(globalThis, "talkControlInterceptor", work("interceptor")),
      subscribeToHostEvents([
        { eventName: "MESSAGE_SENT", handler: (messageId) => note({ kind: "sent", messageId: Number(messageId) }) },
        { eventName: "GROUP_MEMBER_DRAFTED", handler: (characterId) => note({ kind: "drafted", member: String(characterId) }) },
        { eventName: "GENERATION_STARTED", handler: (type, _params, dryRun) => note({ kind: "started", type: String(type), dryRun: dryRun === true }) },
        { eventName: "TOOL_CALLS_RENDERED", handler: () => note({ kind: "tool", messageId: chatLength() - 1 }) },
        { eventName: "MESSAGE_RECEIVED", handler: (messageId, type) => note({ kind: "rendered", messageId: Number(messageId), type: String(type) }) },
      ]),
    ];
  };

  const read = (): ToolTurnReport => summarizeToolTurns(events, boundariesSince(manager, startBoundary), manager.getTalkState().decisions.length - startDecisions);

  return { start, stop, read };
};

export const registerToolTurnProbe = (manager: RuntimeManager) => {
  globalThis.storyOrchestratorToolTurnProbe = createToolTurnProbe(manager);
};
