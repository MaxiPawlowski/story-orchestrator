import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { FeaturePolicyFields } from "./FeaturePolicyFields";
import { resolveFeatures } from "@runtime/featureResolve";
import { defaultGlobalSettings } from "@runtime/settingsModel";
import "./workspace.css";

const meta: Meta<typeof FeaturePolicyFields> = {
  title: "Workspace/FeaturePolicyFields", component: FeaturePolicyFields,
  args: { feature: "inner", resolved: resolveFeatures(defaultGlobalSettings(), null).inner, onChange: fn() },
  decorators: [(Story) => <div id="so-workspace-modal"><Story /></div>],
};
export default meta;
type Story = StoryObj<typeof FeaturePolicyFields>;
export const Desktop: Story = {};
export const Mobile: Story = { parameters: { viewport: { defaultViewport: "mobile1" } } };
export const Declined: Story = { args: { resolved: resolveFeatures(defaultGlobalSettings(), { features: { inner: "off" } }).inner } };
