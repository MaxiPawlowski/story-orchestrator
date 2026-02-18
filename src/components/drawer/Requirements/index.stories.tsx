import type { Meta, StoryObj } from "@storybook/react";
import StoryContext from "@components/context/StoryContext";
import Requirements from "./index";
import { mockStoryContextValue } from "@components/stories/storybookMocks";

const meta: Meta<typeof Requirements> = {
  title: "Drawer/Requirements",
  component: Requirements,
  decorators: [
    (Story) => (
      <StoryContext.Provider value={mockStoryContextValue}>
        <div id="drawer-manager" className="pinnedOpen">
          <Story />
        </div>
      </StoryContext.Provider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Requirements>;

export const Default: Story = {};

export const MissingData: Story = {
  decorators: [
    (Story) => (
      <StoryContext.Provider
        value={{
          ...mockStoryContextValue,
          personaDefined: false,
          groupChatSelected: false,
          missingGroupMembers: ["Guide"],
          worldLoreEntriesPresent: false,
          worldLoreEntriesMissing: ["Ancient Gate"],
          globalLoreBookPresent: false,
          globalLoreBookMissing: ["Lorebook Alpha"],
        }}
      >
        <Story />
      </StoryContext.Provider>
    ),
  ],
};
