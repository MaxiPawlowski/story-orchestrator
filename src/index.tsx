import { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { createPortal } from "react-dom";
import { StoryProvider } from "./components/context/StoryContext";
import { ExtensionSettingsProvider } from "@components/context/ExtensionSettingsContext";
import DrawerWrapper from "@components/drawer";
import SettingsWrapper from "@components/settings";
import "./styles.css";
import { getTalkControlInterceptor } from "@controllers/orchestratorManager";

if (typeof globalThis !== "undefined") {
  try {
    (globalThis as any).talkControlInterceptor = (chat: unknown, contextSize: number, abort: (immediate: boolean) => void, type: string) => {
      const interceptor = getTalkControlInterceptor();
      if (interceptor) {
        return interceptor(chat, contextSize, abort, type);
      }
    };
  } catch (err) {
    console.warn("[Story] Failed to register talk control interceptor", err);
  }
}

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
      console.error("[Story] Drawer manager root container not found");
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

  return createPortal(<DrawerWrapper />, drawerNode);
};

const AppRoot = () => {
  return (
    <ExtensionSettingsProvider>
      <StoryProvider>
        <SettingsWrapper />
        <DrawerPortal />
      </StoryProvider>
    </ExtensionSettingsProvider>
  );
};
setTimeout(() => {
  const settingsRoot = ReactDOM.createRoot(settingsRootElement);
  settingsRoot.render(<AppRoot />);
}, 2000);
