import { createElement } from "react";
import type { Decorator, Preview } from "@storybook/react";
import "./st-theme.css";
import "../src/styles.css";

export const mountRootFor = (title: string) => {
  if (title.startsWith("Workspace/")) return "so-workspace-root";
  if (title.startsWith("Tour/")) return "so-coach-root";
  if (title === "Drawer/HudStrip" || title === "Drawer/HudCard") return "so-hud-root";
  if (title.startsWith("Drawer/")) return "drawer-manager";
  if (title.startsWith("Settings/")) return "story-orchestrator-settings";
  if (title.startsWith("Sprites/")) return "so-vn-root";
  if (title.startsWith("Image/Review")) return "so-image-review-root";
  if (title.startsWith("Briefing/")) return "so-briefing-root";
  if (title.startsWith("Panels/")) return "so-panels-root";
  if (title.startsWith("Kit/")) return "so-panels-root";
  return "so-studio-root";
};

const STUDIO_OWN_DIALOG = new Set(["Studio/StudioModal"]);
const OWN_ROOT = new Set(["Settings/SettingsPanel"]);

const withMountRoot: Decorator = (Story, context) => {
  if (context.title.startsWith("Inline/")) {
    return createElement("div", { id: "chat" }, createElement("div", { id: "so-inline-0", className: "so-inline-host" }, createElement(Story)));
  }
  if (OWN_ROOT.has(context.title)) return createElement(Story);
  const root = mountRootFor(context.title);
  if (root === "so-studio-root" && !STUDIO_OWN_DIALOG.has(context.title)) {
    return createElement("div", { id: root },
      createElement("div", { id: "so-studio-modal", "data-so": "story-studio-frame" }, createElement("div", { role: "tabpanel", "aria-label": "Story" }, createElement(Story))));
  }
  return createElement("div", { id: root }, createElement(Story));
};

export const THEMES = ["st-dark", "light", "macaron"] as const;

const withTheme: Decorator = (Story, context) => {
  const theme = THEMES.includes(context.globals.soTheme) ? context.globals.soTheme : "st-dark";
  if (theme === "st-dark") delete document.documentElement.dataset.soTheme;
  else document.documentElement.dataset.soTheme = theme;
  return createElement(Story);
};

const preview: Preview = {
  decorators: [withMountRoot, withTheme],
  globalTypes: {
    soTheme: {
      description: "SillyTavern theme",
      toolbar: {
        title: "Theme",
        icon: "paintbrush",
        items: [{ value: "st-dark", title: "ST default (dark)" }, { value: "light", title: "Light palette" }, { value: "macaron", title: "Celestial Macaron (dark)" }],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { soTheme: "st-dark" },
  parameters: {
    actions: { argTypesRegex: "^on[A-Z].*" },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
