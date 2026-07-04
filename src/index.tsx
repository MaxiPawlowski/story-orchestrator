import ReactDOM from "react-dom/client";
import "./styles.css";

if (typeof globalThis !== "undefined") {
  globalThis.talkControlInterceptor = () => undefined;
}

const StatusPanel = () => (
  <div id="stepthink_settings">
    <div className="inline-drawer">
      <div className="inline-drawer-toggle inline-drawer-header flex items-center justify-between">
        <b>Story Orchestrator</b>
      </div>
      <div className="inline-drawer-content px-3 py-2 !flex flex-col gap-2">
        <p className="text-sm">v2 engine core installed.</p>
        <p className="text-xs opacity-70">Runtime, persistence, extraction, and Studio v2 land in later phases.</p>
      </div>
    </div>
  </div>
);

const DrawerPanel = () => (
  <div id="drawer-manager" className="drawer-content pinnedOpen">
    <div className="p-2 text-sm">Story Orchestrator v2 engine installed.</div>
  </div>
);

const mount = (attempt = 0) => {
  const settingsRootContainer = document.getElementById("extensions_settings");
  if (settingsRootContainer && !document.getElementById("stepthink_settings")) {
    const settingsRootElement = document.createElement("div");
    settingsRootContainer.appendChild(settingsRootElement);
    ReactDOM.createRoot(settingsRootElement).render(<StatusPanel />);
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
