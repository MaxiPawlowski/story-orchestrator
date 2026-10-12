import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { FeaturePages } from "./FeaturePages";
import { resolveFeatures } from "@runtime/featureResolve";
import { defaultGlobalSettings } from "@runtime/settingsModel";
import type { RuntimeSnapshot } from "@runtime/types";
import type { RuntimeManager } from "@runtime/runtimeManager";
import type { StoryFeatureId } from "@engine/featurePolicy";
import "./workspace.css";

const snapshot = {
  ready: true, features: resolveFeatures(defaultGlobalSettings(), { features: { inner: "off" } }, { inner: { enabled: true } }),
  featureOverrides: { inner: { enabled: true } }, stagecraftScope: [], extraction: { settings: { profileId: "test-model" } }, ui: { authorView: false },
  stagecraft: { settings: defaultGlobalSettings().stagecraft, proposals: [] },
} as unknown as RuntimeSnapshot;
const manager = { setFeatureOverride: fn(() => true) } as unknown as RuntimeManager;
function Host() {
  const [selected, onSelect] = useState<StoryFeatureId>();
  return <div id="so-workspace-modal"><FeaturePages snapshot={snapshot} manager={manager} install={false}
    selected={selected} onSelect={onSelect} onConnections={fn()} /></div>;
}
const meta: Meta<typeof FeaturePages> = { title: "Workspace/FeaturePages", component: FeaturePages, render: () => <Host /> };
export default meta;
type Story = StoryObj<typeof FeaturePages>;
export const Desktop: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /Private inner voice/ }));
    await expect(canvas.getByText(/This chat re-enables/)).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Reset to story/default" }));
    expect(manager.setFeatureOverride).toHaveBeenCalledWith("inner", null);
  },
};
export const Mobile: Story = { ...Desktop, parameters: { viewport: { defaultViewport: "mobile1" } } };
