import { forceActivateEntries, getContext, getScannableEntries, settingsReady, willAddUserMessage } from "@services/STAPI";
import { LoreSelector } from "../loreSelect";
import type { JudgeRuntime } from "../judge";
import { runtimeManager } from "../runtimeManager";
import { getGlobalSettings } from "../settingsStore";
import { isQuietType, withholds, type GenerationLifecycle } from "../generationLifecycle";
import { loreEvidence } from "../worldInfoEvidence";
import { startLoreEvidence } from "../worldInfoEvidenceHost";
import { startSamplerOverlay } from "../samplerOverlayHost";
import { startScanGating } from "../worldInfoScanHost";
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
    ownership: runtimeManager.getOwnership(),
  });
  if (__SO_DEV__) globalThis.storyOrchestratorLore = { selector: lore, willAddUserMessage };
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
  if (__SO_DEV__) globalThis.storyOrchestratorLoreEvidence = loreEvidence;
  const scanGating = startGating(disposers, {
    useActive: () => judgeRuntime.active("loreExclusive"),
    messageId: chatLastId,
    loud: () => generation.snapshot().outermost !== null && !withholds(innermostType(generation)),
    selection: () => lore.completeSelection(),
  });

  let awaitsMessage = false;
  let awaitsIntercept = false;
  const select = (trigger: "MESSAGE_SENT" | "GENERATION_STARTED") => lore.select(trigger)
    .then((selection) => { if (selection) loreWatch.forced(selection.picks); })
    .catch((error) => log.warn("lore-select failed", error));
  const onGenerationStarted = async (type: string | undefined, params: Record<string, unknown> | undefined, dryRun: boolean | undefined) => {
    awaitsMessage = false;
    if (dryRun || isQuietType(type) || params?.quiet_prompt) return;
    awaitsIntercept = false;
    if (!lore.active()) return;
    if (willAddUserMessage(type, params, dryRun)) awaitsMessage = true;
    else awaitsIntercept = true;
  };
  const onIntercept = async (type: string, aborted: boolean) => {
    if (isQuietType(type) || !awaitsIntercept) return;
    awaitsIntercept = false;
    if (!aborted) await select("GENERATION_STARTED");
  };
  const onMessageSent = async () => {
    if (!awaitsMessage) return;
    awaitsMessage = false;
    await select("MESSAGE_SENT");
  };
  return { loreWatch, scanGating, onGenerationStarted, onIntercept, onMessageSent };
};

export type LoreWiring = ReturnType<typeof startLore>;
