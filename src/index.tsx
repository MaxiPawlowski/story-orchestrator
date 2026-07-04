import { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
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
            <div>
              <div className="font-medium mb-1">Blackboard</div>
              <table className="w-full text-xs">
                <thead><tr><th className="text-left">Key</th><th className="text-left">Value</th><th className="text-left">Source</th></tr></thead>
                <tbody>
                  {Object.entries(snapshot.blackboard).map(([key, value]) => (
                    <tr key={key}>
                      <td>{key}</td>
                      <td>{String(value)}</td>
                      <td>{snapshot.blackboardMeta[key]?.source}{snapshot.blackboardMeta[key]?.latched ? " locked" : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
