import { forceActivateEntries, getContext, getScannableEntries, settingsReady, willAddUserMessage } from "@services/STAPI";
import { LoreSelector } from "../loreSelect";
import type { JudgeRuntime } from "../judge";
import { runtimeManager } from "../runtimeManager";
import { isQuietType, type GenerationLifecycle } from "../generationLifecycle";
import { loreEvidence } from "../worldInfoEvidence";
import { startLoreEvidence } from "../worldInfoEvidenceHost";
import { startSamplerOverlay } from "../samplerOverlayHost";
import { startScanGating } from "../worldInfoScanHost";
import type { Disposers, WindowAccess } from "./types";
import { log } from "@utils/log";

const chatId = () => getContext().chatId ?? null;

const innermostType = (generation: GenerationLifecycle) => {
  const open = generation.snapshot();
  return open.nested.length ? open.nested[open.nested.length - 1] : open.outermost?.type ?? null;
};

const startGating = (disposers: Disposers) => {
  let scanGating: ReturnType<typeof startScanGating> | null = null;
  let scanGatingDisposed = false;
  void settingsReady().then(() => {
    if (scanGatingDisposed || scanGating) return;
    scanGating = startScanGating({
      chatId,
      ownedChat: () => runtimeManager.getRunContext().claimedChat ?? null,
      story: () => runtimeManager.getStory(),
      path: () => runtimeManager.getEngineState()?.visitedPath ?? [],
      mirrorBook: () => runtimeManager.getMirrorBook(),
      ownership: runtimeManager.getOwnership(),
      journal: (summary, note) => runtimeManager.noteRecap(summary, note, "lore"),
      notify: () => runtimeManager.notify(),
    });
  });
  disposers.push(() => { scanGatingDisposed = true; scanGating?.dispose(); scanGating = null; });
  return { reassert: () => scanGating?.reassert() };
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
    notify: () => runtimeManager.notify(),
  });
  disposers.push(() => loreWatch.dispose());
  disposers.push(startSamplerOverlay({ chatId, generation: () => generation.snapshot(), journal: (summary, note) => runtimeManager.noteRecap(summary, note) }));
  globalThis.storyOrchestratorLoreEvidence = loreEvidence;
  const scanGating = startGating(disposers);

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
