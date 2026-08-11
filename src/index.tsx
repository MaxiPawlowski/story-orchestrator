import { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { bindNavbarDrawerToggle, listConnectionProfiles, showConfirmPopup, toggleNavbarDrawer } from "@services/STAPI";
import { isArcTemplateName } from "@pacing/index";
import { startRuntime } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import StudioModal from "./studio/StudioModal";
import { type DriverController } from "./studio/components/DriverPanel";
import DrawerTabs from "./components/drawer/DrawerTabs";
import HudStrip from "./components/drawer/HudStrip";
import HelpTooltip from "./components/studio/HelpTooltip";
import { useDraftStore, type StoryDraft } from "./studio/draft";
import "./styles.css";

const manager = startRuntime();

if (typeof globalThis !== "undefined") {
  globalThis.storyOrchestratorRuntime = manager;
  globalThis.storyOrchestratorStudioDraft = useDraftStore;
}

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

const SettingsPanel = () => {
  const snapshot = useRuntimeSnapshot();
  const [importText, setImportText] = useState("");
  const [busy, setBusy] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const profiles = listConnectionProfiles();

  const openStudio = async () => {
    const active = snapshot.library.find((story) => story.hash === snapshot.storyHash);
    const store = useDraftStore.getState();
    const resumable = store.dirty && store.sourceHash === (active?.hash ?? null);
    const resume = resumable && (await showConfirmPopup("You have an unsaved Studio draft for this story. Resume it?", { okButton: "Resume draft", cancelButton: "Start fresh" }));
    if (!resume) {
      if (active) store.loadDraft(active.raw as StoryDraft, active.hash);
      else store.newDraft();
    }
    setStudioOpen(true);
  };

  const selectStory = async (hash: string) => {
    if (!hash) return;
    setBusy(true);
    await manager.selectStory(hash);
    setBusy(false);
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

  const deleteStory = async () => {
    const current = manager.getSnapshot();
    const active = current.library.find((story) => story.hash === current.storyHash);
    if (!active) return;
    const ok = await showConfirmPopup(`Delete "${active.title}" from the library? Chats that used it keep their saved progress, but the story must be re-imported to play it again.`, { okButton: "Delete", cancelButton: "Keep" });
    if (!ok) return;
    setBusy(true);
    await manager.removeStory(active.hash);
    setBusy(false);
  };

  return (
    <div id="story-orchestrator-settings">
      <div className="inline-drawer">
        <div className="inline-drawer-toggle inline-drawer-header flex items-center justify-between">
          <b>Story Orchestrator</b>
        </div>
        <div className="inline-drawer-content px-3 py-2 !flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span>Story</span>
            <div className="flex items-center gap-2">
              <select id="story-library-select" className="flex-1" value={snapshot.storyHash ?? ""} disabled={busy} onChange={(event) => void selectStory(event.target.value)}>
                <option value="">Select a story</option>
                {snapshot.library.map((story) => <option key={story.hash} value={story.hash}>{story.title}</option>)}
              </select>
              <button id="so-delete-story" className="menu_button fa-solid fa-trash-can" title="Delete the selected story from the library" disabled={busy || !snapshot.storyHash} onClick={() => void deleteStory()} />
            </div>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Import story (JSON)</span>
            <textarea className="text_pole" rows={6} value={importText} onChange={(event) => setImportText(event.target.value)} placeholder="Paste story JSON, or pick a file below" />
            <input type="file" accept=".json,application/json" disabled={busy} onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = ""; }} />
          </label>
          <div className="flex items-center gap-2">
            <button className="menu_button" disabled={busy || !importText.trim()} onClick={() => void importStory()}>Import and Load</button>
            <button id="so-open-studio" className="menu_button" onClick={() => void openStudio()}>Open Studio</button>
          </div>
          {snapshot.validationErrors.length > 0 && (
            <div className="text-xs text-red-400">
              {snapshot.validationErrors.map((error) => <div key={`${error.path}:${error.message}`}>{error.path}: {error.message}</div>)}
            </div>
          )}
          {studioOpen ? <StudioModal onClose={() => setStudioOpen(false)} copilotEnabled={snapshot.copilot.enabled} runCopilotStage={(input) => manager.runCopilotStage(input)} /> : null}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={snapshot.copilot.enabled} onChange={(event) => manager.setCopilotSettings({ enabled: event.target.checked })} />
            <span>Enable story copilot (authoring tab + in-play driver)</span>
          </label>
          <div className="flex flex-col gap-2 border-t border-solid border-white/10 pt-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={snapshot.extraction.settings.enabled} onChange={(event) => manager.setExtractionSettings({ enabled: event.target.checked })} />
              <span>Enable shared read extraction</span>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>Memory LLM profile</span>
              <select value={snapshot.extraction.settings.profileId ?? ""} onChange={(event) => manager.setExtractionSettings({ profileId: event.target.value || null })}>
                <option value="">No profile selected</option>
                {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}{profile.model ? ` (${profile.model})` : ""}</option>)}
              </select>
            </label>
            <details className="text-sm">
              <summary className="cursor-pointer opacity-80">Advanced</summary>
              <div className="grid grid-cols-2 gap-2 pt-2">
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
            {snapshot.extraction.settings.enabled && !snapshot.extraction.settings.profileId && <div className="text-xs text-yellow-300">Select a model profile above, or the story cannot advance on its own.</div>}
          </div>
          <div className="flex flex-col gap-2 border-t border-solid border-white/10 pt-2">
            <div className="font-medium text-sm">Display</div>
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
            <div className="font-medium text-sm">Group chat</div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={snapshot.talk.enabled} onChange={(event) => manager.setTalkDirectionEnabled(event.target.checked)} />
              <span>Speaker direction <HelpTooltip title="Let checkpoints with talk control decide who speaks next in group chats: name mentions win, then the LLM director, then weighted rules. Swipes, quiet passes, and explicit /trigger are never affected." /></span>
            </label>
          </div>
          <div className="flex flex-col gap-2 border-t border-solid border-white/10 pt-2">
            <div className="font-medium text-sm">Pacing</div>
            <label className="flex flex-col gap-1 text-sm">
              <span>Dramatic shape</span>
              <select value={typeof snapshot.pacing.shapeOverride === "string" ? snapshot.pacing.shapeOverride : ""} onChange={(event) => manager.setPacingSettings({ shapeOverride: isArcTemplateName(event.target.value) ? event.target.value : null })}>
                <option value="">Use story default</option>
                <option value="rising">Rising to climax</option>
                <option value="fall_recovery">Fall then recovery</option>
                <option value="three_act">Three act</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label className="flex flex-col gap-1">
                <span>Smoothing α <HelpTooltip title="How quickly the measured tension follows the latest scene. Higher = jumpier, lower = smoother." /></span>
                <input type="number" min={0} max={1} step={0.05} value={snapshot.pacing.alpha} onChange={(event) => manager.setPacingSettings({ alpha: Math.min(1, Math.max(0, Number(event.target.value) || 0)) })} />
              </label>
              <label className="flex items-center gap-2 mt-5">
                <input type="checkbox" checked={snapshot.pacing.hintEnabled} onChange={(event) => manager.setPacingSettings({ hintEnabled: event.target.checked })} />
                <span>Steering hint <HelpTooltip title="Quietly nudge the main model toward the story's intended tension (escalate or cool down) via an injected note." /></span>
              </label>
            </div>
          </div>
          <div className="text-xs opacity-80">{snapshot.status}</div>
        </div>
      </div>
    </div>
  );
};

const DrawerPanel = () => {
  const snapshot = useRuntimeSnapshot();
  return (
    <div className="p-2 text-sm flex flex-col gap-3 text-left">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">{snapshot.storyTitle ?? "Story Orchestrator"}</div>
          <div className="text-xs opacity-70">{snapshot.storyDescription ?? "Load a story from the extension settings."}</div>
        </div>
        {snapshot.ready && (
          <label className="flex items-center gap-1 text-xs whitespace-nowrap" title="Show gates, blackboard, scheduler and payload debugging. Spoils upcoming story branches.">
            <input type="checkbox" checked={snapshot.ui.authorView} onChange={(event) => manager.setUiSettings({ authorView: event.target.checked })} />
            <span>Author view</span>
          </label>
        )}
      </div>
      {snapshot.ready && (
        <DrawerTabs
          snapshot={snapshot}
          manager={manager}
          driver={{ context: manager.getDriverContext(), activeNudge: manager.getActiveNudge(), controller: driverController }}
        />
      )}
    </div>
  );
};

const openSoDrawer = () => {
  const toggle = document.querySelector<HTMLElement>("#so-drawer .drawer-toggle");
  const content = document.getElementById("drawer-manager");
  if (toggle && content && !content.classList.contains("openDrawer")) toggleNavbarDrawer(toggle);
};

const HudMount = () => {
  const snapshot = useRuntimeSnapshot();
  return <HudStrip snapshot={snapshot} onOpenDrawer={openSoDrawer} />;
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

const mount = (attempt = 0) => {
  const settingsRootContainer = document.getElementById("extensions_settings");
  if (settingsRootContainer && !document.getElementById("story-orchestrator-settings")) {
    const settingsRootElement = document.createElement("div");
    settingsRootContainer.appendChild(settingsRootElement);
    ReactDOM.createRoot(settingsRootElement).render(<SettingsPanel />);
  }

  const drawerMounted = mountTopBarDrawer();
  const hudMounted = mountHud();

  if ((!settingsRootContainer || !drawerMounted || !hudMounted) && attempt < 50) {
    window.setTimeout(() => mount(attempt + 1), 100);
  }
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => mount(), { once: true });
} else {
  window.setTimeout(mount, 0);
}
