import { draftedCardName, forceActivateEntries, getContext, getScannableEntries, readScanBuffer, settingsReady, willAddUserMessage } from "@services/STAPI";
import { transcriptCopiersOn } from "@services/stHost/transcriptCopiers";
import { readCopiersWith } from "../transcriptCopiers";
import { extensionConflictsWith } from "@services/stHost/extensionConflicts";
import { readExtensionConflictsWith } from "../extensionConflicts";
import { LoreSelector } from "../loreSelect";
import { loreSelectTiming, type LoreSelectTrigger } from "../loreSelectTiming";
import type { JudgeRuntime } from "../judge";
import { runtimeManager } from "../runtimeManager";
import { withholds, type GenerationLifecycle } from "../generationLifecycle";
import { loreEvidence } from "../worldInfoEvidence";
import { startLoreEvidence } from "../worldInfoEvidenceHost";
import { startSamplerOverlay } from "../samplerOverlayHost";
import { startScanGating } from "../worldInfoScanHost";
import { startStoryLore } from "../storyLoreHost";
import { stagedPath } from "../worldInfoGates";
import type { Disposers, WindowAccess } from "./types";
import { log } from "@utils/log";

const chatId = () => getContext().chatId ?? null;

const innermostType = (generation: GenerationLifecycle) => {
  const open = generation.snapshot();
  return open.nested.length ? open.nested[open.nested.length - 1] : open.outermost?.type ?? null;
};

const startGating = (disposers: Disposers, exclusive: Parameters<typeof startScanGating>[0]["exclusive"]) => {
  let scanGating: ReturnType<typeof startScanGating> | null = null;
  let scanGatingDisposed = false;
  void settingsReady().then(() => {
    if (scanGatingDisposed || scanGating) return;
    scanGating = startScanGating({
      chatId,
      ownedChat: () => runtimeManager.getLoadedChatId(),
      story: () => runtimeManager.getStory(),
      path: () => runtimeManager.getEngineState()?.visitedPath ?? [],
      filePath: () => {
        const state = runtimeManager.getEngineState();
        return state ? stagedPath(state.visitedPath, state.stagedFrom) : [];
      },
      values: () => runtimeManager.getEngineState()?.blackboard.values ?? {},
      mirrorBook: () => runtimeManager.getMirrorBook(),
      exclusive,
      ownership: runtimeManager.getOwnership(),
      journal: (summary, note) => runtimeManager.noteRecap(summary, note, "lore"),
      notify: () => runtimeManager.notify(),
    });
  });
  disposers.push(() => { scanGatingDisposed = true; scanGating?.dispose(); scanGating = null; });
  return { reassert: () => scanGating?.reassert() };
};

const startReplyEffort = (disposers: Disposers, generation: GenerationLifecycle) => {
  let stop: (() => void) | null = null;
  let disposed = false;
  disposers.push(() => { disposed = true; stop?.(); stop = null; });
  void import("../replyEffortLive").then(({ startLiveReplyEffort }) => {
    if (!disposed) stop = startLiveReplyEffort(generation);
  });
  void import("../cardOverlayHost").then(({ startCardOverlay }) => {
    if (!disposed) disposers.push(startCardOverlay(runtimeManager));
  });
  void import("../briefingDraftHost").then(({ startBriefingDraft }) => {
    if (!disposed) disposers.push(startBriefingDraft(runtimeManager));
  });
  void import("../replyContextHost").then(({ startReplyContext }) => {
    if (!disposed) disposers.push(startReplyContext());
  });
};

export const startLore = (disposers: Disposers, judgeRuntime: JudgeRuntime, generation: GenerationLifecycle, { chatLastId, recentWindow }: WindowAccess) => {
  const lore = new LoreSelector({
    judge: () => judgeRuntime,
    getStory: () => runtimeManager.getStory(),
    getState: () => runtimeManager.getEngineState(),
    getWindow: recentWindow,
    getChatId: chatId,
    getLastMessageId: chatLastId,
    getEntries: getScannableEntries,
    force: forceActivateEntries,
    getScanBuffer: readScanBuffer,
    getDrafted: draftedCardName,
    ownership: runtimeManager.getOwnership(),
  });
  globalThis.storyOrchestratorLore = { selector: lore, willAddUserMessage };
  const loreWatch = startLoreEvidence({
    chatId,
    context: () => runtimeManager.getRunContext(),
    story: () => runtimeManager.getStory(),
    state: () => runtimeManager.getEngineState(),
    mirrorBook: () => runtimeManager.getMirrorBook()?.name ?? null,
    lastMessageId: chatLastId,
    innermostType: () => innermostType(generation),
    journal: (flag) => runtimeManager.noteRecap(flag.summary, flag.detail, "lore"),
    fired: (record) => runtimeManager.recordLoreFired(record),
    notify: () => runtimeManager.notify(),
  });
  disposers.push(() => loreWatch.dispose());
  disposers.push(startSamplerOverlay({ chatId, generation: () => generation.snapshot(), journal: (summary, note) => runtimeManager.noteRecap(summary, note) }));
  startReplyEffort(disposers, generation);
  globalThis.storyOrchestratorLoreEvidence = loreEvidence;
  const storyLore = startStoryLore({ chatId, ownedChat: () => runtimeManager.getLoadedChatId(), story: () => runtimeManager.getStory() });
  disposers.push(storyLore.dispose);
  disposers.push(readCopiersWith(() => transcriptCopiersOn(getContext().extensionSettings)));
  disposers.push(readExtensionConflictsWith(() => {
    const context = getContext();
    return extensionConflictsWith({
      settings: context.extensionSettings,
      manifest: context.getExtensionManifest,
      storage: (key) => globalThis.localStorage?.getItem(key) ?? null,
    });
  }));
  const scanGating = startGating(disposers, {
    useActive: () => judgeRuntime.active("loreExclusive"),
    messageId: chatLastId,
    loud: () => generation.snapshot().outermost !== null && !withholds(innermostType(generation)),
    selection: () => lore.completeSelection(),
  });

  const select = (trigger: LoreSelectTrigger, generationType?: string) => lore.select(trigger, generationType)
    .then((selection) => { if (selection) loreWatch.forced(selection.picks); })
    .catch((error) => log.warn("lore-select failed", error));
  const { onGenerationStarted, onIntercept, onMessageSent } = loreSelectTiming({ active: () => lore.active(), willAddUserMessage, select });
  return { loreWatch, scanGating, storyLore, onGenerationStarted, onIntercept, onMessageSent };
};

export type LoreWiring = ReturnType<typeof startLore>;
