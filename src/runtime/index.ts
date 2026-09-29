import { getChatWindow } from "@extraction/index";
import {
  clearStoryExtensionPrompt, getContext, noteHostSettingsLoaded, setStoryExtensionPrompt, settingsReady, startSaveWatcherSurface, subscribeToHostEvents,
} from "@services/STAPI";
import { registerRuntimeMacros } from "./macros";
import { startMirrorReaper } from "./mirrorReaperHost";
import { runtimeManager } from "./runtimeManager";
import { registerSlashCommands } from "./slashCommands";
import { DIRECTOR_WINDOW_MESSAGES } from "./talkControl";
import { GenerationLifecycle } from "./generationLifecycle";
import { isTurnMessageType, TurnBridge } from "./turnBridge";
import { RequirementsWatch } from "./requirementsWatch";
import { currentChat, loadAtStartup } from "./chatIdentity";
import { journalSettingsWrite, onSettingsWrite, scopeToOpenChat, type SettingsWrite } from "./librarySave";
import { onChatWrite } from "./persistence";
import { onWizardSessionSave } from "./wizardSessions";
import { startScheduler } from "./wiring/scheduler";
import { startJudge, startScene } from "./wiring/judgeScene";
import { startLore } from "./wiring/lore";
import { startTalk } from "./wiring/talk";
import { attachGenerationObservers, subscribeGenerationEvents } from "./wiring/generation";
import { refreshSpikes, stopSpikes } from "./wiring/spikes";
import { publishSpikeDebug } from "./spikeDebug";
import type { Disposers, LiveParts, WindowAccess } from "./wiring/types";
import { log } from "@utils/log";
import { readGatingModeWith } from "./worldInfoMode";
import { getGlobalSettings } from "./settingsStore";

let started = false;
let bridge: TurnBridge | null = null;
let slashRegistered = false;
let privateInjectionUnsub: (() => void) | null = null;
const live: LiveParts = { scheduler: null, scene: null, talk: null, typedJudge: null };
// Every subscription startRuntime makes, so stopRuntime can undo it. Without this a
// stop/start cycle left the previous run listening, and each boundary dispatched twice — once into
// live wiring and once into a scheduler and scene coordinator that had already been torn down.
const runtimeDisposers: Disposers = [];

const startupLoad = () => loadAtStartup({ load: () => runtimeManager.loadSelectedFromChat(), ownership: () => runtimeManager.getOwnership(), loaded: (chat) => bridge?.noteLoaded(chat) });

const registerSlashCommandsWhenReady = (attempt = 0) => {
  if (slashRegistered) return;
  try {
    slashRegistered = registerSlashCommands(runtimeManager);
  } catch (error) {
    log.warn("slash command registration failed", error);
  }
  if (!slashRegistered && attempt < 100) window.setTimeout(() => registerSlashCommandsWhenReady(attempt + 1), 100);
};

const spikePort = () => ({
  flags: () => getGlobalSettings().spikes,
  chatId: () => getContext().chatId ?? null,
  storyId: () => runtimeManager.getStory()?.id ?? null,
  boundary: () => runtimeManager.getEngineState()?.boundary ?? null,
  raw: () => runtimeManager.getPlayedStoryRaw(),
  story: () => runtimeManager.getStory(),
  log: () => runtimeManager.getBoundaryLog(),
  shape: () => runtimeManager.getSnapshot().pacing.shapeOverride ?? null,
  prompt: {
    set: (key: string, text: string, depth: number) => { setStoryExtensionPrompt(key, text, depth); },
    clear: (key: string) => { clearStoryExtensionPrompt(key); },
  },
});

const registerHostSurfaces = () => {
  // A build with no MacrosParser throws on the first registration, and this call sits
  // in the middle of startRuntime: unguarded, a missing macro engine would take the bridge, the judge,
  // lore selection and speaker direction down with it. The capability report is where it is shown.
  try {
    runtimeDisposers.push(registerRuntimeMacros(runtimeManager));
  } catch (error) {
    log.warn("host macros unavailable; {{story_*}} will not resolve", error);
  }
  if (__SO_DEV__) void import("./liveSuite").then(({ registerLiveSuite }) => { if (started) registerLiveSuite(runtimeManager); });
  if (__SO_DEV__) void import("./spikes/toolTurnProbe").then(({ registerToolTurnProbe }) => { if (started) registerToolTurnProbe(runtimeManager); });
  if (__SO_DEV__) void import("./spikes/sp5ScenarioHost").then(({ registerScenarioSpike }) => { if (started) runtimeDisposers.push(registerScenarioSpike()); });
  if (__SO_DEV__) void import("./spikes/install").then(({ installSpikes }) => {
    if (!started) return;
    let unpublish = () => {};
    runtimeDisposers.push(installSpikes(spikePort(), (debug) => {
      unpublish();
      unpublish = debug ? publishSpikeDebug(debug) : () => {};
    }));
  });
  window.setTimeout(() => registerSlashCommandsWhenReady(), 0);
  window.setTimeout(() => registerSlashCommandsWhenReady(), 1000);
};

const startWatches = () => {
  bridge = new TurnBridge(runtimeManager, runtimeManager.chatSave);
  bridge.start();
  if (__SO_DEV__) void import("./spikes").then(({ installSpikes }) => { if (started && bridge) runtimeDisposers.push(installSpikes(bridge, runtimeManager)); });
  const requirementsWatch = new RequirementsWatch(runtimeManager.requirementsHost, subscribeToHostEvents);
  requirementsWatch.start();
  runtimeDisposers.push(() => requirementsWatch.stop());
  runtimeDisposers.push(startMirrorReaper(() => runtimeManager.notify()));
  runtimeDisposers.push(onChatWrite((write) => void runtimeManager.chatSave.recordWrite(write)));
  const journalInstallWrite = (save: SettingsWrite) => void journalSettingsWrite(
    save.summary,
    save.label,
    save.evidence,
    scopeToOpenChat(currentChat),
    (summary, note) => runtimeManager.noteRecap(summary, note),
  );
  runtimeDisposers.push(onWizardSessionSave(journalInstallWrite));
  runtimeDisposers.push(onSettingsWrite(journalInstallWrite));
};

const windowAccess = (): WindowAccess => {
  const chatLastId = () => (Array.isArray(getContext().chat) ? getContext().chat.length - 1 : -1);
  const recentWindow = () => {
    const chat = Array.isArray(getContext().chat) ? getContext().chat : [];
    return getChatWindow(Math.max(0, chat.length - DIRECTOR_WINDOW_MESSAGES)).messages.map((message) => ({ speaker: message.speaker, text: message.text }));
  };
  return { chatLastId, recentWindow };
};

export const RUNTIME_GLOBALS = [
  "storyOrchestratorScheduler", "storyOrchestratorLoreEvidence", "storyOrchestratorLore", "storyOrchestratorJudge",
  "storyOrchestratorLiveSuite", "storyOrchestratorScanGating", "storyOrchestratorToolTurnProbe",
  "storyOrchestratorSpikes", "storyOrchestratorWitness",
] as const;

export function startRuntime() {
  if (started) return runtimeManager;
  started = true;
  runtimeDisposers.push(startSaveWatcherSurface());
  runtimeDisposers.push(readGatingModeWith(() => getGlobalSettings().worldInfo.gatingMode));
  startScheduler(live, runtimeDisposers);
  registerHostSurfaces();
  startWatches();
  const access = windowAccess();
  if (__SO_DEV__) globalThis.storyOrchestratorScheduler = { nextReadWindow: () => live.scheduler?.nextReadWindow(access.chatLastId()) ?? null };
  const judgeRuntime = startJudge(live, access);
  if (__SO_DEV__) void import("./judgeHarness").then(({ createJudgeHarness }) => {
    if (started && runtimeManager.getJudge() === judgeRuntime) globalThis.storyOrchestratorJudge = createJudgeHarness(judgeRuntime);
  });
  startScene(live, runtimeDisposers, judgeRuntime, access);
  const generation = new GenerationLifecycle(isTurnMessageType);
  const lore = startLore(runtimeDisposers, judgeRuntime, generation, access);
  startTalk(live, judgeRuntime, access, lore.onIntercept);
  attachGenerationObservers(live, runtimeDisposers, generation);
  privateInjectionUnsub = subscribeGenerationEvents(live, generation, lore, access.chatLastId, () => void startupLoad());
  // Versioned settings (loaded synchronously from a cache) are already in place,
  // so the gate opens now and the chat loads now; a page still fetching them opens it on the event.
  // Either way the load happens exactly once, because the gate resolves once.
  if (__SO_DEV__) publishSpikeDebug({ refresh: refreshSpikes });
  void settingsReady().then(() => {
    if (typeof document !== "undefined" && typeof getContext().eventSource?.on === "function") {
      void import("../image/start").then(({ startImage }) => { if (started) startImage(runtimeManager); });
    }
    void refreshSpikes();
    if (runtimeManager.getSnapshot().ready) return;
    noteHostSettingsLoaded?.();
    void startupLoad();
  });
  return runtimeManager;
}

export function stopRuntime() {
  if (typeof document !== "undefined") void import("../image/start").then(({ stopImage }) => stopImage());
  bridge?.stop();
  bridge = null;
  runtimeManager.invalidateRuns();
  privateInjectionUnsub?.();
  privateInjectionUnsub = null;
  // Each one try/caught: a listener that throws on disposal must not strand the ones after it
  // still registered, which would leave exactly the double-dispatch this is here to prevent.
  for (const dispose of runtimeDisposers.splice(0)) {
    try {
      dispose();
    } catch (error) {
      log.warn("a runtime subscription failed to dispose", error);
    }
  }
  live.scheduler = null;
  live.talk = null;
  live.scene = null;
  live.typedJudge = null;
  stopSpikes();
  globalThis.storyOrchestratorToolTurnProbe?.stop();
  globalThis.talkControlInterceptor = () => undefined;
  for (const name of RUNTIME_GLOBALS) Reflect.deleteProperty(globalThis, name);
  started = false;
}

export { runtimeManager };
export type { RuntimeManager } from "./runtimeManager";
