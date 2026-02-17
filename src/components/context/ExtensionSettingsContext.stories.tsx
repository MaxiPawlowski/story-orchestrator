import type { Meta, StoryObj } from "@storybook/react";
import { ExtensionSettingsProvider, useExtensionSettings } from "./ExtensionSettingsContext";

const Consumer = () => {
  const { arbiterPrompt, arbiterFrequency, fallbackPreset } = useExtensionSettings();
  return <div className="text-sm">{arbiterPrompt} | {arbiterFrequency} | {fallbackPreset ?? "none"}</div>;
};

const meta: Meta<typeof ExtensionSettingsProvider> = {
  title: "Context/ExtensionSettingsProvider",
  component: ExtensionSettingsProvider,
  render: () => (
    <ExtensionSettingsProvider>
      <Consumer />
    </ExtensionSettingsProvider>
  ),
};

export default meta;
type Story = StoryObj<typeof ExtensionSettingsProvider>;

export const Default: Story = {};
