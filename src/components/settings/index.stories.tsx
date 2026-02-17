import type { Meta, StoryObj } from "@storybook/react";
import StoryContext from "@components/context/StoryContext";
import { ExtensionSettingsProvider } from "@components/context/ExtensionSettingsContext";
import SettingsWrapper from "./index";
import { mockStoryContextValue } from "@components/stories/storybookMocks";

const meta: Meta<typeof SettingsWrapper> = {
  title: "Settings/SettingsWrapper",
  component: SettingsWrapper,
  decorators: [
    (Story) => (
      <ExtensionSettingsProvider>
        <StoryContext.Provider value={mockStoryContextValue}>
          <Story />
        </StoryContext.Provider>
      </ExtensionSettingsProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof SettingsWrapper>;

export const Default: Story = {};
