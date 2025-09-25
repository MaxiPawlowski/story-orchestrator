import React from "react";
import ReactDOM from "react-dom/client";
import { LoreManagerApp as DrawerManagerApp, SettingsApp } from "./Apps";
import { StoryProvider } from "./components/context/StoryContext";
import "./styles.css";

const settingsRootContainer = document.getElementById("extensions_settings");
const settingsRootElement = document.createElement("div");
let drawerInitialized = false;

if (!settingsRootContainer) {
  throw new Error("Settings root container not found");
}
settingsRootContainer.appendChild(settingsRootElement);

const settingsRoot = ReactDOM.createRoot(settingsRootElement);

setTimeout(() => {
  settingsRoot.render(
    <React.StrictMode>
      <SettingsApp />
    </React.StrictMode>
  );
}, 2000);



const initializeDrawer = () => {
  if (drawerInitialized) return;
  drawerInitialized = true;

  const drawerRootContainer = document.getElementById("movingDivs");
  const drawerRootElement = document.createElement("div");
  drawerRootElement.id = "drawer-manager";
  drawerRootElement.classList.add("drawer-content");
  drawerRootElement.classList.add("pinnedOpen");

  if (!drawerRootContainer) {
    throw new Error("Drawer manager root container not found");
  }

  drawerRootContainer.appendChild(drawerRootElement);
  const drawerRoot = ReactDOM.createRoot(drawerRootElement);

  drawerRoot.render(
    <StoryProvider>
      <React.StrictMode>
        <DrawerManagerApp />
      </React.StrictMode>
    </StoryProvider>
  );
}

setTimeout(() => {
  initializeDrawer();
}, 3000);


// eventSource.on(event_types.CHAT_CHANGED, initializeDrawer);