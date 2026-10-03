import { useEffect, useState, useSyncExternalStore } from "react";
import { Lazy, LAZY_FAILED_TEXT } from "@components/Lazy";
import { lazyRetry } from "@utils/lazyRetry";
import {
  addGroupMembers, bindNavbarDrawerToggle, currentChatOwner, getAllCharacterNames, listBackgrounds, listPersonas, mountInlineHosts, openGroupMemberList,
  readProfileContextLimit, readProfilePresetName, setGroupMembersDisabled, showConfirmPopup, subscribeToHostEvents, toggleNavbarDrawer,
  type InlineHostSet,
} from "@services/STAPI";
import { contextLimitInvalidators, createContextLimitCache } from "@runtime/contextLimitCache";
import packageJson from "../package.json";
import { getGlobalSettings, setGlobalSettings } from "@runtime/settingsStore";
import SettingsPanel, { type SettingsHost } from "./components/settings/SettingsPanel";
import { DEFAULT_MAX_TOKENS, inputBudget } from "@extraction/index";
import { startRuntime, stopRuntime } from "@runtime/index";
import { createMountRegistry } from "@utils/mountRegistry";
import { loadPersistedRuntime } from "@runtime/persistence";
import { branchFromOldest, continueFromBranch } from "@runtime/chatIdentity";
import { jumpToMessage } from "@runtime/messageJumpHost";
import type { RuntimeSnapshot, StoryLibraryRecord } from "@runtime/types";
import { chatUpdateOutcome, NO_CHAT_OPEN, type ChatSaveAnswer } from "@runtime/librarySave";
import { rekeyWizardSession } from "@runtime/wizardSessions";
import { runCastRepair } from "@runtime/castRepair";
import { provisionableMissing, withoutPersonas, type RepairAction } from "@runtime/repair";
import { saveStoryRecord } from "@runtime/storyLibrary";
import type { WriteResult } from "@utils/writeResult";
import type { StudioOpenIntent } from "./studio/StudioModal";
import type { WizardHost } from "./studio/components/StudioCopilot";
import { type DriverController } from "@components/drawer/DriverPanel";
import DrawerTabs from "./components/drawer/DrawerTabs";
import HudStrip from "./components/drawer/HudStrip";
import BranchNotice from "./components/drawer/BranchNotice";
import type { InlineActions } from "./components/inline/InlineDetail";
import type { StoryDraft } from "./studio/draft";
import { buildReplaySource, type GateReplaySource } from "./studio/gateReplay";
import { HelpButton } from "./components/help/HelpButton";
import BriefingHost from "./components/briefing/BriefingHost";
import { BRIEFING_COPY } from "@features/helpCopy";
import type { FeatureWhere } from "@features/registry";
import "./styles.css";
import { log } from "@utils/log";

const HelpHost = lazyRetry(() => import("./components/help/HelpHost"));

// The version the settings panel reports is the one this bundle was built from.
const EXTENSION_VERSION = String(packageJson.version ?? "unknown");

const manager = startRuntime();
const loadDraft = () => import("./studio/draft");
const ui = createMountRegistry();

const contextLimits = createContextLimitCache({ limit: readProfileContextLimit, presetOf: readProfilePresetName });
ui.add(subscribeToHostEvents(contextLimitInvalidators(contextLimits)));

const memoryModelLimit = (profileId: string | null) => {
  const limit = contextLimits.read(profileId);
  return { ...limit, inputBudget: inputBudget(limit, DEFAULT_MAX_TOKENS).input };
};

if (__SO_DEV__) {
  ui.global("storyOrchestratorRuntime", manager);
  void loadDraft().then(({ useDraftStore }) => ui.global("storyOrchestratorStudioDraft", useDraftStore));
  void import("./studio/StudioModal").then(({ STUDIO_TAB_IDS, WIZARD_AGENT, WIZARD_HARNESS }) => {
    ui.global("storyOrchestratorStudioTabs", STUDIO_TAB_IDS);
    if (__SO_DEV__) ui.global("storyOrchestratorWizardAgent", { ...WIZARD_AGENT, resolveAgentHarness: WIZARD_HARNESS });
  });
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

const studioDiagnostics = () => ({
  worldInfoGating: getGlobalSettings().worldInfo.gatingMode,
  characterNames: getAllCharacterNames,
  backgroundNames: listBackgrounds,
  personaNames: listPersonas,
});

const openStudio = async (intent?: StudioOpenIntent) => {
  const { useDraftStore, setDiagnosticsContext } = await loadDraft();
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
  setDiagnosticsContext(studioDiagnostics());
  setStudioOpen(true, intent);
};

// A brand-new story: the wizard starts from an empty draft, never from whatever this chat plays.
const openWizard = async () => {
  const { useDraftStore, setDiagnosticsContext } = await loadDraft();
  if (useDraftStore.getState().dirty && !(await showConfirmPopup("Start a new story? Your unsaved Studio draft will be discarded.", { okButton: "New story", cancelButton: "Keep editing" }))) return;
  useDraftStore.getState().newDraft();
  setDiagnosticsContext(studioDiagnostics());
  setStudioOpen(true, { tab: "copilot", stage: "qualities" });
};

// "Fix with wizard": the unmet requirements are the premise, so the author lands on the
// provisioning stage already knowing what is missing instead of re-describing it.
const openWizardForRequirements = async () => {
  const { requirements } = manager.getSnapshot();
  await openStudio({
    tab: "copilot",
    stage: "provisioning",
    missing: provisionableMissing(requirements),
  });
};

const dropPersonaRequirement = async (names: string[]): Promise<WriteResult<object>> => {
  const snapshot = manager.getSnapshot();
  const active = snapshot.library.find((story) => story.id === snapshot.storyId);
  const next = withoutPersonas(active?.raw ?? manager.getPlayedStoryRaw(), names);
  if (!next) return { ok: false, reason: "No story is playing in this chat." };
  const named = names.map((name) => `"${name}"`).join(", ");
  const confirmed = await showConfirmPopup(`Remove the persona requirement ${named} from this story? The story is saved to the library and this chat takes the change.`, {
    okButton: "Remove it", cancelButton: "Keep it",
  });
  if (!confirmed) return { ok: false, reason: `The story still requires ${named}.` };
  const saved = saveStoryRecord(next);
  if (Array.isArray(saved)) return { ok: false, reason: "The story could not be saved without that requirement; edit it in the Studio's Story tab." };
  const outcome = await manager.applyStoryUpdate(saved.record);
  return outcome.applied ? { ok: true } : { ok: false, reason: chatUpdateOutcome(outcome)?.detail ?? "The library has the change; this chat did not take it." };
};

const repairCast = async (action: RepairAction) => {
  const result = await runCastRepair(action, {
    add: addGroupMembers,
    unmute: (names) => setGroupMembersDisabled(names, []),
    dropPersonas: dropPersonaRequirement,
    refresh: () => manager.refreshRequirementsNow(),
    journal: (summary, detail) => manager.chatSave.note(summary, detail),
    ownership: manager.requirementsHost.ownership,
  });
  if (!result.ok) window.toastr?.info?.(result.reason, "Story Orchestrator");
};

const openGroup = () => {
  const opened = openGroupMemberList();
  if (!opened.ok) window.toastr?.info?.(opened.reason, "Story Orchestrator");
};

const studioFailed = (error: unknown) => {
  log.warn("the Studio could not open", error);
  setStudioOpen(false);
  window.toastr?.info?.(LAZY_FAILED_TEXT, "Story Orchestrator");
};

const launch = (open: () => Promise<unknown>) => () => void open().catch(studioFailed);

const wizardHost: WizardHost = {
  environment: (draft) => manager.getProvisioningEnvironment(draft),
  applyProvisioning: (op, draft) => manager.applyProvisioning(op, draft),
  readEntry: (lorebook, comment) => manager.readProvisioningEntry(lorebook, comment),
  loadSession: (key) => manager.getWizardSession(key),
  saveSession: (session) => manager.saveWizardSession(session),
  rekeySession: (from, to) => { void rekeyWizardSession(from, to); },
};

// Saving from the chat that is playing this story is the one automatic library→chat path
// (spec addendum §Story identity); every other chat keeps its pinned copy.
// The chat half of one save vocabulary. The library half is the Studio's; this returns
// only what happened HERE, so the two events never read as one sentence.
const applySavedStory = async (record: StoryLibraryRecord): Promise<ChatSaveAnswer> => {
  if (!currentChatOwner()) return NO_CHAT_OPEN;
  if (manager.getSnapshot().storyId !== record.id) return null;
  return chatUpdateOutcome(await manager.applyStoryUpdate(record));
};

const readReplaySource = (): GateReplaySource | null => {
  const storyId = manager.getSnapshot().storyId;
  const source = buildReplaySource(storyId, manager.getStory(), storyId ? loadPersistedRuntime(storyId)?.engineHistory ?? null : null);
  return source ? { ...source, jump: (messageId) => void jumpFromDrawer(messageId) } : null;
};

const inspectListeners = new Set<() => void>();
let inspectTarget: number | null = null;
const setInspectTarget = (messageId: number | null) => {
  inspectTarget = messageId;
  inspectListeners.forEach((listener) => listener());
};
const useInspectTarget = () => useSyncExternalStore(
  (listener) => { inspectListeners.add(listener); return () => { inspectListeners.delete(listener); }; },
  () => inspectTarget,
);

const inlineActions: InlineActions = {
  run: (action) => {
    if (action.kind === "pin-fact") void manager.setMemoryPinned(action.id, action.pinned);
    else if (action.kind === "lock-fact") void manager.memoryActions.setMemoryLocked(action.id, action.locked);
    else if (action.kind === "exclude-fact") void manager.excludeMemoryEntry(action.id);
    else if (action.kind === "curator-op") void manager.setCuratorOpDecision(action.proposalId, action.index, action.decision);
    else void manager.memoryActions.resolveMemoryConflict(action.key, action.keepId);
  },
  inspect: (messageId) => {
    setInspectTarget(messageId);
    openSoDrawer();
  },
};

const StudioModal = lazyRetry(() => import("./studio/StudioModal"));
const InlineLayer = lazyRetry(() => import("./components/inline/InlineLayer"));
const ImageChatPanel = lazyRetry(() => import("./image/ImageChatPanel"));

const StudioHost = () => {
  const open = useSyncExternalStore(
    (listener) => { studioListeners.add(listener); return () => { studioListeners.delete(listener); }; },
    () => studioOpen,
  );
  const snapshot = useRuntimeSnapshot();
  if (!open) return null;
  return (
    <Lazy quiet onError={studioFailed}>
      <StudioModal
        onClose={() => setStudioOpen(false)}
        copilotEnabled={snapshot.copilot.enabled}
        runCopilotStage={(input) => manager.runCopilotStage(input)}
        agentModel={manager.model}
        onSaved={applySavedStory}
        wizardHost={wizardHost}
        intent={studioIntent}
        replay={studioIntent?.fromChat ? readReplaySource() : null}
      />
    </Lazy>
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
  openWizard: launch(openWizard),
  openStudio: launch(() => openStudio()),
  openWizardForRequirements: launch(openWizardForRequirements),
  revealSetting: (id) => revealSetting(id),
  repairCast: (action) => void repairCast(action),
  openGroup,
  openDrawer: () => openSoDrawer(),
  openAuthorView: () => void toggleAuthorView(true).then(openSoDrawer),
  showFeature: (where) => showFeature(where),
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
const continueBranch = () => continueFromBranch({ selectStory: (storyId) => manager.selectStory(storyId), note: (summary, detail) => manager.chatSave.note(summary, detail),
  markBranch: (origin) => manager.markBranch(origin) });
const branchAtFloor = async (messageId: number) => {
  const result = await branchFromOldest(messageId);
  if (!result.ok) window.toastr?.info?.(result.reason, "Story Orchestrator");
};

const DrawerPanel = () => {
  const snapshot = useRuntimeSnapshot();
  const inspecting = useInspectTarget();
  const [helpOpen, setHelpOpen] = useState(false);
  const branch = snapshot.chatIdentity?.kind === "branch" ? snapshot.chatIdentity : null;
  return (
    <div className="p-2 text-sm flex flex-col gap-3 text-left">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">{snapshot.storyTitle ?? "Story Orchestrator"}</div>
          {!snapshot.ready && (
            <div id="so-drawer-no-story" className="flex flex-col items-start gap-1 text-xs opacity-80">
              <span>{BRIEFING_COPY.noStory}</span>
              <button type="button" className="menu_button" onClick={openStorySettings}>{BRIEFING_COPY.openSettings}</button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {snapshot.ready && (
            <label className="flex items-center gap-1 text-xs whitespace-nowrap" title="Show gates, blackboard, scheduler and payload debugging. Spoils upcoming story branches.">
              <input id="so-author-view" type="checkbox" checked={snapshot.ui.authorView} onChange={(event) => void toggleAuthorView(event.target.checked)} />
              <span>Author view</span>
            </label>
          )}
          <HelpButton id="so-help-toggle-drawer" open={helpOpen} onToggle={() => setHelpOpen(!helpOpen)} />
        </div>
      </div>
      {helpOpen && <Lazy fallback={null}><HelpHost authorView={snapshot.ui.authorView} onShowMe={showFeature} onClose={() => setHelpOpen(false)} /></Lazy>}
      {!snapshot.ready && branch && <BranchNotice identity={branch} onContinue={continueBranch} />}
      {snapshot.ready && (
        <DrawerTabs
          snapshot={snapshot}
          manager={manager}
          driver={{ context: snapshot.driver, activeNudge: snapshot.activeNudge, controller: driverController, recovery: snapshot.lastFired }}
          onOpenSettings={openStorySettings}
          onEditStory={launch(() => openStudio({ fromChat: true }))}
          onFixWithWizard={launch(openWizardForRequirements)}
          onOpenRepair={openRepairStep}
          onNewStory={launch(openWizard)}
          onBranchFromOldest={(messageId) => void branchAtFloor(messageId)}
          onJumpToMessage={(messageId) => void jumpFromDrawer(messageId)}
          inspect={inspecting === null ? null : { messageId: inspecting, onClose: () => setInspectTarget(null), actions: inlineActions }}
          imagePanel={<Lazy fallback={<div className="text-xs">Loading illustrations…</div>}><ImageChatPanel manager={manager} snapshot={snapshot} /></Lazy>}
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

const showFeature = (where: FeatureWhere) => {
  const id = where.selector.replace(/^#/, "");
  if (where.surface === "settings") {
    openStorySettings();
    window.setTimeout(() => revealSetting(id), 250);
  } else if (where.surface === "drawer") {
    openSoDrawer();
    window.setTimeout(() => revealSetting(id), 100);
  }
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

const InlineMount = ({ hosts }: { hosts: InlineHostSet }) => {
  const snapshot = useRuntimeSnapshot();
  if (!snapshot.ready) return null;
  return <Lazy quiet><InlineLayer view={snapshot.inline} hosts={hosts} actions={inlineActions} /></Lazy>;
};

const mountInline = () => {
  if (document.getElementById("so-inline-root")) return true;
  const mounted = mountInlineHosts();
  if (!mounted.ok) return false;
  ui.add(() => mounted.hosts.dispose());
  const root = ui.element(document.createElement("div"));
  root.id = "so-inline-root";
  root.hidden = true;
  document.body.appendChild(root);
  ui.root(root, <InlineMount hosts={mounted.hosts} />);
  if (__SO_DEV__) ui.global("storyOrchestratorInline", { attachTimes: () => mounted.hosts.attachTimes() });
  return true;
};

const BriefingRoot = () => (
  <BriefingHost
    snapshot={useRuntimeSnapshot()}
    setUi={(patch) => manager.setUiSettings(patch)}
    onboardingSeen={() => getGlobalSettings().help.onboardingSeen}
    markOnboardingSeen={() => { setGlobalSettings({ help: { onboardingSeen: true } }); }}
  />
);

const mountBriefingHost = () => {
  if (document.getElementById("so-briefing-root")) return;
  const root = ui.element(document.createElement("div"));
  root.id = "so-briefing-root";
  document.body.appendChild(root);
  ui.root(root, <BriefingRoot />);
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
  mountBriefingHost();
  const inlineMounted = mountInline();

  if ((!settingsRootContainer || !drawerMounted || !hudMounted || !inlineMounted) && attempt < 50) {
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
