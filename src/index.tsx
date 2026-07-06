import { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { listConnectionProfiles } from "@services/STAPI";
import { isArcTemplateName } from "@pacing/index";
import { startRuntime } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import StudioModal from "./studio/StudioModal";
import { type DriverController } from "./studio/components/DriverPanel";
import DrawerTabs from "./components/drawer/DrawerTabs";
import { useDraftStore, type StoryDraft } from "./studio/draft";
import "./styles.css";

const manager = startRuntime();

if (typeof globalThis !== "undefined") {
  globalThis.talkControlInterceptor = () => undefined;
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

  const openStudio = () => {
    const active = snapshot.library.find((story) => story.hash === snapshot.storyHash);
    const store = useDraftStore.getState();
    if (active) store.loadDraft(active.raw as StoryDraft, active.hash);
    else store.newDraft();
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

  const memorizeChat = async () => {
    setBusy(true);
    await manager.runMemorizeBacklog();
    setBusy(false);
  };

  return (
    <div id="stepthink_settings">
      <div className="inline-drawer">
        <div className="inline-drawer-toggle inline-drawer-header flex items-center justify-between">
          <b>Story Orchestrator</b>
        </div>
        <div className="inline-drawer-content px-3 py-2 !flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span>Story</span>
            <select id="story-library-select" value={snapshot.storyHash ?? ""} disabled={busy} onChange={(event) => void selectStory(event.target.value)}>
              <option value="">Select a v2 story</option>
              {snapshot.library.map((story) => <option key={story.hash} value={story.hash}>{story.title}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Import format-2 JSON</span>
            <textarea className="text_pole" rows={6} value={importText} onChange={(event) => setImportText(event.target.value)} placeholder="Paste story JSON" />
          </label>
          <div className="flex items-center gap-2">
            <button className="menu_button" disabled={busy || !importText.trim()} onClick={() => void importStory()}>Import and Load</button>
            <button id="so-open-studio" className="menu_button" onClick={openStudio}>Open Studio</button>
          </div>
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
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label className="flex flex-col gap-1">
                <span>Cadence</span>
                <input type="number" min={1} value={snapshot.extraction.settings.cadence} onChange={(event) => manager.setExtractionSettings({ cadence: Math.max(1, Number(event.target.value) || 1) })} />
              </label>
              <label className="flex flex-col gap-1">
                <span>Reconcile ×</span>
                <input type="number" min={1} step={0.1} value={snapshot.extraction.settings.reconciliationMultiplier} onChange={(event) => manager.setExtractionSettings({ reconciliationMultiplier: Math.max(1, Number(event.target.value) || 1) })} />
              </label>
              <label className="flex flex-col gap-1">
                <span>Lag</span>
                <input type="number" min={0} value={snapshot.extraction.settings.stabilityLag} onChange={(event) => manager.setExtractionSettings({ stabilityLag: Math.max(0, Number(event.target.value) || 0) })} />
              </label>
            </div>
            {snapshot.extraction.settings.enabled && !snapshot.extraction.settings.profileId && <div className="text-xs text-yellow-300">Select a Connection Manager profile, or extraction stays paused outside debug runs.</div>}
          </div>
          <div className="flex flex-col gap-2 border-t border-solid border-white/10 pt-2">
            <div className="font-medium text-sm">Memory</div>
            <button className="menu_button" disabled={busy || !snapshot.ready || snapshot.memory.backfill?.running} onClick={() => void memorizeChat()}>Memorize Chat</button>
            {snapshot.memory.backfill?.running && <div className="text-xs opacity-80">Backfilling {snapshot.memory.backfill.processed}/{snapshot.memory.backfill.total}…</div>}
            {snapshot.memory.backfill?.lastError && <div className="text-xs text-red-400">{snapshot.memory.backfill.lastError}</div>}
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
                <span>Smoothing α</span>
                <input type="number" min={0} max={1} step={0.05} value={snapshot.pacing.alpha} onChange={(event) => manager.setPacingSettings({ alpha: Math.min(1, Math.max(0, Number(event.target.value) || 0)) })} />
              </label>
              <label className="flex items-center gap-2 mt-5">
                <input type="checkbox" checked={snapshot.pacing.hintEnabled} onChange={(event) => manager.setPacingSettings({ hintEnabled: event.target.checked })} />
                <span>Steering hint</span>
              </label>
            </div>
          </div>
          <div className="text-xs opacity-80">{snapshot.status}</div>
          {snapshot.validationErrors.length > 0 && (
            <div className="text-xs text-red-400">
              {snapshot.validationErrors.map((error) => <div key={`${error.path}:${error.message}`}>{error.path}: {error.message}</div>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const DrawerPanel = () => {
  const snapshot = useRuntimeSnapshot();
  return (
    <div id="drawer-manager" className="drawer-content pinnedOpen">
      <div className="p-2 text-sm flex flex-col gap-3">
        <div>
          <div className="font-semibold">{snapshot.storyTitle ?? "Story Orchestrator v2"}</div>
          <div className="text-xs opacity-70">{snapshot.storyDescription ?? "Load a format-2 story from settings."}</div>
        </div>
        {snapshot.ready && (
          <DrawerTabs
            snapshot={snapshot}
            manager={manager}
            driver={{ context: manager.getDriverContext(), activeNudge: manager.getActiveNudge(), controller: driverController }}
          />
        )}
      </div>
    </div>
  );
};

const mount = (attempt = 0) => {
  const settingsRootContainer = document.getElementById("extensions_settings");
  if (settingsRootContainer && !document.getElementById("stepthink_settings")) {
    const settingsRootElement = document.createElement("div");
    settingsRootContainer.appendChild(settingsRootElement);
    ReactDOM.createRoot(settingsRootElement).render(<SettingsPanel />);
  }

  const drawerRootContainer = document.getElementById("movingDivs");
  if (drawerRootContainer && !document.getElementById("drawer-manager")) {
    const drawerRootElement = document.createElement("div");
    drawerRootContainer.appendChild(drawerRootElement);
    ReactDOM.createRoot(drawerRootElement).render(<DrawerPanel />);
  }

  if ((!settingsRootContainer || !drawerRootContainer) && attempt < 50) {
    window.setTimeout(() => mount(attempt + 1), 100);
  }
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => mount(), { once: true });
} else {
  window.setTimeout(mount, 0);
}
