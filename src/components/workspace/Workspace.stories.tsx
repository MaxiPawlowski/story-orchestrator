import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import Workspace from "./Workspace";
import { resolveFeatures } from "@runtime/featureResolve";
import { defaultGlobalSettings } from "@runtime/settingsModel";
import type { RuntimeSnapshot } from "@runtime/types";
import type { RuntimeManager } from "@runtime/runtimeManager";
import type { SettingsHost } from "@components/settings/SettingsPanel";
import type { DrawerTabsProps } from "@components/drawer/DrawerTabs";

const global = defaultGlobalSettings();
const snapshot = {
  ready: true, storyTitle: "Test story", features: resolveFeatures(global, null), featureOverrides: {},
  stagecraftScope: [], extraction: { settings: global.extraction }, memory: { settings: global.memory },
  stagecraft: { settings: global.stagecraft }, ui: { authorView: false },
} as unknown as RuntimeSnapshot;
const meta: Meta<typeof Workspace> = {
  title: "Workspace/Workspace", component: Workspace,
  args: { intent: { context: "story", page: "features" }, snapshot,
    manager: { setFeatureOverride: fn(() => true) } as unknown as RuntimeManager,
    settingsHost: {} as SettingsHost, drawerProps: {} as DrawerTabsProps, onClose: fn() },
};
export default meta;
type Story = StoryObj<typeof Workspace>;
export const Desktop: Story = {};
export const Mobile: Story = { parameters: { viewport: { defaultViewport: "mobile1" } } };
