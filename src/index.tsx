import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import ReactDOM from "react-dom/client";
import { bindNavbarDrawerToggle, capabilityReport, hostFacts, judgeStatus, listConnectionProfiles, readProfileContextLimit, showChoicePopup, showConfirmPopup, toggleNavbarDrawer, writeJudgeSecret, type CapabilityReport, type HostFacts } from "@services/STAPI";
import packageJson from "../package.json";
import { runJudgeDirectorSelfTest, type JudgeSelfTestReport } from "@judge/index";
import { getGlobalSettings, setJudgeSettings } from "@runtime/settingsStore";
import CapabilitiesGroup from "./components/settings/CapabilitiesGroup";
import EntryPoints from "./components/settings/EntryPoints";
import JudgeSettingsGroup, { type JudgeSettingsGroupProps, type JudgeSettingsPatch } from "./components/settings/JudgeSettingsGroup";
import { runModelSelfTest, type SelfTestReport } from "@runtime/selfTest";
import { runRoleSelfTest } from "@runtime/roleSelfTest";
import { roleHealth } from "@runtime/roleHealth";
import { resolveProfile } from "@runtime/passProfiles";
import type { PassRole } from "@extraction/passRole";
import { RoleProfilesGroup } from "@components/settings/RoleProfilesGroup";
import { isArcTemplateName } from "@pacing/index";
import { DEFAULT_MAX_TOKENS, inputBudget } from "@extraction/index";
import { STAGECRAFT_ACCEPT_MODES, type StagecraftAcceptMode } from "@stagecraft/index";
import { startRuntime } from "@runtime/index";
import { STORY_STATE_RETENTION } from "@runtime/persistence";
import { branchFromOldest, continueFromBranch } from "@runtime/chatIdentity";
import { exportState } from "@runtime/stateExport";
import { removalRestore, wiGating } from "@runtime/worldInfoScanHost";
import WorldInfoGatingGroup from "./components/settings/WorldInfoGatingGroup";
import { jumpToMessage } from "@runtime/messageJumpHost";
import type { RuntimeSnapshot, StoryLibraryRecord } from "@runtime/types";
import StudioModal, { STUDIO_TAB_IDS, type StudioOpenIntent } from "./studio/StudioModal";
import type { WizardHost } from "./studio/components/StudioCopilot";
import { type DriverController } from "@components/drawer/DriverPanel";
import DrawerTabs from "./components/drawer/DrawerTabs";
import HudStrip from "./components/drawer/HudStrip";
import BranchNotice from "./components/drawer/BranchNotice";
import HelpTooltip from "./components/studio/HelpTooltip";
import { useDraftStore, type StoryDraft } from "./studio/draft";
import "./styles.css";

// v2.3 plan 08: the version the settings panel reports is the one this bundle was built from.
const EXTENSION_VERSION = String(packageJson.version ?? "unknown");

const manager = startRuntime();

const memoryModelLimit = (profileId: string | null) => {
  const limit = readProfileContextLimit(profileId);
  return { ...limit, inputBudget: inputBudget(limit, DEFAULT_MAX_TOKENS).input };
};

const isAcceptMode = (value: string): value is StagecraftAcceptMode => (STAGECRAFT_ACCEPT_MODES as readonly string[]).includes(value);

if (typeof globalThis !== "undefined") {
  globalThis.storyOrchestratorRuntime = manager;
  globalThis.storyOrchestratorStudioDraft = useDraftStore;
  globalThis.storyOrchestratorStudioTabs = STUDIO_TAB_IDS;
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
  setStudioOpen(true, intent);
};

// A brand-new story: the wizard starts from an empty draft, never from whatever this chat plays.
const openWizard = async () => {
  if (useDraftStore.getState().dirty && !(await showConfirmPopup("Start a new story? Your unsaved Studio draft will be discarded.", { okButton: "New story", cancelButton: "Keep editing" }))) return;
  useDraftStore.getState().newDraft();
  setStudioOpen(true, { tab: "copilot", stage: "qualities" });
};

// "Fix with wizard" (U6): the unmet requirements are the premise, so the author lands on the
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
// v2.3 plan 09: the chat half of one save vocabulary. The library half is the Studio's; this returns
// only what happened HERE, so the two events never read as one sentence.
const applySavedStory = async (record: StoryLibraryRecord): Promise<string | null> => {
  if (manager.getSnapshot().storyId !== record.id) return null;
  const outcome = await manager.applyStoryUpdate(record);
  if (outcome.applied) return outcome.choice === "restart" ? "this chat restarted on the new version" : "this chat is playing the new version now";
  return outcome.reason ? `this chat kept its version — ${outcome.reason}` : null;
};

const StudioHost = () => {
  const open = useSyncExternalStore(
    (listener) => { studioListeners.add(listener); return () => { studioListeners.delete(listener); }; },
    () => studioOpen,
  );
  const snapshot = useRuntimeSnapshot();
  if (!open) return null;
  return (
    <StudioModal
      onClose={() => setStudioOpen(false)}
      copilotEnabled={snapshot.copilot.enabled}
      runCopilotStage={(input) => manager.runCopilotStage(input)}
      onSaved={applySavedStory}
      wizardHost={wizardHost}
      intent={studioIntent}
    />
  );
};

const driverController: DriverController = {
  suggest: () => manager.runCopilotSuggest(),
  nudge: (text) => manager.setCopilotNudge(text),
  clearNudge: () => manager.clearCopilotNudge(),
  probe: async () => { await manager.runExtractionNow(undefined, "probe"); },
  advance: async (checkpointId) => { await manager.activateCheckpoint(checkpointId); },
  report: () => manager.runCopilotReport(),
};

const useRuntimeSnapshot = () => {
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot>(() => manager.getSnapshot());
  useEffect(() => {
    const unsubscribe = manager.subscribe(() => setSnapshot(manager.getSnapshot()));
    return () => { unsubscribe(); };
  }, []);
  return snapshot;
};

const SCOPE_COPY = {
  install: { label: "this install", note: "Changes here affect every chat." },
  chat: { label: "this chat", note: null },
  story: { label: "this story", note: null },
} as const;

// v2.3 plan 09. The three lifetimes are a real part of this extension's model (spec addendum
// §Configuration homes) and were explained in six different asides. One header, one vocabulary, and an
// install-wide group says out loud that it is not local.
const GroupHeader = ({ title, scope, id }: { title: string; scope: keyof typeof SCOPE_COPY; id?: string }) => (
  <div className="flex flex-col gap-1">
    <div id={id} className="font-medium text-sm">
      {title} <span className="opacity-60 font-normal">— {SCOPE_COPY[scope].label}</span>
    </div>
    {SCOPE_COPY[scope].note && <div className="text-xs opacity-60">{SCOPE_COPY[scope].note}</div>}
  </div>
);

const SettingsPanel = () => {
  const snapshot = useRuntimeSnapshot();
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [busy, setBusy] = useState(false);
  const [selfTest, setSelfTest] = useState<SelfTestReport | null>(null);
  const [selfTestRunning, setSelfTestRunning] = useState(false);
  const selfTestCancelled = useRef(false);
  const [testingRole, setTestingRole] = useState<PassRole | null>(null);
  const profiles = listConnectionProfiles();
  const identity = snapshot.storyIdentity;
  const [judge, setJudge] = useState(() => getGlobalSettings().judge);
  const [judgeState, setJudgeState] = useState<JudgeSettingsGroupProps["status"]>("unchecked");
  const [judgeTest, setJudgeTest] = useState<{ running: boolean; report: JudgeSelfTestReport | null }>({ running: false, report: null });

  const recheckJudge = () => {
    setJudgeState("checking");
    globalThis.storyOrchestratorJudge?.invalidateStatus();
    void judgeStatus().then(setJudgeState);
  };

  // v2.3 plan 06. Probed once per panel mount, not per render: a probe that answers is cached for the
  // page load, so this costs one request each and the Recheck button is the only way to re-ask.
  const [capabilities, setCapabilities] = useState<CapabilityReport[] | "checking">("checking");
  const [hostFactSheet, setHostFactSheet] = useState<HostFacts | null>(null);
  const probeHost = (refresh: boolean) => {
    setCapabilities("checking");
    void Promise.all([capabilityReport(refresh ? { refresh: true } : {}), hostFacts()]).then(([reports, facts]) => {
      setCapabilities(reports);
      setHostFactSheet(facts);
    });
  };
  const recheckCapabilities = () => probeHost(true);

  useEffect(() => {
    if (getGlobalSettings().judge.enabled) recheckJudge();
    probeHost(false);
  }, []);

  const changeJudge = (patch: JudgeSettingsPatch) => {
    const next = setJudgeSettings(patch).judge;
    setJudge(next);
    if (patch.enabled) recheckJudge();
  };

  const testJudge = async () => {
    const runtime = globalThis.storyOrchestratorJudge;
    if (!runtime) return;
    setJudgeTest({ running: true, report: null });
    const report = await runJudgeDirectorSelfTest((request) => runtime.probe(request));
    setJudgeTest({ running: false, report });
  };

  const selectStory = async (id: string) => {
    if (!id) return;
    setBusy(true);
    await manager.selectStory(id);
    setBusy(false);
  };

  const restartStory = async () => {
    setBusy(true);
    await manager.restartStory();
    setBusy(false);
  };

  const runSelfTest = async () => {
    if (selfTestRunning) {
      selfTestCancelled.current = true;
      return;
    }
    selfTestCancelled.current = false;
    setSelfTestRunning(true);
    setSelfTest(null);
    const report = await runModelSelfTest({
      profileId: snapshot.extraction.settings.profileId,
      cancelled: () => selfTestCancelled.current,
    });
    setSelfTest(report);
    setSelfTestRunning(false);
  };

  const assignRole = (role: PassRole, profileId: string | null) => {
    const rest = Object.fromEntries(Object.entries(snapshot.extraction.settings.profiles ?? {}).filter(([key]) => key !== role));
    manager.setExtractionSettings({ profiles: profileId ? { ...rest, [role]: profileId } : rest });
  };

  const testRole = async (role: PassRole) => {
    const route = resolveProfile(snapshot.extraction.settings, role, (id) => profiles.some((profile) => profile.id === id));
    setTestingRole(role);
    roleHealth.record(await runRoleSelfTest(role, { profileId: route.ok ? route.profileId : null }));
    setTestingRole(null);
  };

  const applySelfTestSuggestion = () => {
    if (!selfTest?.suggestion) return;
    manager.setMemorySettings({ epistemicLedgerCapable: selfTest.suggestion.epistemicLedgerCapable });
  };

  const importStory = async () => {
    if (!importText.trim()) return;
    setBusy(true);
    const ok = await manager.importStory(importText);
    if (ok) setImportText("");
    setBusy(false);
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    const text = await file.text();
    await manager.importStory(text);
    setBusy(false);
  };

  // v2.3 plan 05. The chat's saved state can be dropped by retention, so the author gets a copy of it
  // before that: what `so-state current` shows is what this writes to the clipboard.
  const copyState = async () => {
    await exportState({
      writeClipboard: (text) => navigator.clipboard.writeText(text),
      toast: window.toastr ?? {},
      log: (text) => console.info(text),
    });
  };

  const deleteStory = async () => {
    const current = manager.getSnapshot();
    const active = current.library.find((story) => story.id === current.storyId);
    if (!active) return;
    const question = `Delete "${active.title}" from the library? Chats already playing it keep their own pinned copy and carry on; new chats can no longer pick it.`;
    const restore = removalRestore(active.id);
    const choice = restore
      ? await showChoicePopup(`${question} Its ${restore.entries} lorebook ${restore.entries === 1 ? "entry stays" : "entries stay"} off at rest unless you restore ${restore.entries === 1 ? "it" : "them"}.`, {
        okButton: { id: "delete", label: "Delete" },
        choices: [{ id: "restore", label: "Delete and restore these lorebook entries" }],
        cancelButton: "Keep",
      })
      : (await showConfirmPopup(question, { okButton: "Delete", cancelButton: "Keep" })) ? "delete" : null;
    if (!choice) return;
    setBusy(true);
    const removed = await manager.removeStory(active.id);
    if (removed && choice === "restore" && restore) await restore.run();
    setBusy(false);
  };

  return (
    <div id="story-orchestrator-settings">
      <div className="inline-drawer">
        <div className="inline-drawer-toggle inline-drawer-header flex items-center justify-between">
          <b>Story Orchestrator</b>
        </div>
        <div className="inline-drawer-content px-3 py-2 !flex flex-col gap-3">
          <EntryPoints
            snapshot={snapshot}
            busy={busy}
            importOpen={importOpen}
            onToggleImport={() => setImportOpen((open) => !open)}
            onNewStory={() => void openWizard()}
            onOpenStudio={() => void openStudio()}
            onRevealSetting={revealSetting}
            onFixWithWizard={() => void openWizardForRequirements()}
          />
          <label className="flex flex-col gap-1 text-sm">
            <span>Story</span>
            <div className="flex items-center gap-2">
              <select id="story-library-select" className="flex-1" value={snapshot.storyId ?? ""} disabled={busy} onChange={(event) => void selectStory(event.target.value)}>
                <option value="">Select a story</option>
                {snapshot.library.map((story) => <option key={story.id} value={story.id}>{story.title}</option>)}
              </select>
              <button id="so-restart-story" className="menu_button fa-solid fa-rotate-left" title="Restart this story in this chat (clears progress and memory for it)" disabled={busy || (!snapshot.storyId && !snapshot.blobUnreadable)} onClick={() => void restartStory()} />
              <button id="so-delete-story" className="menu_button fa-solid fa-trash-can" title="Delete the selected story from the library" disabled={busy || !snapshot.storyId} onClick={() => void deleteStory()} />
            </div>
            {snapshot.storyId && (
              <div id="so-story-identity" className="text-xs opacity-70">
                Playing your pinned copy{identity.playedVersion ? ` (v${identity.playedVersion})` : ""}.
                {identity.drifted && identity.libraryVersion ? ` The library has a newer version (v${identity.libraryVersion}); this chat keeps playing what it started with.` : ""}
              </div>
            )}
            {snapshot.blobUnreadable && <div id="so-blob-unreadable" className="text-xs opacity-90">This chat's saved story state was {snapshot.blobUnreadable.notice}.</div>}
            <div id="so-retention-note" className="text-xs opacity-70 flex items-center gap-2">
              <span>This chat keeps its progress for the {STORY_STATE_RETENTION} most recent stories; switching to a sixth drops the oldest.</span>
              <button id="so-export-state" className="menu_button" title="Copy this chat's saved story state to the clipboard, before anything can drop it." onClick={() => void copyState()}>Export state</button>
            </div>
          </label>
          {importOpen && (
            <label id="so-entry-import" className="flex flex-col gap-1 text-sm">
              <span>Import story (JSON)</span>
              <textarea className="text_pole" rows={6} value={importText} onChange={(event) => setImportText(event.target.value)} placeholder="Paste story JSON, or pick a file below" />
              <input type="file" accept=".json,application/json" disabled={busy} onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = ""; }} />
              <button className="menu_button self-start" disabled={busy || !importText.trim()} onClick={() => void importStory()}>Import and Load</button>
            </label>
          )}
          {snapshot.validationErrors.length > 0 && (
            <div className="text-xs text-red-400">
              {snapshot.validationErrors.map((error) => <div key={`${error.path}:${error.message}`}>{error.path}: {error.message}</div>)}
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={snapshot.copilot.enabled} onChange={(event) => manager.setCopilotSettings({ enabled: event.target.checked })} />
            <span>Enable story copilot (authoring tab + in-play driver)</span>
          </label>
          <div className="flex flex-col gap-2 border-t border-solid border-white/10 pt-2">
            <GroupHeader title="Memory model" scope="install" id="so-memory-model-header" />
            <label className="flex items-center gap-2 text-sm">
              <input id="so-extraction-enabled" type="checkbox" checked={snapshot.extraction.settings.enabled} onChange={(event) => manager.setExtractionSettings({ enabled: event.target.checked })} />
              <span>Let the story advance on its own (shared read extraction)</span>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>Memory LLM profile</span>
              <select id="so-extraction-profile" value={snapshot.extraction.settings.profileId ?? ""} onChange={(event) => manager.setExtractionSettings({ profileId: event.target.value || null })}>
                <option value="">No profile selected</option>
                {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}{profile.model ? ` (${profile.model})` : ""}</option>)}
              </select>
            </label>
            <details className="text-sm">
              <summary className="cursor-pointer opacity-80">Advanced</summary>
              <div className="grid grid-cols-1 gap-2 pt-2 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span>Cadence <HelpTooltip title="Run an extraction read every N chat messages. Lower = story reacts faster but calls the memory model more often." /></span>
                  <input type="number" min={1} value={snapshot.extraction.settings.cadence} onChange={(event) => manager.setExtractionSettings({ cadence: Math.max(1, Number(event.target.value) || 1) })} />
                </label>
                <label className="flex flex-col gap-1">
                  <span>Reconcile × <HelpTooltip title="When the story stalls, widen the re-read window by this multiplier to double-check missed facts." /></span>
                  <input type="number" min={1} step={0.1} value={snapshot.extraction.settings.reconciliationMultiplier} onChange={(event) => manager.setExtractionSettings({ reconciliationMultiplier: Math.max(1, Number(event.target.value) || 1) })} />
                </label>
                <label className="flex flex-col gap-1">
                  <span>Lag <HelpTooltip title="Skip the newest N messages when reading, in case you often re-roll replies. 0 = react to the latest message immediately." /></span>
                  <input type="number" min={0} value={snapshot.extraction.settings.stabilityLag} onChange={(event) => manager.setExtractionSettings({ stabilityLag: Math.max(0, Number(event.target.value) || 0) })} />
                </label>
              </div>
            </details>
            {snapshot.extraction.settings.enabled && !snapshot.extraction.settings.profileId && <div id="so-not-configured" className="text-xs text-yellow-300">Not configured: pick a memory model profile above and every chat, including this one, starts advancing on its own.</div>}
            <div className="flex flex-wrap items-center gap-2">
              <button id="so-self-test" className="menu_button" disabled={!snapshot.extraction.settings.profileId} onClick={() => void runSelfTest()}>{selfTestRunning ? "Cancel test" : "Test memory model"}</button>
              <span className="min-w-0 text-xs opacity-70">Runs fixed scenes through the real pipeline and reports what this model can actually do.</span>
            </div>
            {selfTest && (
              <div id="so-self-test-result" className="text-xs flex flex-col gap-1">
                {selfTest.error && <div className="text-yellow-300">{selfTest.error}</div>}
                {selfTest.results.map((result) => (
                  <div key={result.tier} className="flex items-start gap-2">
                    <span className={result.status === "pass" ? "text-green-400" : "text-red-300"}>{result.status === "pass" ? "PASS" : "FAIL"}</span>
                    <span className="opacity-80">{result.tier} — {result.detail}{result.got.length ? ` · got: ${result.got.slice(0, 2).join("; ")}` : ""}</span>
                  </div>
                ))}
                {selfTest.suggestion && (
                  <div className="flex items-center gap-2">
                    <span className="opacity-80">{selfTest.suggestion.reason}</span>
                    <button id="so-self-test-apply" className="menu_button" onClick={applySelfTestSuggestion}>Turn epistemic/ledger off</button>
                  </div>
                )}
              </div>
            )}
            <RoleProfilesGroup routes={snapshot.roleRoutes ?? []} assigned={snapshot.extraction.settings.profiles ?? {}} profiles={profiles} testing={testingRole} onAssign={assignRole} onTest={(role) => void testRole(role)} />
          </div>
          <div className="flex flex-col gap-2 border-t border-solid border-white/10 pt-2">
            <GroupHeader title="Display" scope="install" id="so-display-header" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={snapshot.ui.announceTransitions} onChange={(event) => manager.setUiSettings({ announceTransitions: event.target.checked })} />
              <span>Announce checkpoint changes in chat</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={snapshot.ui.hudEnabled} onChange={(event) => manager.setUiSettings({ hudEnabled: event.target.checked })} />
              <span>Show story status above the chat input</span>
            </label>
          </div>
          <div className="flex flex-col gap-2 border-t border-solid border-white/10 pt-2">
            <GroupHeader title="Group chat" scope="chat" id="so-group-chat-header" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={snapshot.talk.enabled} onChange={(event) => manager.setTalkDirectionEnabled(event.target.checked)} />
              <span>Speaker direction <HelpTooltip title="Let checkpoints with talk control decide who speaks next in group chats: name mentions win, then the LLM director, then weighted rules. Swipes, quiet passes, and explicit /trigger are never affected." /></span>
            </label>
          </div>
          <div className="flex flex-col gap-2 border-t border-solid border-white/10 pt-2">
            <GroupHeader title="Lorebooks" scope="install" id="so-lorebooks-header" />
            <WorldInfoGatingGroup
              status={snapshot.wiGating ?? null}
              authorView={snapshot.ui.authorView}
              onChoose={(mode) => void (mode === "scan" ? wiGating()?.requestScan() : wiGating()?.requestFile())}
              onRenormalize={() => void wiGating()?.renormalize()}
            />
          </div>
          <div className="flex flex-col gap-2 border-t border-solid border-white/10 pt-2">
            <GroupHeader title="Stagecraft" scope="install" id="so-stagecraft-header" />
            <label className="flex items-center gap-2 text-sm">
              <input id="so-curator-enabled" type="checkbox" checked={snapshot.stagecraft.settings.curatorEnabled} onChange={(event) => manager.setStagecraftSettings({ curatorEnabled: event.target.checked })} />
              <span>World Info curator <HelpTooltip title="A background agent that reads what has happened and proposes changes to the story's own lorebook — switching entries on or off, correcting text the story has overtaken. It only ever touches the lorebooks the story lists for it, it proposes rather than writes, and it can never change story progress or memory." /></span>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>Curator changes</span>
              <select id="so-curator-accept-mode" value={snapshot.stagecraft.settings.acceptMode} onChange={(event) => manager.setStagecraftSettings({ acceptMode: isAcceptMode(event.target.value) ? event.target.value : "review" })}>
                <option value="review">Ask me first</option>
                <option value="auto">Apply on their own</option>
                <option value="off">Only show me what it would do</option>
              </select>
            </label>
            {snapshot.stagecraft.settings.curatorEnabled && snapshot.ready && snapshot.stagecraftScope.length === 0 && (
              <div id="so-curator-unscoped" className="text-xs opacity-70">This story lists no lorebook for the curator, so it stays idle. Add one on the Studio&apos;s Story tab.</div>
            )}
            {snapshot.ui.authorView && (
              <>
                <label className="flex items-center gap-2 text-sm">
                  <input id="so-warden-enabled" type="checkbox" checked={snapshot.stagecraft.settings.wardenEnabled} onChange={(event) => manager.setStagecraftSettings({ wardenEnabled: event.target.checked })} />
                  <span>Continuity warden <HelpTooltip title="After each character reply, the judgment model checks it against the story's established facts. When the reply breaks one, a note restating that fact goes into the next reply's prompt, once. Needs the judgment model switched on. Sends: the reply text, up to 40 established facts and the ledger's tracked values." /></span>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span>Warden notes</span>
                  <select id="so-warden-accept-mode" value={snapshot.stagecraft.settings.wardenAcceptMode} onChange={(event) => manager.setStagecraftSettings({ wardenAcceptMode: isAcceptMode(event.target.value) ? event.target.value : "review" })}>
                    <option value="review">Ask me first</option>
                    <option value="auto">Add them on their own</option>
                    <option value="off">Don&apos;t check replies</option>
                  </select>
                </label>
              </>
            )}
          </div>
          <JudgeSettingsGroup
            settings={judge}
            status={judgeState}
            selfTest={judgeTest}
            authorView={snapshot.ui.authorView}
            meter={snapshot.judgeMeter}
            wardenEnabled={snapshot.stagecraft.settings.wardenEnabled && snapshot.stagecraft.settings.wardenAcceptMode !== "off"}
            onChange={changeJudge}
            onSaveKey={writeJudgeSecret}
            onRefresh={recheckJudge}
            onRunSelfTest={() => void testJudge()}
          />
          <CapabilitiesGroup reports={capabilities} facts={hostFactSheet} extensionVersion={EXTENSION_VERSION} memoryModel={memoryModelLimit(snapshot.extraction.settings.profileId)} onRefresh={recheckCapabilities} />
          <div className="flex flex-col gap-2 border-t border-solid border-white/10 pt-2">
            <GroupHeader title="Pacing" scope="install" id="so-pacing-header" />
            <label className="flex flex-col gap-1 text-sm">
              <span>Dramatic shape <span className="opacity-60">— this chat only</span></span>
              <select value={typeof snapshot.pacing.shapeOverride === "string" ? snapshot.pacing.shapeOverride : ""} onChange={(event) => manager.setPacingSettings({ shapeOverride: isArcTemplateName(event.target.value) ? event.target.value : null })}>
                <option value="">Use story default</option>
                <option value="rising">Rising to climax</option>
                <option value="fall_recovery">Fall then recovery</option>
                <option value="three_act">Three act</option>
              </select>
            </label>
            <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span>Smoothing α <span className="opacity-60">(install-wide)</span> <HelpTooltip title="How quickly the measured tension follows the latest scene. Higher = jumpier, lower = smoother." /></span>
                <input type="number" min={0} max={1} step={0.05} value={snapshot.pacing.alpha} onChange={(event) => manager.setPacingSettings({ alpha: Math.min(1, Math.max(0, Number(event.target.value) || 0)) })} />
              </label>
              <label className="flex flex-wrap items-center gap-2 mt-5">
                <input type="checkbox" checked={snapshot.pacing.hintEnabled} onChange={(event) => manager.setPacingSettings({ hintEnabled: event.target.checked })} />
                <span className="min-w-0">Steering hint <HelpTooltip title="Quietly nudge the main model toward the story's intended tension (escalate or cool down) via an injected note." /></span>
              </label>
            </div>
          </div>
          <div className="text-xs opacity-80">{snapshot.status}</div>
        </div>
      </div>
    </div>
  );
};

// Turning author view on is a one-way look behind the curtain for this chat: gates, future
// checkpoints and what the cast is hiding. Confirm before spoiling a story you may not have
// written (plan 04 unresolved question, resolved yes).
const toggleAuthorView = async (next: boolean) => {
  if (next) {
    const ok = await showConfirmPopup("Author view shows gates, upcoming checkpoints and what characters are hiding. That will spoil this story for you as a player. Show it anyway?", { okButton: "Show author view", cancelButton: "Keep playing" });
    if (!ok) return;
  }
  manager.setUiSettings({ authorView: next });
};

// v2.4 plan 02 §5: the player's Continue from here, and the author's branch cut at the history floor.
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
          <div className="text-xs opacity-70">{snapshot.storyDescription ?? "Load a story from the extension settings."}</div>
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
          driver={{ context: snapshot.driver, activeNudge: snapshot.activeNudge, controller: driverController }}
          onOpenSettings={openStorySettings}
          onEditStory={() => void openStudio()}
          onFixWithWizard={() => void openWizardForRequirements()}
          onOpenRepair={openRepairStep}
          onNewStory={() => void openWizard()}
          onBranchFromOldest={(messageId) => void branchAtFloor(messageId)}
          onJumpToMessage={(messageId) => void jumpFromDrawer(messageId)}
        />
      )}
    </div>
  );
};

// v2.4 plan 08 T19d: on a narrow viewport the drawer covers #chat, so it closes before ST scrolls.
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

// The one missing setup step is always in one place (plan 02 made settings install-wide), so the
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

// V19: the HUD's needs-setup chip and the drawer's Repair button land ON the Repair step, not just on the
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
  const drawer = document.createElement("div");
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
  bindNavbarDrawerToggle(toggle);
  ReactDOM.createRoot(content).render(<DrawerPanel />);
  return true;
};

const mountHud = () => {
  const formSheld = document.getElementById("form_sheld");
  if (!formSheld || document.getElementById("so-hud-root")) return Boolean(formSheld);
  const hudRoot = document.createElement("div");
  hudRoot.id = "so-hud-root";
  formSheld.insertBefore(hudRoot, formSheld.firstChild);
  ReactDOM.createRoot(hudRoot).render(<HudMount />);
  return true;
};

const mountStudioHost = () => {
  if (document.getElementById("so-studio-root")) return true;
  const root = document.createElement("div");
  root.id = "so-studio-root";
  document.body.appendChild(root);
  ReactDOM.createRoot(root).render(<StudioHost />);
  return true;
};

const mount = (attempt = 0) => {
  const settingsRootContainer = document.getElementById("extensions_settings");
  if (settingsRootContainer && !document.getElementById("story-orchestrator-settings")) {
    const settingsRootElement = document.createElement("div");
    settingsRootContainer.appendChild(settingsRootElement);
    ReactDOM.createRoot(settingsRootElement).render(<SettingsPanel />);
  }

  const drawerMounted = mountTopBarDrawer();
  const hudMounted = mountHud();
  mountStudioHost();

  if ((!settingsRootContainer || !drawerMounted || !hudMounted) && attempt < 50) {
    window.setTimeout(() => mount(attempt + 1), 100);
  }
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => mount(), { once: true });
} else {
  window.setTimeout(mount, 0);
}
