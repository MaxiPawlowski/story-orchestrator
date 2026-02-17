import type { Meta, StoryObj } from "@storybook/react";
import StoryContext from "@components/context/StoryContext";
import DrawerWrapper from "./index";
import { mockStoryContextValue } from "@components/stories/storybookMocks";

const meta: Meta<typeof DrawerWrapper> = {
  title: "Drawer/DrawerWrapper",
  component: DrawerWrapper,
  decorators: [
    (Story) => (
      <StoryContext.Provider value={mockStoryContextValue}>
        <div id="drawer-manager" className="pinnedOpen"><Story /></div>
      </StoryContext.Provider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof DrawerWrapper>;

export const Default: Story = {};
