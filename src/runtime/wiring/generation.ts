import {
  countTokens,
  noteHostSettingsLoaded,
  profileExists,
  readExtensionPromptBlocks,
  readPromptBudget,
  subscribeToHostEvents,
  EXTENSION_SETTINGS_LOADED_EVENT,
  type HostSubscriptionEntry,
} from "@services/STAPI";
import { runtimeManager } from "../runtimeManager";
import type { GenerationIntent, GenerationLifecycle } from "../generationLifecycle";
import { generationWatch } from "../generationWatch";
import { promptCost } from "../promptCost";
import { attachPromptBuckets } from "../promptBucketsHost";
import { roleHealth } from "../roleHealth";
import { spikeSeams } from "../spikeSeams";
import type { LoreWiring } from "./lore";
import type { Disposers, LiveParts } from "./types";

type IntentOf<K extends GenerationIntent["kind"]> = Extract<GenerationIntent, { kind: K }>;

const intentHandlers = (live: LiveParts, lore: LoreWiring) => ({
  opened: (intent: IntentOf<"opened">) => {
    lore.loreWatch.opened(intent.type);
    runtimeManager.onGenerationStarted(intent.type);
    runtimeManager.capturePayload();
    live.talk?.onGenerationStarted(intent.params);
  },
  nested: (intent: IntentOf<"nested">) => {
    if (intent.withholds) {
      runtimeManager.onGenerationStarted(intent.type);
      return;
    }
    runtimeManager.capturePayload();
    live.talk?.onGenerationStarted(intent.params);
  },
  reapply: (intent: IntentOf<"reapply">) => {
    runtimeManager.clearPrivateInjection();
    if (intent.chid !== null) runtimeManager.onMemberDrafted(intent.chid);
  },
  closed: (intent: IntentOf<"closed">) => {
    if (intent.reason !== "chat-changed") {
      runtimeManager.clearPrivateInjection();
      runtimeManager.clearCopilotNudge();
    }
    live.talk?.onGenerationEnded();
  },
  settled: (intent: IntentOf<"settled">) => {
    runtimeManager.commitContinuityNote(intent.rendered);
    lore.loreWatch.settled(intent.rendered);
  },
});

const dispatch = (handlers: ReturnType<typeof intentHandlers>, intent: GenerationIntent) => {
  switch (intent.kind) {
    case "opened": return handlers.opened(intent);
    case "nested": return handlers.nested(intent);
    case "reapply": return handlers.reapply(intent);
    case "closed": return handlers.closed(intent);
    default: return handlers.settled(intent);
  }
};

export const attachGenerationObservers = (live: LiveParts, disposers: Disposers, generation: GenerationLifecycle) => {
  disposers.push(generationWatch.attach(() => generation.snapshot().openedCount));
  disposers.push(roleHealth.attach({
    settings: () => runtimeManager.getExtractionSettings(),
    exists: profileExists,
    health: (id) => live.scheduler?.profileHealth(id) ?? null,
    notify: () => runtimeManager.notify(),
  }));
  disposers.push(attachPromptBuckets(() => runtimeManager.notify()));
  disposers.push(promptCost.attach({ count: countTokens, budget: readPromptBudget, notify: () => runtimeManager.notify(), busy: () => generation.snapshot().outermost !== null }));
  disposers.push(runtimeManager.subscribe(() => {
    const blocks = readExtensionPromptBlocks();
    promptCost.request([...blocks.own, ...blocks.foreign].map((block) => block.value));
  }));
};

export const subscribeGenerationEvents = (live: LiveParts, generation: GenerationLifecycle, lore: LoreWiring, chatLastId: () => number, startupLoad: () => void) => {
  const handlers = intentHandlers(live, lore);
  const apply = (intents: GenerationIntent[]) => intents.forEach((intent) => {
    spikeSeams.generation?.(intent);
    dispatch(handlers, intent);
  });
  const onStarted = async (...args: unknown[]) => {
    lore.loreWatch.reassert();
    lore.scanGating.reassert();
    apply(generation.started(args, chatLastId() + 1));
    await lore.onGenerationStarted(typeof args[0] === "string" ? args[0] : undefined, args[1] as Record<string, unknown> | undefined, args[2] === true);
  };
  const entries: HostSubscriptionEntry[] = [
    { eventName: "GROUP_MEMBER_DRAFTED", handler: (characterId) => { generation.drafted(characterId); runtimeManager.onMemberDrafted(characterId as number | [number]); } },
    { eventName: "GENERATION_STARTED", handler: onStarted },
    { eventName: "MESSAGE_SENT", handler: () => lore.onMessageSent() },
    { eventName: "GENERATION_ENDED", handler: (...args: unknown[]) => apply(generation.ended(args)) },
    { eventName: "GENERATION_STOPPED", handler: (...args: unknown[]) => apply(generation.stopped(args)) },
    { eventName: "MESSAGE_RECEIVED", handler: (messageId, type) => apply(generation.rendered(messageId, type)) },
    { eventName: "CHARACTER_MESSAGE_RENDERED", handler: (messageId, type) => apply(generation.rendered(messageId, type)) },
    { eventName: "CHAT_CHANGED", handler: () => apply(generation.chatChanged()) },
    { eventName: "GROUP_WRAPPER_STARTED", handler: (payload) => live.talk?.onWrapperStarted(payload as Record<string, unknown> | undefined) },
    { eventName: "GROUP_WRAPPER_FINISHED", handler: () => { apply(generation.wrapperFinished()); void live.talk?.onWrapperFinished(); } },
    { eventName: EXTENSION_SETTINGS_LOADED_EVENT, handler: () => { noteHostSettingsLoaded(); startupLoad(); } },
  ];
  return subscribeToHostEvents(entries);
};
