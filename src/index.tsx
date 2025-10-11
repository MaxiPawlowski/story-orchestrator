import { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { createPortal } from "react-dom";
import { LoreManagerApp as DrawerManagerApp, SettingsApp } from "./Apps";
import { StoryProvider } from "./components/context/StoryContext";
import "./styles.css";

const settingsRootContainer = document.getElementById("extensions_settings");
if (!settingsRootContainer) {
  throw new Error("Settings root container not found");
}

const settingsRootElement = document.createElement("div");
settingsRootContainer.appendChild(settingsRootElement);

const DrawerPortal = () => {
  const [drawerNode, setDrawerNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const drawerRootContainer = document.getElementById("movingDivs");

    if (!drawerRootContainer) {
      console.error("Drawer manager root container not found");
      return;
    }

    const drawerRootElement = document.createElement("div");
    drawerRootElement.id = "drawer-manager";
    drawerRootElement.classList.add("drawer-content");
    drawerRootElement.classList.add("pinnedOpen");

    drawerRootContainer.appendChild(drawerRootElement);
    setDrawerNode(drawerRootElement);

    return () => {
      if (drawerRootContainer.contains(drawerRootElement)) {
        drawerRootContainer.removeChild(drawerRootElement);
      }
    };
  }, []);

  if (!drawerNode) {
    return null;
  }

  return createPortal(<DrawerManagerApp />, drawerNode);
};

const AppRoot = () => {
  return (
    <StoryProvider>
      <SettingsApp />
      <DrawerPortal />
    </StoryProvider>
  );
};
setTimeout(() => {
  const settingsRoot = ReactDOM.createRoot(settingsRootElement);
  settingsRoot.render(<AppRoot />);
}, 2000);