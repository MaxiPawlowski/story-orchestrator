import {
  clearStoryExtensionPrompt,
  countTokens,
  getContext,
  noteHostSettingsLoaded,
  profileExists,
  readExtensionPromptBlocks,
  readPromptBudget,
  setStoryExtensionPrompt,
  subscribeToHostEvents,
  tokenizerIdentity,
  EXTENSION_SETTINGS_LOADED_EVENT,
  type HostSubscriptionEntry,
} from "@services/STAPI";
import { runtimeManager } from "../runtimeManager";
import { withholds, type GenerationIntent, type GenerationLifecycle } from "../generationLifecycle";
import { generationWatch } from "../generationWatch";
import { promptCost } from "../promptCost";
import { attachPromptBuckets } from "../promptBucketsHost";
import { roleHealth } from "../roleHealth";
import { modelCallLog } from "../modelCallLog";
import { spikeSeams } from "../spikeSeams";
import { awayNoticeLine, createAwayNotice } from "../awayNotice";
import type { LoreWiring } from "./lore";
import type { Disposers, LiveParts } from "./types";

const awayNotice = createAwayNotice({
  line: () => awayNoticeLine(runtimeManager.getStory(), runtimeManager.getEngineState()?.blackboard.values ?? {}, getContext().chat ?? []),
  set: setStoryExtensionPrompt,
  clear: clearStoryExtensionPrompt,
});

type IntentOf<K extends GenerationIntent["kind"]> = Extract<GenerationIntent, { kind: K }>;

const intentHandlers = (live: LiveParts, lore: LoreWiring) => ({
  opened: (intent: IntentOf<"opened">) => {
    lore.loreWatch.opened(intent.type);
    runtimeManager.onGenerationStarted(intent.type);
    awayNotice.opened(intent.type);
    runtimeManager.capturePayload("generation", intent.type);
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
    awayNotice.closed();
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
  disposers.push(modelCallLog.attach((record) => runtimeManager.recordModelCall(record)));
  disposers.push(attachPromptBuckets(() => runtimeManager.notify()));
  disposers.push(promptCost.attach({
    count: countTokens, budget: readPromptBudget, notify: () => runtimeManager.notify(), busy: () => generation.snapshot().outermost !== null, tokenizer: tokenizerIdentity,
  }));
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
    lore.storyLore.reassert();
    apply(generation.started(args, chatLastId() + 1));
    await lore.onGenerationStarted(typeof args[0] === "string" ? args[0] : undefined, args[1] as Record<string, unknown> | undefined, args[2] === true);
  };
  const wrapper = { type: null as unknown };
  const entries: HostSubscriptionEntry[] = [
    {
      eventName: "GROUP_MEMBER_DRAFTED",
      handler: async (characterId) => {
        generation.drafted(characterId);
        if (!withholds(wrapper.type)) await runtimeManager.prepareDraftedBeat(characterId as number | [number]).catch(() => undefined);
        runtimeManager.onMemberDrafted(characterId as number | [number]);
      },
    },
    { eventName: "GENERATION_STARTED", handler: onStarted },
    { eventName: "MESSAGE_SENT", handler: () => lore.onMessageSent() },
    { eventName: "GENERATION_ENDED", handler: (...args: unknown[]) => { live.loudGate.release(); apply(generation.ended(args)); } },
    { eventName: "GENERATION_STOPPED", handler: (...args: unknown[]) => { live.loudGate.release(); live.talk?.onGenerationStopped(); apply(generation.stopped(args)); } },
    { eventName: "MESSAGE_RECEIVED", handler: (messageId, type) => { live.loudGate.release(); apply(generation.rendered(messageId, type)); } },
    { eventName: "CHARACTER_MESSAGE_RENDERED", handler: (messageId, type) => { live.loudGate.release(); apply(generation.rendered(messageId, type)); } },
    { eventName: "CHAT_CHANGED", handler: () => { live.loudGate.release(); apply(generation.chatChanged()); } },
    {
      eventName: "GROUP_WRAPPER_STARTED",
      handler: (payload) => {
        wrapper.type = (payload as Record<string, unknown> | undefined)?.type ?? null;
        live.talk?.onWrapperStarted(payload as Record<string, unknown> | undefined);
      },
    },
    {
      eventName: "GROUP_WRAPPER_FINISHED",
      handler: () => { wrapper.type = null; live.loudGate.release(); apply(generation.wrapperFinished()); void live.talk?.onWrapperFinished(); },
    },
    { eventName: EXTENSION_SETTINGS_LOADED_EVENT, handler: () => { noteHostSettingsLoaded(); startupLoad(); } },
  ];
  return subscribeToHostEvents(entries);
};
