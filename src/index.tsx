import { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { listConnectionProfiles } from "@services/STAPI";
import { isArcTemplateName } from "@pacing/index";
import { startRuntime } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import "./styles.css";

const manager = startRuntime();

if (typeof globalThis !== "undefined") {
  globalThis.talkControlInterceptor = () => undefined;
  globalThis.storyOrchestratorRuntime = manager;
}

const useRuntimeSnapshot = () => {
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot>(() => manager.getSnapshot());
  useEffect(() => {
    const unsubscribe = manager.subscribe(() => setSnapshot(manager.getSnapshot()));
    return () => { unsubscribe(); };
  }, []);
  return snapshot;
};

const StatusDot = ({ ok }: { ok: boolean }) => <span className={`status-indicator status-${ok ? "success" : "error"}`} />;

const SettingsPanel = () => {
  const snapshot = useRuntimeSnapshot();
  const [importText, setImportText] = useState("");
  const [busy, setBusy] = useState(false);
  const profiles = listConnectionProfiles();

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
          <button className="menu_button" disabled={busy || !importText.trim()} onClick={() => void importStory()}>Import and Load</button>
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

const Requirements = ({ snapshot }: { snapshot: RuntimeSnapshot }) => {
  const items = [
    { label: "Persona", missing: snapshot.requirements.missingPersonas },
    { label: "Group", missing: snapshot.requirements.missingMembers },
    { label: "Lore", missing: snapshot.requirements.missingLorebooks },
  ];
  return (
    <div className="flex flex-col gap-1">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-1">
          <div className="flex items-center gap-2"><StatusDot ok={item.missing.length === 0} /><span>{item.label}</span></div>
          {item.missing.length > 0 && <div className="text-xs opacity-80">Missing: {item.missing.join(", ")}</div>}
        </div>
      ))}
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
          <>
            <div className="checkpoints-wrapper flex flex-col gap-1">
              <div className="font-medium">Checkpoint</div>
              <div className="st-checkpoint-row status-current">
                <div className="font-semibold">{snapshot.activeCheckpointName}</div>
                <div className="text-sm opacity-80">{snapshot.activeObjective}</div>
                <div className="text-xs opacity-70">Boundary {snapshot.boundary}</div>
              </div>
            </div>
            <Requirements snapshot={snapshot} />
            <div className="flex flex-col gap-1">
              <div className="font-medium">Tension</div>
              <div className="text-xs opacity-80">
                <div>Level: {snapshot.tension.level ?? "—"} {snapshot.tension.smoothed !== null && <span>({snapshot.tension.smoothed.toFixed(2)})</span>}</div>
                <div>Expected: {snapshot.tension.expected !== null ? snapshot.tension.expected.toFixed(2) : "—"}</div>
                {snapshot.tension.hint && <div className="opacity-100">Steering: {snapshot.tension.hint.direction} — {snapshot.tension.hint.text}</div>}
              </div>
            </div>
            <div>
              <div className="font-medium mb-1">Blackboard</div>
              <table className="w-full text-xs">
                <thead><tr><th className="text-left">Key</th><th className="text-left">Value</th><th className="text-left">Source</th></tr></thead>
                <tbody>
                  {Object.entries(snapshot.blackboard).map(([key, value]) => (
                    <tr key={key}>
                      <td>{key}</td>
                      <td>{String(value)}</td>
                      <td title={snapshot.blackboardMeta[key]?.evidence ?? ""}>{snapshot.blackboardMeta[key]?.source}{snapshot.blackboardMeta[key]?.latched ? " locked" : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-xs opacity-80">
              <div className="font-medium opacity-100">Extraction</div>
              <div>Queue {snapshot.extraction.scheduler.queueDepth}, in flight {snapshot.extraction.scheduler.inFlight ? "yes" : "no"}</div>
              <div>Last read boundary {snapshot.extraction.lastReadBoundary}</div>
              {snapshot.extraction.scheduler.lastError && <div className="text-red-300">{snapshot.extraction.scheduler.lastError}</div>}
              {snapshot.extraction.audits[0] && <div>Last scope: {snapshot.extraction.audits[snapshot.extraction.audits.length - 1]?.scope.join(", ") || "none"}</div>}
            </div>
            <div className="text-xs opacity-80">
              <div className="font-medium opacity-100">Expansion</div>
              <div>Queue {snapshot.expansion.scheduler.queueDepth}, in flight {snapshot.expansion.scheduler.inFlight ? "yes" : "no"}</div>
              {snapshot.expansion.scheduler.lastError && <div className="text-red-300">{snapshot.expansion.scheduler.lastError}</div>}
              {Object.values(snapshot.expansion.entries).map((entry) => (
                <div key={entry.key} className="border-t border-solid border-white/10 mt-1 pt-1">
                  <div>{entry.stubId} → {entry.targetAnchorId}: {entry.status}{entry.needsReview ? " review" : ""}</div>
                  <div>{entry.beats.length} beats{entry.lastError ? ` — ${entry.lastError}` : ""}</div>
                  {entry.beats.slice(0, 3).map((beat) => <div key={beat.objective}>- {beat.objective}</div>)}
                </div>
              ))}
            </div>
          </>
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
