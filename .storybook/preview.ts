import { createElement } from "react";
import type { Decorator, Preview } from "@storybook/react";
import "./st-theme.css";
import "../src/styles.css";

const mountRootFor = (title: string) => {
  if (title === "Drawer/HudStrip") return "so-hud-root";
  if (title.startsWith("Drawer/")) return "drawer-manager";
  return "so-studio-root";
};

const withMountRoot: Decorator = (Story, context) => createElement("div", { id: mountRootFor(context.title) }, createElement(Story));

const preview: Preview = {
  decorators: [withMountRoot],
  parameters: {
    actions: { argTypesRegex: "^on[A-Z].*" },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      config: {
        rules: [{ id: "color-contrast", enabled: false }],
      },
    },
  },
};

export default preview;
