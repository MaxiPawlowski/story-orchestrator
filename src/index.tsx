import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from "react";
import {
  bindNavbarDrawerToggle, readProfileContextLimit, readProfilePresetName, showConfirmPopup, subscribeToHostEvents, toggleNavbarDrawer,
} from "@services/STAPI";
import { contextLimitInvalidators, createContextLimitCache } from "@runtime/contextLimitCache";
import packageJson from "../package.json";
import { getGlobalSettings } from "@runtime/settingsStore";
import SettingsPanel, { type SettingsHost } from "./components/settings/SettingsPanel";
import { DEFAULT_MAX_TOKENS, inputBudget } from "@extraction/index";
import { startRuntime, stopRuntime } from "@runtime/index";
import { createMountRegistry } from "@utils/mountRegistry";
import { loadPersistedRuntime } from "@runtime/persistence";
import { branchFromOldest, continueFromBranch } from "@runtime/chatIdentity";
import { jumpToMessage } from "@runtime/messageJumpHost";
import type { RuntimeSnapshot, StoryLibraryRecord } from "@runtime/types";
import type { StudioOpenIntent } from "./studio/StudioModal";
import type { WizardHost } from "./studio/components/StudioCopilot";
import { type DriverController } from "@components/drawer/DriverPanel";
import DrawerTabs from "./components/drawer/DrawerTabs";
import HudStrip from "./components/drawer/HudStrip";
import BranchNotice from "./components/drawer/BranchNotice";
import { setDiagnosticsContext, useDraftStore, type StoryDraft } from "./studio/draft";
import { buildReplaySource, type GateReplaySource } from "./studio/gateReplay";
import "./styles.css";

// The version the settings panel reports is the one this bundle was built from.
const EXTENSION_VERSION = String(packageJson.version ?? "unknown");

const manager = startRuntime();
const ui = createMountRegistry();

const contextLimits = createContextLimitCache({ limit: readProfileContextLimit, presetOf: readProfilePresetName });
ui.add(subscribeToHostEvents(contextLimitInvalidators(contextLimits)));

const memoryModelLimit = (profileId: string | null) => {
  const limit = contextLimits.read(profileId);
  return { ...limit, inputBudget: inputBudget(limit, DEFAULT_MAX_TOKENS).input };
};

if (__SO_DEV__) {
  ui.global("storyOrchestratorRuntime", manager);
  ui.global("storyOrchestratorStudioDraft", useDraftStore);
  void import("./studio/StudioModal").then(({ STUDIO_TAB_IDS }) => ui.global("storyOrchestratorStudioTabs", STUDIO_TAB_IDS));
}

// One Studio for the whole extension: the settings panel and the drawer's author view are separate
// React roots, so the modal lives in its own root with a module-level open flag both can flip.
const studioListeners = new Set<() => void>();
let studioOpen = false;
let studioIntent: StudioOpenIntent | undefined;
const setStudioOpen = (next: boolean, intent?: StudioOpenIntent) => {
  studioOpen = next;
  studioIntent = next ? intent : undefined;
  studioListeners.forEach((listener) => listener());
};

const openStudio = async (intent?: StudioOpenIntent) => {
  const snapshot = manager.getSnapshot();
  const active = snapshot.library.find((story) => story.id === snapshot.storyId);
  const source = (active?.raw ?? manager.getPlayedStoryRaw()) as StoryDraft | null;
  const store = useDraftStore.getState();
  const resumable = store.dirty && store.sourceHash === (active?.hash ?? null);
  const resume = resumable && (await showConfirmPopup("You have an unsaved Studio draft for this story. Resume it?", { okButton: "Resume draft", cancelButton: "Start fresh" }));
  if (!resume) {
    if (source) store.loadDraft(source, active?.hash ?? null);
    else store.newDraft();
  }
  setDiagnosticsContext({ worldInfoGating: getGlobalSettings().worldInfo.gatingMode });
  setStudioOpen(true, intent);
};

// A brand-new story: the wizard starts from an empty draft, never from whatever this chat plays.
const openWizard = async () => {
  if (useDraftStore.getState().dirty && !(await showConfirmPopup("Start a new story? Your unsaved Studio draft will be discarded.", { okButton: "New story", cancelButton: "Keep editing" }))) return;
  useDraftStore.getState().newDraft();
  setDiagnosticsContext({ worldInfoGating: getGlobalSettings().worldInfo.gatingMode });
  setStudioOpen(true, { tab: "copilot", stage: "qualities" });
};

// "Fix with wizard": the unmet requirements are the premise, so the author lands on the
// provisioning stage already knowing what is missing instead of re-describing it.
const openWizardForRequirements = async () => {
  const { requirements } = manager.getSnapshot();
  await openStudio({
    tab: "copilot",
    stage: "provisioning",
    missing: { personas: requirements.missingPersonas, members: requirements.missingMembers, lorebooks: requirements.missingLorebooks },
  });
};

const wizardHost: WizardHost = {
  environment: (draft) => manager.getProvisioningEnvironment(draft),
  applyProvisioning: (op, draft) => manager.applyProvisioning(op, draft),
  readEntry: (lorebook, comment) => manager.readProvisioningEntry(lorebook, comment),
  loadSession: (key) => manager.getWizardSession(key),
  saveSession: (session) => manager.saveWizardSession(session),
};

// Saving from the chat that is playing this story is the one automatic library→chat path
// (spec addendum §Story identity); every other chat keeps its pinned copy.
// The chat half of one save vocabulary. The library half is the Studio's; this returns
// only what happened HERE, so the two events never read as one sentence.
const applySavedStory = async (record: StoryLibraryRecord): Promise<string | null> => {
  if (manager.getSnapshot().storyId !== record.id) return null;
  const outcome = await manager.applyStoryUpdate(record);
  if (outcome.applied) return outcome.choice === "restart" ? "this chat restarted on the new version" : "this chat is playing the new version now";
  return outcome.reason ? `this chat kept its version — ${outcome.reason}` : null;
};

const readReplaySource = (): GateReplaySource | null => {
  const storyId = manager.getSnapshot().storyId;
  const source = buildReplaySource(storyId, manager.getStory(), storyId ? loadPersistedRuntime(storyId)?.engineHistory ?? null : null);
  return source ? { ...source, jump: (messageId) => void jumpFromDrawer(messageId) } : null;
};

const StudioModal = lazy(() => import("./studio/StudioModal"));
const ImageChatPanel = lazy(() => import("./image/ImageChatPanel"));

const StudioHost = () => {
  const open = useSyncExternalStore(
    (listener) => { studioListeners.add(listener); return () => { studioListeners.delete(listener); }; },
    () => studioOpen,
  );
  const snapshot = useRuntimeSnapshot();
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <StudioModal
        onClose={() => setStudioOpen(false)}
        copilotEnabled={snapshot.copilot.enabled}
        runCopilotStage={(input) => manager.runCopilotStage(input)}
        runAgentTurn={(session, draft) => manager.runWizardAgentTurn({ session, draft })}
        onSaved={applySavedStory}
        wizardHost={wizardHost}
        intent={studioIntent}
        replay={studioIntent?.fromChat ? readReplaySource() : null}
      />
    </Suspense>
  );
};

const driverController: DriverController = {
  suggest: () => manager.runCopilotSuggest(),
  nudge: (text) => manager.setCopilotNudge(text),
  clearNudge: () => manager.clearCopilotNudge(),
  probe: async () => { await manager.runExtractionNow(undefined, "probe"); },
  advance: async (checkpointId) => { await manager.activateCheckpoint(checkpointId); },
  report: () => manager.runCopilotReport(),
  stepBack: () => manager.stepBackTransition(),
  resetQuality: async (key) => { await manager.resetQuality(key); },
};

const useRuntimeSnapshot = () => {
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot>(() => manager.getCachedSnapshot());
  useEffect(() => {
    const unsubscribe = manager.subscribe(() => setSnapshot(manager.getCachedSnapshot()));
    return () => { unsubscribe(); };
  }, []);
  return snapshot;
};

const settingsHost: SettingsHost = {
  extensionVersion: EXTENSION_VERSION,
  memoryModelLimit,
  recheckMemoryModel: () => contextLimits.invalidate(),
  openWizard: () => void openWizard(),
  openStudio: () => void openStudio(),
  openWizardForRequirements: () => void openWizardForRequirements(),
  revealSetting: (id) => revealSetting(id),
  openDrawer: () => openSoDrawer(),
};

const SettingsRoot = () => <SettingsPanel snapshot={useRuntimeSnapshot()} manager={manager} host={settingsHost} />;

// Turning author view on is a one-way look behind the curtain for this chat: gates, future
// checkpoints and what the cast is hiding. Confirm before spoiling a story you may not have
// written (unresolved question, resolved yes).
const toggleAuthorView = async (next: boolean) => {
  if (next) {
    const ok = await showConfirmPopup(
      "Author view shows gates, upcoming checkpoints and what characters are hiding. That will spoil this story for you as a player. Show it anyway?",
      { okButton: "Show author view", cancelButton: "Keep playing" },
    );
    if (!ok) return;
  }
  manager.setUiSettings({ authorView: next });
};

// The player's Continue from here, and the author's branch cut at the history floor.
const continueBranch = () => continueFromBranch({ selectStory: (storyId) => manager.selectStory(storyId), note: (summary, detail) => manager.chatSave.note(summary, detail) });
const branchAtFloor = async (messageId: number) => {
  const result = await branchFromOldest(messageId);
  if (!result.ok) window.toastr?.info?.(result.reason, "Story Orchestrator");
};

const DrawerPanel = () => {
  const snapshot = useRuntimeSnapshot();
  const branch = snapshot.chatIdentity?.kind === "branch" ? snapshot.chatIdentity : null;
  return (
    <div className="p-2 text-sm flex flex-col gap-3 text-left">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">{snapshot.storyTitle ?? "Story Orchestrator"}</div>
          {!snapshot.ready && <div className="text-xs opacity-70">Choose a story in Extensions → Story Orchestrator.</div>}
        </div>
        {snapshot.ready && (
          <label className="flex items-center gap-1 text-xs whitespace-nowrap" title="Show gates, blackboard, scheduler and payload debugging. Spoils upcoming story branches.">
            <input id="so-author-view" type="checkbox" checked={snapshot.ui.authorView} onChange={(event) => void toggleAuthorView(event.target.checked)} />
            <span>Author view</span>
          </label>
        )}
      </div>
      {!snapshot.ready && branch && <BranchNotice identity={branch} onContinue={continueBranch} />}
      {snapshot.ready && (
        <DrawerTabs
          snapshot={snapshot}
          manager={manager}
          driver={{ context: snapshot.driver, activeNudge: snapshot.activeNudge, controller: driverController, recovery: snapshot.lastFired }}
          onOpenSettings={openStorySettings}
          onEditStory={() => void openStudio({ fromChat: true })}
          onFixWithWizard={() => void openWizardForRequirements()}
          onOpenRepair={openRepairStep}
          onNewStory={() => void openWizard()}
          onBranchFromOldest={(messageId) => void branchAtFloor(messageId)}
          onJumpToMessage={(messageId) => void jumpFromDrawer(messageId)}
          imagePanel={<Suspense fallback={<div className="text-xs">Loading illustrations…</div>}><ImageChatPanel manager={manager} snapshot={snapshot} /></Suspense>}
        />
      )}
    </div>
  );
};

// On a narrow viewport the drawer covers #chat, so it closes before ST scrolls.
const NARROW_VIEWPORT = 1000;

const jumpFromDrawer = async (messageId: number) => {
  const toggle = document.querySelector<HTMLElement>("#so-drawer .drawer-toggle");
  const content = document.getElementById("drawer-manager");
  if (window.innerWidth <= NARROW_VIEWPORT && toggle && content?.classList.contains("openDrawer")) toggleNavbarDrawer(toggle);
  const result = await jumpToMessage(messageId, manager.getSnapshot().chatJump);
  if (!result.ok) window.toastr?.info?.(result.reason, "Story Orchestrator");
};

const openSoDrawer = () => {
  const toggle = document.querySelector<HTMLElement>("#so-drawer .drawer-toggle");
  const content = document.getElementById("drawer-manager");
  if (toggle && content && !content.classList.contains("openDrawer")) toggleNavbarDrawer(toggle);
};

// The one missing setup step is always in one place (made settings install-wide), so the
// player surface points straight at it instead of describing it: ST's Extensions drawer, then our
// own inline drawer, then scroll it into view.
const openStorySettings = () => {
  const navToggle = document.querySelector<HTMLElement>("#extensions-settings-button .drawer-toggle");
  const navContent = document.getElementById("rm_extensions_block");
  if (navToggle && navContent && !navContent.classList.contains("openDrawer")) toggleNavbarDrawer(navToggle);
  const panel = document.getElementById("story-orchestrator-settings");
  const inlineToggle = panel?.querySelector<HTMLElement>(".inline-drawer-toggle");
  const inlineContent = panel?.querySelector<HTMLElement>(".inline-drawer-content");
  if (inlineToggle && inlineContent && inlineContent.offsetParent === null) inlineToggle.click();
  window.setTimeout(() => panel?.scrollIntoView({ block: "start", behavior: "smooth" }), 100);
};

// Repair names a step; this is how it lands on it. A control that is already in the panel is pointed
// at, never duplicated — two controls that do the same thing is how one of them goes stale.
const revealSetting = (id: string) => {
  const element = document.getElementById(id);
  if (!element) return;
  for (let details = element.closest("details"); details; details = details.parentElement?.closest("details") ?? null) details.open = true;
  element.scrollIntoView({ block: "center", behavior: "smooth" });
  element.classList.add("so-revealed");
  window.setTimeout(() => element.classList.remove("so-revealed"), 2000);
};

// The HUD's needs-setup chip and the drawer's Repair button land ON the Repair step, not just on the
// panel: the panel opens first, then the row is revealed once it is laid out.
const openRepairStep = () => {
  openStorySettings();
  window.setTimeout(() => revealSetting("so-entry-repair"), 250);
};

const HudMount = () => {
  const snapshot = useRuntimeSnapshot();
  return <HudStrip snapshot={snapshot} onOpenDrawer={openSoDrawer} onOpenSettings={openRepairStep} />;
};

const mountTopBarDrawer = () => {
  const holder = document.getElementById("top-settings-holder");
  if (!holder || document.getElementById("so-drawer")) return Boolean(holder);
  const drawer = ui.element(document.createElement("div"));
  drawer.id = "so-drawer";
  drawer.className = "drawer";
  const toggle = document.createElement("div");
  toggle.className = "drawer-toggle drawer-header";
  const icon = document.createElement("div");
  icon.className = "drawer-icon fa-solid fa-route fa-fw closedIcon";
  icon.title = "Story Orchestrator";
  toggle.appendChild(icon);
  const content = document.createElement("div");
  content.id = "drawer-manager";
  content.className = "drawer-content closedDrawer";
  drawer.appendChild(toggle);
  drawer.appendChild(content);
  const rightNav = document.getElementById("rightNavHolder");
  if (rightNav && rightNav.parentElement === holder) holder.insertBefore(drawer, rightNav);
  else holder.appendChild(drawer);
  ui.add(bindNavbarDrawerToggle(toggle));
  ui.root(content, <DrawerPanel />);
  return true;
};

const mountHud = () => {
  const formSheld = document.getElementById("form_sheld");
  if (!formSheld || document.getElementById("so-hud-root")) return Boolean(formSheld);
  const hudRoot = ui.element(document.createElement("div"));
  hudRoot.id = "so-hud-root";
  formSheld.insertBefore(hudRoot, formSheld.firstChild);
  ui.root(hudRoot, <HudMount />);
  return true;
};

const mountStudioHost = () => {
  if (document.getElementById("so-studio-root")) return true;
  const root = ui.element(document.createElement("div"));
  root.id = "so-studio-root";
  document.body.appendChild(root);
  ui.root(root, <StudioHost />);
  return true;
};

const mount = (attempt = 0) => {
  const settingsRootContainer = document.getElementById("extensions_settings");
  if (settingsRootContainer && !document.getElementById("story-orchestrator-settings")) {
    const settingsRootElement = ui.element(document.createElement("div"));
    settingsRootContainer.appendChild(settingsRootElement);
    ui.root(settingsRootElement, <SettingsRoot />);
  }

  const drawerMounted = mountTopBarDrawer();
  const hudMounted = mountHud();
  mountStudioHost();

  if ((!settingsRootContainer || !drawerMounted || !hudMounted) && attempt < 50) {
    ui.timeout(() => mount(attempt + 1), 100);
  }
};

if (document.readyState === "loading") {
  ui.listen(document, "DOMContentLoaded", () => mount(), { once: true });
} else {
  ui.timeout(() => mount(), 0);
}

const stopExtension = () => {
  setStudioOpen(false);
  ui.dispose();
  stopRuntime();
};

if (__SO_DEV__) ui.global("storyOrchestratorStop", stopExtension);
if (__SO_DEV__) void import("@copilot/agent/index").then((agent) => ui.global("storyOrchestratorWizardAgent", agent));
